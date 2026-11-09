/**
 * Accueil : l'avatar pédale sur son home trainer, face à une grande TV qui montre une route
 * qui défile, dans le décor choisi au profil (pain cave néon, atelier, salon, loft).
 * La caméra tourne lentement autour du vélo.
 *
 * - Onglet Profil : la caméra se rapproche du cycliste pour voir l'équipement.
 * - « C'est parti » : la caméra plonge dans l'écran de la TV (enterTv), puis la sortie démarre.
 * - Retour de sortie : la caméra ressort de la TV (exitTv).
 */
import * as THREE from 'three';
import type { View } from './engine';
import type { BloomStyle } from './post';
import { RiderModel, type RiderLook } from './riderModel';
import type { RoomId } from './look';
import type { RoomSetup } from './rooms/common';
import { neonCave } from './rooms/neonCave';
import { workshop } from './rooms/workshop';
import { livingRoom } from './rooms/livingRoom';
import { industrialLoft } from './rooms/industrialLoft';

/** Point regardé par la caméra (milieu du cycliste). */
const RIDER_TARGET = new THREE.Vector3(0.5, 0.95, 0);

type Focus = 'room' | 'rider';

interface CamAnim {
  kind: 'enter' | 'exit';
  t: number;
  dur: number;
  from: THREE.Vector3;
  fromTarget: THREE.Vector3;
  onProgress?: (p: number) => void;
  resolve?: () => void;
}

const smooth = (x: number) => x * x * (3 - 2 * x);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function buildRoom(id: RoomId, style: RiderLook['style']): RoomSetup {
  switch (id) {
    case 'workshop': return workshop(style);
    case 'living': return livingRoom();
    case 'loft': return industrialLoft();
    case 'neon':
    default: return neonCave();
  }
}

