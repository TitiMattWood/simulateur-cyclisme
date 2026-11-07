/**
 * Sortie en cours : assemble le monde 3D, la physique, les capteurs, l'enregistrement
 * et le tableau de bord. C'est la « boucle de jeu » appelée à chaque image.
 */
import * as THREE from 'three';
import type { View } from '../render/engine';
import { createSky } from '../render/engine';
import { RiderModel } from '../render/riderModel';
import { CameraRig, CAM_MODES, type CamMode } from '../render/cameras';
import { RouteIndex, emptySample, type Route } from '../geo/route';
import { fetchRouteElevation } from '../geo/ign';
import { WorldStreamer } from '../world/streamer';
import { RouteMesh } from '../world/routeMesh';
import { RiderDynamics, buildParams, airDensity, crrFor, type PhysicsParams } from '../physics/model';
import type { DeviceManager } from '../devices/manager';
import { Recorder, type RideSummary, type Sample } from './recorder';
import { Hud } from '../ui/hud';
import type { Profile } from '../storage/store';
import type { QualityPreset } from '../config';
import { t, type I18nKey } from '../i18n';

export type RideState = 'loading' | 'riding' | 'paused' | 'finished';

export interface RideCallbacks {
  onPauseMenu(): void;
  onFinish(summary: RideSummary, samples: Sample[]): void;
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

  private index!: RouteIndex;
  private world!: WorldStreamer;
  private routeMesh!: RouteMesh;
  private rider: RiderModel;
  private dyn: RiderDynamics;
  private params: PhysicsParams;
  private recorder = new Recorder();
  private hud: Hud | null = null;
  private sky: THREE.Mesh;
  private sample = emptySample();
  private power3: number[] = [];
  private live = { power: 0, cadence: 0, hr: 0, source: 'demo' as 'ble' | 'demo' };
  private trainerTimer = 0;
  private hudTimer = 0;
  private ascent = 0;
  private lastEle: number | null = null;
  private keyDown = (e: KeyboardEvent) => this.onKey(e, true);
  private keyUp = (e: KeyboardEvent) => this.onKey(e, false);

  constructor(
    private readonly route: Route,
    private readonly profile: Profile,
    private readonly devices: DeviceManager,
    private readonly q: QualityPreset,
    private readonly overlay: HTMLElement,
    private readonly cb: RideCallbacks,
  ) {
    const s = this.scene;
    const horizon = new THREE.Color('#cfe3f2');
    this.sky = createSky('#4f8fd6', horizon);
    s.add(this.sky);
    s.fog = new THREE.Fog(horizon, q.nearRadius * 0.9, q.farRadius * 1.05);
    s.background = horizon;
    s.add(new THREE.HemisphereLight('#d6ebff', '#5d6b3f', 1.05));
    const sun = new THREE.DirectionalLight('#fff1db', 1.9);
    sun.position.set(-0.5, 0.8, 0.35);
    s.add(sun);
    this.camera.far = q.farRadius * 1.6;
    this.camera.updateProjectionMatrix();

    this.rider = new RiderModel({
      heightCm: profile.heightCm, frame: profile.frame, wheels: profile.wheels,
      jerseyColor: profile.jerseyColor, jerseyColor2: profile.jerseyColor2, helmetColor: profile.helmetColor,
      highSocks: profile.kit.highSocks, aeroHelmet: profile.kit.aeroHelmet,
    });
    s.add(this.rider.root);
    this.params = buildParams({
      weightKg: profile.weightKg, heightCm: profile.heightCm, frame: profile.frame, wheels: profile.wheels, kit: profile.kit,
    });
    this.dyn = new RiderDynamics(this.params);
  }

