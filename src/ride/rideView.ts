/**
 * Sortie en cours : assemble le monde 3D, la physique, les capteurs, l'enregistrement
 * et le tableau de bord. C'est la « boucle de jeu » appelée à chaque image.
 *
 * Deux modes :
 *  - parcours GPX : tracé fixe, du départ à l'arrivée ;
 *  - trajet libre : on roule où l'on veut sur le réseau routier réel, en choisissant
 *    sa direction à chaque carrefour (← / →) ou en faisant demi-tour (U).
 */
import * as THREE from 'three';
import type { View } from '../render/engine';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RiderModel } from '../render/riderModel';
import { aiLook } from './ai/looks';
import { lookFromProfile } from '../render/look';
import { CameraRig, CAM_MODES, type CamMode } from '../render/cameras';
import { RouteIndex, emptySample, SURFACES, type Route, type RouteSample } from '../geo/route';
import type { Track } from '../geo/track';
import { LocalProjection } from '../geo/projection';
import { fetchRouteElevation } from '../geo/ign';
import { WorldStreamer } from '../world/streamer';
import { RouteMesh } from '../world/routeMesh';
import { RoadNetwork } from '../world/roads';
import { Landmarks } from '../world/landmarks';
import { OpenPath } from './openPath';
import { RiderDynamics, buildParams, airDensity, crrFor, type PhysicsParams } from '../physics/model';
import { GearBox, virtualFactor, cadenceFor } from '../physics/gears';
import { simulationParams } from '../physics/trainerSim';
import type { DeviceManager } from '../devices/manager';
import { Recorder, type RideSummary, type Sample } from './recorder';
import { Hud } from '../ui/hud';
import type { Profile } from '../storage/store';
import type { QualityPreset } from '../config';
import { t, type I18nKey } from '../i18n';

export type RideState = 'loading' | 'riding' | 'paused' | 'finished';

export type RideSource =
  | { kind: 'gpx'; route: Route }
  | { kind: 'open'; name: string; lat: number; lon: number };

export interface RideCallbacks {
  onPauseMenu(): void;
  onFinish(summary: RideSummary, samples: Sample[]): void;
}

/** Tracé provisoire du trajet libre : le point de départ, le temps de charger les routes. */
class StartPoint implements Track {
  readonly open = true;
  readonly length = Infinity;
  constructor(readonly name: string, readonly proj: LocalProjection) {}
  sampleAt(d: number, out: RouteSample = emptySample()): RouteSample {
    out.x = 0;
    out.z = 0;
    out.dist = d;
    out.lat = this.proj.lat0;
    out.lon = this.proj.lon0;
    return out;
  }
}