export class HomeScene implements View {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.03, 100);
  bloom: BloomStyle = { strength: 0.5, radius: 0.5, threshold: 0.8 };
  /** réglage d'exposition propre au décor (lu par le moteur) */
  exposure = 1;
  private rider: RiderModel;
  private room!: RoomSetup;
  private roomId: RoomId | null = null;
  private roomStyle: RiderLook['style'] | null = null;
  private screen: THREE.Mesh;
  private t = 0;
  private tvCanvas: HTMLCanvasElement;
  private tvCtx: CanvasRenderingContext2D;
  private tvTex: THREE.CanvasTexture;
  private tvClock = 0;
  private focus: Focus = 'room';
  /** 0 = pièce entière, 1 = gros plan sur le cycliste (interpolé en douceur) */
  private zoom = 0;
  private anim: CamAnim | null = null;
  private size = { w: 1, h: 1 };
  /** décalage horizontal du cadrage, pour laisser la place au panneau de gauche */
  private shift = 0;
  private camTarget = RIDER_TARGET.clone();
  /** le moteur est prévenu quand le décor change (halo, exposition) */
  onRoomChange?: () => void;

  constructor(look: RiderLook, envMap: THREE.Texture | null = null) {
    this.scene.environment = envMap;
    [this.tvCanvas, this.tvCtx] = makeCanvas(512, 288);
    this.tvTex = new THREE.CanvasTexture(this.tvCanvas);
    this.tvTex.colorSpace = THREE.SRGBColorSpace;
    // écran lumineux : non affecté par le tone mapping, il « bave » légèrement grâce au halo
    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) }),
    );
    this.screen.rotation.y = -Math.PI / 2;
    this.scene.add(this.screen);
    this.rider = new RiderModel(look, { trainer: true });
    this.scene.add(this.rider.root);
    this.setRoom(look.room ?? 'neon', look.style);
    this.drawTv(0);
    this.update(0);
  }

  /** Change de décor (sans toucher à l'avatar). */
  setRoom(id: RoomId, style: RiderLook['style'] = 'smooth'): void {
    if (id === this.roomId && style === this.roomStyle) return;
    if (this.room) {
      this.scene.remove(this.room.group);
      this.room.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material & { map?: THREE.Texture | null };
          m.map?.dispose();
          m.dispose();
        }
      });
    }
    this.roomId = id;
    this.roomStyle = style;
    this.room = buildRoom(id, style);
    this.scene.add(this.room.group);
    this.scene.background = new THREE.Color(this.room.background);
    this.scene.environmentIntensity = id === 'neon' || id === 'loft' ? 0.35 : 0.6;
    this.bloom = this.room.bloom;
    this.exposure = this.room.exposure;
    const tv = this.room.tv;
    this.screen.position.set(tv.x, tv.y, 0);
    this.screen.scale.set(tv.w, tv.h, 1);
    this.onRoomChange?.();
  }

  /** Change l'apparence de l'avatar (couleurs, matériel) et, si besoin, le décor. */
  setLook(look: RiderLook): void {
    this.scene.remove(this.rider.root);
    this.rider.dispose();
    this.rider = new RiderModel(look, { trainer: true });
    this.scene.add(this.rider.root);
    this.setRoom(look.room ?? 'neon', look.style);
  }

  /** Cadrage : pièce entière, ou gros plan sur le cycliste (onglet Profil). */
  setFocus(f: Focus): void {
    this.focus = f;
  }

  resize(w: number, h: number): void {
    this.size = { w, h };
    // Sur grand écran, le panneau de réglages (≈ 440 px) occupe la gauche : on décale l'image vers la droite.
    this.shift = w > 900 ? -210 : 0;
  }

  private get tvPos() {
    return this.room.tv;
  }

  /** Point situé à `d` mètres devant l'écran, dans l'axe. */
  private tvFront(d: number): THREE.Vector3 {
    return new THREE.Vector3(this.tvPos.x - d, this.tvPos.y, 0);
  }

  private tvCenter(): THREE.Vector3 {
    return new THREE.Vector3(this.tvPos.x, this.tvPos.y, 0);
  }

  /** Plonge la caméra dans l'écran de la TV. La promesse se résout quand l'écran remplit la vue. */
  enterTv(onProgress?: (p: number) => void, dur = 1.9): Promise<void> {
    return new Promise((resolve) => {
      this.anim = { kind: 'enter', t: 0, dur, from: this.camera.position.clone(), fromTarget: this.camTarget.clone(), onProgress, resolve };
    });
  }

  /** Ressort de la TV vers la vue de la pièce (retour de sortie). */
  exitTv(dur = 1.6): void {
    this.anim = { kind: 'exit', t: 0, dur, from: this.tvFront(0.32), fromTarget: this.tvCenter() };
  }

  /** Position de la caméra en orbite lente autour du vélo. */
  private orbit(out: THREE.Vector3, target: THREE.Vector3): void {
    const z = smooth(this.zoom);
    // De 3/4 avant-gauche à 3/4 arrière : la TV apparaît à droite, derrière le cycliste.
    const base = 2.0 - z * 0.35;
    const swing = 0.32 - z * 0.12;
    const a = base + Math.sin(this.t * 0.1) * swing;
    const r = 3.9 - z * 1.15;
    out.set(RIDER_TARGET.x + Math.cos(a) * r, 1.4 - z * 0.12 + Math.sin(this.t * 0.2) * 0.05, Math.sin(a) * r);
    target.copy(RIDER_TARGET).add(new THREE.Vector3(0.35 * (1 - z), 0.08 - z * 0.06, 0));
  }

  update(dt: number): void {
    this.t += dt;
    this.rider.update(dt, 82);
    this.room.update?.(this.t);
    // écran de la TV rafraîchi ~30 fois par seconde
    this.tvClock += dt;
    if (this.tvClock > 1 / 30) {
      this.drawTv(this.t);
      this.tvClock = 0;
    }
    this.zoom += ((this.focus === 'rider' ? 1 : 0) - this.zoom) * (1 - Math.exp(-dt * 2.5));

    const cam = this.camera;
    const pos = new THREE.Vector3(), target = new THREE.Vector3();
    this.orbit(pos, target);
    let shift = this.shift;
    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      const e = easeInOut(p);
      if (a.kind === 'enter') {
        // trajectoire courbe : on passe au-dessus de l'épaule du cycliste, puis droit dans l'écran
        const ctrl = new THREE.Vector3(1.4, 1.95, a.from.z * 0.35);
        bezier(a.from, ctrl, this.tvFront(0.32), e, pos);
        target.copy(a.fromTarget).lerp(this.tvCenter(), smooth(Math.min(1, p * 1.4)));
        shift *= 1 - smooth(Math.min(1, p * 1.5));
        a.onProgress?.(p);
        if (p >= 1) {
          // on reste collé à l'écran jusqu'au changement de vue
          this.anim = { kind: 'enter', t: a.dur, dur: a.dur, from: a.from, fromTarget: a.fromTarget };
          a.resolve?.();
        }
      } else {
        const ctrl = new THREE.Vector3(1.4, 1.95, pos.z * 0.35);
        const orbitPos = pos.clone(), orbitTarget = target.clone();
        bezier(a.from, ctrl, orbitPos, e, pos);
        target.copy(a.fromTarget).lerp(orbitTarget, smooth(Math.min(1, p * 1.2)));
        shift *= smooth(p);
        if (p >= 1) this.anim = null;
      }
    }
    cam.position.copy(pos);
    this.camTarget.copy(target);
    cam.lookAt(target);
    if (Math.abs(shift) > 0.5) cam.setViewOffset(this.size.w, this.size.h, shift, 0, this.size.w, this.size.h);
    else cam.clearViewOffset();
  }

  /** Dessine l'image de la TV : une route de campagne qui défile, avec quelques chiffres. */
  private drawTv(t: number): void {
    const g = this.tvCtx, W = 512, H = 288;
    const sky = g.createLinearGradient(0, 0, 0, H * 0.5);
    sky.addColorStop(0, '#5aa0e6');
    sky.addColorStop(1, '#cfe6f7');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // collines lointaines (parallaxe)
    const hills = (color: string, base: number, amp: number, speed: number, freq: number) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, base - amp * (0.6 + 0.4 * Math.sin((x + t * speed) * freq) * Math.sin((x + t * speed) * freq * 0.37 + 1)));
      g.lineTo(W, H);
      g.fill();
    };
    hills('#8fb27a', 150, 40, 4, 0.012);
    hills('#6f9a52', 162, 22, 9, 0.02);
    // champs
    g.fillStyle = '#7cab4f';
    g.fillRect(0, 160, W, H - 160);
    // route en perspective
    const hz = 160, cx = W / 2 + Math.sin(t * 0.3) * 18;
    g.fillStyle = '#4b4f55';
    g.beginPath();
    g.moveTo(cx - 6, hz);
    g.lineTo(cx + 6, hz);
    g.lineTo(W / 2 + 190, H);
    g.lineTo(W / 2 - 190, H);
    g.fill();
    // pointillés qui défilent
    g.fillStyle = '#f2f2f2';
    for (let k = 0; k < 12; k++) {
      const u = ((k / 12 + t * 0.35) % 1);
      const z0 = u * u, z1 = Math.min(1, (u + 0.035) * (u + 0.035));
      const y0 = hz + (H - hz) * z0, y1 = hz + (H - hz) * z1;
      const x0 = cx + (W / 2 - cx) * z0, x1 = cx + (W / 2 - cx) * z1;
      const w0 = 1 + 5 * z0, w1 = 1 + 5 * z1;
      g.beginPath();
      g.moveTo(x0 - w0, y0); g.lineTo(x0 + w0, y0); g.lineTo(x1 + w1, y1); g.lineTo(x1 - w1, y1);
      g.fill();
    }
    // arbres qui défilent sur les bas-côtés
    for (let k = 0; k < 8; k++) {
      const u = ((k / 8 + t * 0.18) % 1);
      const z = u * u;
      const y = hz + (H - hz) * z;
      for (const side of [-1, 1]) {
        const x = cx + (W / 2 - cx) * z + side * (14 + 330 * z);
        const r = 3 + 34 * z;
        g.fillStyle = '#5a3d25';
        g.fillRect(x - r * 0.12, y - r * 1.1, r * 0.24, r * 1.1);
        g.fillStyle = k % 2 ? '#3f7a34' : '#4c8a3a';
        g.beginPath();
        g.arc(x, y - r * 1.4, r * 0.8, 0, Math.PI * 2);
        g.fill();
      }
    }
    // bandeau de chiffres façon tableau de bord
    g.fillStyle = 'rgba(15,18,22,0.72)';
    g.fillRect(0, 0, W, 34);
    g.fillStyle = '#ffffff';
    g.font = 'bold 20px system-ui, sans-serif';
    g.textBaseline = 'middle';
    const watts = Math.round(215 + Math.sin(t * 0.7) * 18);
    const kmh = (31.5 + Math.sin(t * 0.4) * 1.6).toFixed(1).replace('.', ',');
    g.fillText(`${watts} W`, 16, 18);
    g.fillText(`${kmh} km/h`, 200, 18);
    g.fillText('82 rpm', 390, 18);
    this.tvTex.needsUpdate = true;
  }
}

function bezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    u * u * a.z + 2 * u * t * b.z + t * t * c.z,
  );
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