  /**
   * Préparation : altitude IGN du parcours puis chargement des premières tuiles.
   * onProgress(étape, fraction) alimente l'écran de chargement.
   */
  async prepare(onProgress: (step: I18nKey, p: number) => void): Promise<void> {
    onProgress('load.elevation', 0);
    try {
      const ele = await fetchRouteElevation(this.route, (p) => onProgress('load.elevation', p));
      this.route.setElevation(ele, 'ign');
    } catch {
      // Hors connexion : on garde l'altitude du fichier GPX s'il en contient une.
    }
    this.index = new RouteIndex(this.route);
    this.world = new WorldStreamer(this.route, this.index, this.q);
    this.routeMesh = new RouteMesh(this.route);
    this.scene.add(this.world.group, this.routeMesh.group);
    this.placeRider(0);
    this.routeMesh.update(0);
    const start = this.route.sampleAt(0);
    this.world.update(start.x, start.z, 0, true);
    // Attente des tuiles autour du départ (au plus 30 s).
    const t0 = performance.now();
    const target = 4;
    await new Promise<void>((resolve) => {
      const tick = () => {
        const ready = this.world.readyNear;
        onProgress('load.world', Math.min(1, ready / target));
        if (ready >= target || performance.now() - t0 > 30000) resolve();
        else setTimeout(tick, 200);
      };
      tick();
    });
    this.hud = new Hud(this.overlay, this.route);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    this.state = 'riding';
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
    const summary = this.recorder.summarize(this.route.name, this.profile.ftp);
    this.cb.onFinish(summary, this.recorder.samples);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'b' || e.key === 'B') { this.rig.lookBack = down; return; }
    if (!down) return;
    const step = e.shiftKey ? 50 : 10;
    switch (e.key) {
      case 'ArrowUp': this.devices.demoPower = Math.min(1500, this.devices.demoPower + step); e.preventDefault(); break;
      case 'ArrowDown': this.devices.demoPower = Math.max(0, this.devices.demoPower - step); e.preventDefault(); break;
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

  private placeRider(d: number): void {
    const s = this.route.sampleAt(d, this.sample);
    // on roule à droite de la chaussée
    const off = 1.3;
    this.rider.root.position.set(s.x - s.dirZ * off, s.ele + 0.08, s.z + s.dirX * off);
    this.rider.root.rotation.y = Math.atan2(-s.dirZ, s.dirX);
    this.rider.setGrade(s.grade);
  }

  update(dt: number): void {
    if (this.state === 'loading') {
      if (this.world) this.world.update(this.rider.root.position.x, this.rider.root.position.z, this.dist);
      this.rig.update(dt, this.camContext());
      this.sky.position.copy(this.camera.position);
      return;
    }
    const p = this.profile;
    this.live = this.devices.read(dt, p.ftp, p.hrMax);
    const moving = this.state === 'riding';
    const s = this.route.sampleAt(this.dist, this.sample);
    if (moving) {
      const conds = {
        grade: s.grade,
        headwind: 0,
        rho: airDensity(s.ele, 15),
        crr: crrFor(p.frame, 'asphalt'),
        draft: 1,
      };
      const v = this.dyn.step(dt, this.live.power, conds, s.vmax);
      this.dist = Math.min(this.route.length, this.dist + v * dt);
      // Le chronomètre tourne dès qu'on roule ou qu'on pédale.
      if (v > 0.3 || this.live.power > 0) {
        this.elapsed += dt;
        this.recorder.tick(dt, {
          dist: this.dist, lat: s.lat, lon: s.lon, ele: s.ele, speed: v,
          power: this.live.power, cadence: this.live.cadence, hr: this.live.hr,
        });
      }
      if (this.lastEle !== null && s.ele > this.lastEle) this.ascent += s.ele - this.lastEle;
      this.lastEle = s.ele;
      this.driveTrainer(dt, conds.rho, conds.crr, v);
      if (this.dist >= this.route.length - 0.5) this.finish();
    }
    this.power3.push(this.live.power);
    const maxLen = Math.max(1, Math.round(3 / Math.max(dt, 1 / 120)));
    while (this.power3.length > maxLen) this.power3.shift();

    this.placeRider(this.dist);
    this.rider.update(dt, moving ? this.live.cadence : 0, moving ? this.dyn.v : 0);
    this.world.update(this.rider.root.position.x, this.rider.root.position.z, this.dist);
    this.routeMesh.update(this.dist);
    this.rig.update(dt, this.camContext());
    this.sky.position.copy(this.camera.position);

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
      });
    }
  }

  /**
   * Mode SIM : une fois par seconde, on envoie au trainer la pente qui arrive
   * (multipliée par la « difficulté du trainer »), le Crr et la résistance de l'air.
   */
  private driveTrainer(dt: number, rho: number, crr: number, v: number): void {
    this.trainerTimer += dt;
    const tr = this.devices.trainer;
    if (!tr || this.trainerTimer < 1) return;
    this.trainerTimer = 0;
    const ahead = this.route.sampleAt(this.dist + Math.max(5, v * 1.5));
    const grade = ahead.grade * this.profile.trainerDifficulty;
    const cw = 0.5 * rho * this.params.cda;
    tr.setSimulation(grade, crr, cw, 0).catch(() => undefined);
  }

  private camContext() {
    return {
      rider: this.rider,
      route: this.route,
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
    this.rider.dispose();
  }
}