export class RideView implements View {
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }
  state: RideState = 'loading';
  dist = 0;
  elapsed = 0;
  /** transmission virtuelle (si le changement de vitesse virtuel est actif) */
  readonly gears: GearBox;

  private track: Track;
  private route: Route | null = null;
  private path: OpenPath | null = null;
  private net: RoadNetwork;
  private index: RouteIndex | null = null;
  private world!: WorldStreamer;
  private routeMesh: RouteMesh | null = null;
  private landmarks: Landmarks;
  private rider: RiderModel;
  private dyn: RiderDynamics;
  private params: PhysicsParams;
  private recorder = new Recorder();
  private hud: Hud | null = null;
  private sky: Sky;
  private sun: THREE.DirectionalLight;
  /** direction du soleil (vers le soleil) */
  private sunDir = new THREE.Vector3(-0.45, 0.62, 0.35).normalize();
  /** halo léger en extérieur (reflets du soleil sur les jantes, ciel) */
  readonly bloom = { strength: 0.18, radius: 0.4, threshold: 1.6 };
  readonly exposure = 0.78;
  private horizon = new THREE.Color('#b9d0e6');
  private sample = emptySample();
  private sample2 = emptySample();
  private preview: Array<{ model: RiderModel; offset: number; lateral: number }> = [];
  private power3: number[] = [];
  private live = { power: 0, cadence: 0, hr: 0, source: 'demo' as 'ble' | 'demo' };
  private trainerTimer = 0;
  private hudTimer = 0;
  private ascent = 0;
  private lastEle: number | null = null;
  private keyDown = (e: KeyboardEvent) => this.onKey(e, true);
  private keyUp = (e: KeyboardEvent) => this.onKey(e, false);

  constructor(
    private readonly source: RideSource,
    private readonly profile: Profile,
    private readonly devices: DeviceManager,
    private readonly q: QualityPreset,
    private readonly overlay: HTMLElement,
    private readonly cb: RideCallbacks,
  ) {
    const s = this.scene;
    // Ciel physique (diffusion de Rayleigh/Mie) : bleu profond en haut, horizon laiteux, soleil.
    this.sky = new Sky();
    const su = this.sky.material.uniforms;
    su.turbidity.value = 3.5;
    su.rayleigh.value = 2.4;
    su.mieCoefficient.value = 0.004;
    su.mieDirectionalG.value = 0.85;
    su.sunPosition.value.copy(this.sunDir);
    // Le ciel de three.js est calibré pour une exposition ≈ 0,5 : on l'atténue pour notre réglage.
    this.sky.material.fragmentShader = this.sky.material.fragmentShader.replace(
      'gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * 0.42, 1.0 );');
    this.sky.material.depthWrite = false;
    this.sky.material.depthTest = false;
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.sky.scale.setScalar(1000);
    s.add(this.sky);
    s.fog = new THREE.Fog(this.horizon, q.nearRadius * 0.9, q.farRadius * 1.05);
    s.background = this.horizon;
    s.add(new THREE.HemisphereLight('#bcd6ff', '#55613a', 0.85));
    // Soleil : il suit le cycliste pour que son ombre (et celle des IA) reste nette.
    this.sun = new THREE.DirectionalLight('#fff0d6', 2.4);
    if (q.rideShadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const c = this.sun.shadow.camera;
      c.left = -18; c.right = 18; c.top = 18; c.bottom = -18; c.near = 1; c.far = 200;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.04;
      this.sun.shadow.radius = 2;
    }
    s.add(this.sun, this.sun.target);
    // loin : les monuments (tour Eiffel vue de Cergy) sont à près de 30 km
    this.camera.far = 60000;
    this.camera.updateProjectionMatrix();

    if (source.kind === 'gpx') {
      this.route = source.route;
      this.track = source.route;
    } else {
      this.track = new StartPoint(source.name, new LocalProjection(source.lat, source.lon));
    }
    this.net = new RoadNetwork(this.track.proj);
    this.landmarks = new Landmarks(this.track.proj, this.horizon);
    s.add(this.landmarks.group);

    this.rider = new RiderModel(lookFromProfile(profile));
    this.rider.setBlobShadow(!q.rideShadows);
    s.add(this.rider.root);
    this.params = buildParams({
      weightKg: profile.weightKg, heightCm: profile.heightCm, frame: profile.frame, wheels: profile.wheels, kit: profile.kit,
    });
    this.dyn = new RiderDynamics(this.params);
    this.gears = new GearBox(profile.drivetrain);
  }

  get isOpen(): boolean {
    return this.source.kind === 'open';
  }

  /**
   * Préparation : altitude IGN (parcours GPX), monuments, premières tuiles du monde et,
   * en trajet libre, la route la plus proche du point de départ.
   */
  async prepare(onProgress: (step: I18nKey, p: number) => void): Promise<void> {
    if (this.route) {
      onProgress('load.elevation', 0);
      try {
        const ele = await fetchRouteElevation(this.route, (p) => onProgress('load.elevation', p));
        this.route.setElevation(ele, 'ign');
      } catch {
        // Hors connexion : on garde l'altitude du fichier GPX s'il en contient une.
      }
      this.index = new RouteIndex(this.route);
      this.routeMesh = new RouteMesh(this.route);
      this.scene.add(this.routeMesh.group);
    }
    onProgress('load.world', 0);
    await this.landmarks.load().catch(() => undefined);
    this.world = new WorldStreamer(this.track, this.index, this.q, {
      onRoads: (roads) => this.net.ingest(roads),
      onTileBuilt: (b) => this.matchSurfaces(b),
      exclusions: this.landmarks.exclusions,
    });
    this.scene.add(this.world.group);
    const start = this.track.sampleAt(0);
    this.world.update(start.x, start.z, 0, true);

    // Attente des tuiles autour du départ (au plus 40 s).
    const t0 = performance.now();
    const target = 4;
    await new Promise<void>((resolve) => {
      const tick = () => {
        this.world.update(start.x, start.z, 0);
        const ready = this.world.readyNear;
        onProgress('load.world', Math.min(1, ready / target));
        const roadOk = !this.isOpen || (this.world.hasNear(0, 0) && this.net.nearest(0, 0, 600));
        if ((ready >= target && roadOk) || performance.now() - t0 > 40000) resolve();
        else setTimeout(tick, 200);
      };
      tick();
    });
    if (this.source.kind === 'open') {
      const near = this.net.nearest(0, 0, 3000);
      if (!near) throw new Error(t('free.noRoad'));
      this.path = new OpenPath(this.net, this.track.proj, (x, z) => this.world.groundAt(x, z), { edge: near.edge, s: near.s, forward: true }, this.source.name);
      this.track = this.path;
      this.world.setTrack(this.path);
    }
    this.placeRider(0);
    this.routeMesh?.update(0);
    this.hud = new Hud(this.overlay, this.track, this.path ? { net: this.net, path: this.path } : null);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    this.state = 'riding';
  }

  /** Parcours GPX : reconnaît le revêtement (bitume, gravier, terre) d'après les routes BD TOPO voisines. */
  private matchSurfaces(b: { x0: number; z0: number; x1: number; z1: number }): void {
    const r = this.route;
    if (!r) return;
    let changed = false;
    for (let i = 0; i < r.n; i++) {
      const x = r.x[i], z = r.z[i];
      if (x < b.x0 || x >= b.x1 || z < b.z0 || z >= b.z1) continue;
      const hit = this.net.nearest(x, z, 8);
      if (!hit) continue;
      const p = this.net.pointAt(hit.edge, hit.s);
      // la route BD TOPO doit aller dans le même sens que le tracé (pas une rue qui croise)
      if (Math.abs(p.dirX * r.dirX[i] + p.dirZ * r.dirZ[i]) < 0.7) continue;
      const code = SURFACES.indexOf(hit.edge.surface);
      if (r.surface[i] !== code) { r.surface[i] = code; changed = true; }
    }
    if (changed) this.routeMesh?.rebuild();
  }

  setCamera(m: CamMode): void {
    this.rig.setMode(m);
  }

  pause(): void {
    if (this.state === 'riding') this.state = 'paused';
  }

  resume(): void {
    if (this.state === 'paused') this.state = 'riding';
  }

  /** Termine la sortie et transmet le bilan. */
  finish(): void {
    if (this.state === 'finished') return;
    this.state = 'finished';
    const summary = this.recorder.summarize(this.track.name, this.profile.ftp);
    this.cb.onFinish(summary, this.recorder.samples);
  }

  /** Trajet libre : direction au prochain carrefour (−1 gauche, +1 droite). */
  turn(delta: number): void {
    this.path?.choose(this.dist, delta);
  }

  /** Trajet libre : demi-tour. */
  uTurn(): void {
    if (!this.path) return;
    this.path.uTurn(this.dist);
    this.dyn.v = Math.min(this.dyn.v, 2);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'b' || e.key === 'B') { this.rig.lookBack = down; return; }
    if (!down) return;
    // Vitesses virtuelles : touches réglables (manettes via BikeControl) + « + » et « - ».
    const p = this.profile;
    if (p.shifting === 'virtual') {
      if (e.key === p.keyGearUp || e.key === '+' || e.key === '=') { this.shift(1); e.preventDefault(); return; }
      if (e.key === p.keyGearDown || e.key === '-') { this.shift(-1); e.preventDefault(); return; }
      if (e.key === p.keyFront) { this.shiftFront(); e.preventDefault(); return; }
    }
    const step = e.shiftKey ? 50 : 10;
    switch (e.key) {
      case 'ArrowUp': this.devices.demoPower = Math.min(1500, this.devices.demoPower + step); e.preventDefault(); break;
      case 'ArrowDown': this.devices.demoPower = Math.max(0, this.devices.demoPower - step); e.preventDefault(); break;
      case 'ArrowLeft': this.turn(-1); e.preventDefault(); break;
      case 'ArrowRight': this.turn(1); e.preventDefault(); break;
      case 'u': case 'U': this.uTurn(); break;
      case 'c': case 'C': this.rig.next(); break;
      case 'h': case 'H': this.hud?.toggle(); break;
      case ' ': case 'p': case 'P': case 'Escape':
        e.preventDefault();
        this.pause();
        this.cb.onPauseMenu();
        break;
      default:
        if (e.key >= '1' && e.key <= '5') this.rig.setMode(CAM_MODES[Number(e.key) - 1]);
    }
  }

  /** Change de vitesse virtuelle (+1 plus dur, −1 plus souple) ; le trainer est mis à jour aussitôt. */
  shift(delta: number): void {
    if (this.profile.shifting !== 'virtual') return;
    this.gears.shift(delta);
    this.trainerTimer = 1;
  }

  /** Dérailleur avant (double plateau). */
  shiftFront(): void {
    if (this.profile.shifting !== 'virtual') return;
    this.gears.shiftFront();
    this.trainerTimer = 1;
  }

  /** Texte du rapport engagé, ou '' en changement de vitesse manuel. */
  get gearText(): string {
    return this.profile.shifting === 'virtual' ? `⚙ ${this.gears.label}` : '';
  }

  private placeRider(d: number): void {
    this.placeModel(this.rider, d, 0);
  }

  /**
   * Pose un avatar sur la route à la distance d. lateral : décalage en mètres vers la gauche
   * (+) ou la droite (−) par rapport à la file normale (droite de la chaussée).
   */
  private placeModel(model: RiderModel, d: number, lateral: number): void {
    const s = this.track.sampleAt(d, this.sample2);
    // on roule à droite de la chaussée (près de l'axe sur un sentier étroit)
    const width = this.path ? this.path.edgeAt(d).width : 6;
    const off = Math.max(0, Math.min(1.3, width / 2 - 0.7)) - lateral;
    model.root.position.set(s.x - s.dirZ * off, s.ele + 0.08, s.z + s.dirX * off);
    model.root.rotation.y = Math.atan2(-s.dirZ, s.dirX);
    model.setGrade(s.grade);
  }

  /** Aperçu (maquettes) : un groupe d'avatars IA posés autour du cycliste, qui pédalent. */
  previewGroup(n: number): void {
    for (let k = 0; k < n; k++) {
      const { look } = aiLook(k * 17 + 3, this.profile.appearance.style);
      const m = new RiderModel(look);
      m.setBlobShadow(!this.q.rideShadows);
      m.crankAngle = k * 1.3;
      this.scene.add(m.root);
      // deux files, en quinconce, devant et derrière le joueur
      const row = Math.floor(k / 2) - 2;
      this.preview.push({ model: m, offset: row * 2.1 + (k % 2) * 0.9 + 1.2, lateral: k % 2 ? 0.75 : 0 });
    }
  }

  update(dt: number): void {
    if (this.state === 'loading') {
      if (this.world) {
        const s = this.track.sampleAt(0);
        this.world.update(s.x, s.z, 0);
      }
      this.rig.update(dt, this.camContext());
      this.sky.position.copy(this.camera.position);
      return;
    }
    const p = this.profile;
    this.path?.update(this.dist);
    this.live = this.devices.read(dt, p.ftp, p.hrMax);
    if (this.live.source === 'demo' && p.shifting === 'virtual') {
      // en démo, la cadence découle de la vitesse et du rapport engagé (roue libre si 0 W)
      this.live.cadence = this.live.power > 0 ? Math.min(140, cadenceFor(this.dyn.v, this.gears.development)) : 0;
    }
    const moving = this.state === 'riding';
    const s = this.track.sampleAt(this.dist, this.sample);
    if (moving) {
      const conds = {
        grade: s.grade,
        headwind: 0,
        rho: airDensity(s.ele, 15),
        crr: crrFor(p.frame, s.surface),
        draft: 1,
      };
      const v = this.dyn.step(dt, this.live.power, conds, s.vmax);
      this.dist = Math.min(this.track.length, this.dist + v * dt);
      // Le chronomètre tourne dès qu'on roule ou qu'on pédale.
      if (v > 0.3 || this.live.power > 0) {
        this.elapsed += dt;
        this.recorder.tick(dt, {
          dist: this.dist, lat: s.lat, lon: s.lon, ele: s.ele, speed: v,
          power: this.live.power, cadence: this.live.cadence, hr: this.live.hr,
        });
      }
      if (this.lastEle !== null && s.ele > this.lastEle && s.ele - this.lastEle < 5) this.ascent += s.ele - this.lastEle;
      this.lastEle = s.ele;
      this.driveTrainer(dt, conds.rho, conds.crr, v);
      if (!this.track.open && this.dist >= this.track.length - 0.5) this.finish();
    }
    this.power3.push(this.live.power);
    const maxLen = Math.max(1, Math.round(3 / Math.max(dt, 1 / 120)));
    while (this.power3.length > maxLen) this.power3.shift();

    this.placeRider(this.dist);
    this.rider.update(dt, moving ? this.live.cadence : 0, moving ? this.dyn.v : 0);
    for (const p of this.preview) {
      this.placeModel(p.model, this.dist + p.offset, p.lateral);
      p.model.update(dt, 86, this.dyn.v);
    }
    this.world.update(this.rider.root.position.x, this.rider.root.position.z, this.dist);
    this.routeMesh?.update(this.dist);
    this.rig.update(dt, this.camContext());
    this.sky.position.copy(this.camera.position);
    this.landmarks.update(this.camera.position);
    const rp = this.rider.root.position;
    this.sun.target.position.copy(rp);
    this.sun.position.copy(rp).addScaledVector(this.sunDir, 80);

    this.hudTimer += dt;
    if (this.hud && this.hudTimer > 0.1) {
      this.hudTimer = 0;
      const tr = this.devices.sensors.trainer;
      const hrs = this.devices.sensors.hr;
      this.hud.update({
        power: this.live.power,
        power3s: this.power3.reduce((a, b) => a + b, 0) / this.power3.length,
        weightKg: p.weightKg, ftp: p.ftp,
        speed: this.dyn.v, cadence: this.live.cadence, hr: this.live.hr, hrMax: p.hrMax,
        dist: this.dist, elapsed: this.elapsed, ascent: this.ascent,
        grade: s.grade, ele: s.ele, braking: this.dyn.braking,
        demo: this.live.source === 'demo',
        camera: t(`cam.${this.rig.mode}` as I18nKey),
        trainer: tr ? `🚲 ${tr.status === 'connected' ? (this.devices.trainer ? 'SIM' : 'W') : '…'}` : '',
        hrSensor: hrs ? `♥ ${hrs.status === 'connected' ? '' : '…'}` : '',
        gear: this.gearText,
        surface: s.surface,
        heading: Math.atan2(s.dirZ, s.dirX),
        x: s.x,
        z: s.z,
      });
    }
  }

  /**
   * Mode SIM : une fois par seconde (et aussitôt après un changement de vitesse), on envoie
   * au trainer la pente qui arrive (multipliée par la « difficulté du trainer »), le Crr et
   * la résistance de l'air. En vitesses virtuelles, ces valeurs sont converties pour que
   * l'effort ressenti corresponde au braquet virtuel engagé (voir physics/trainerSim.ts).
   */
  private driveTrainer(dt: number, rho: number, crr: number, v: number): void {
    this.trainerTimer += dt;
    const tr = this.devices.trainer;
    if (!tr || this.trainerTimer < 1) return;
    this.trainerTimer = 0;
    const p = this.profile;
    const ahead = this.track.sampleAt(this.dist + Math.max(5, v * 1.5));
    const k = p.shifting === 'virtual' ? virtualFactor(this.gears, p.chainring, p.cogTeeth) : 1;
    const sim = simulationParams({
      grade: ahead.grade, crr, cw: 0.5 * rho * this.params.cda, headwind: 0,
      difficulty: p.trainerDifficulty, k,
    });
    tr.setSimulation(sim.grade, sim.crr, sim.cw, sim.wind).catch(() => undefined);
  }

  private camContext() {
    return {
      rider: this.rider,
      route: this.track,
      dist: this.dist,
      groundAt: (x: number, z: number) => this.world?.groundAt(x, z) ?? null,
      blocked: (a: THREE.Vector3, b: THREE.Vector3) => this.world?.blocked(a, b) ?? false,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    this.hud?.dispose();
    this.world?.disposeAll();
    this.routeMesh?.dispose();
    this.landmarks.dispose();
    this.rider.dispose();
  }
}
