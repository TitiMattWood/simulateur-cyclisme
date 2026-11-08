/**
 * Décor de l'écran d'accueil : l'avatar pédale sur son home trainer, face à une grande TV
 * qui affiche une route qui défile. La caméra tourne lentement autour du vélo.
 *
 * - Onglet Profil : la caméra se rapproche du cycliste pour voir l'équipement.
 * - « Rouler » : la caméra plonge dans l'écran de la TV (enterTv), puis la sortie démarre.
 * - Retour de sortie : la caméra ressort de la TV (exitTv).
 */
import * as THREE from 'three';
import type { View } from './engine';
import { RiderModel, type RiderLook } from './riderModel';

/** Écran de la TV (centre, taille) dans le repère de la pièce. */
const TV = { x: 3.15, y: 1.4, w: 1.65, h: 0.93 };
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

export class HomeScene implements View {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.03, 100);
  private rider: RiderModel;
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
  /** décalage horizontal du cadrage, pour laisser la place au panneau de droite */
  private shift = 0;
  private camTarget = RIDER_TARGET.clone();
  private fan: THREE.Group;

  constructor(look: RiderLook) {
    const s = this.scene;
    s.background = new THREE.Color('#1c2026');
    s.add(new THREE.HemisphereLight('#fff4e6', '#4a4038', 0.9));
    // lumière du jour par la fenêtre (porte les ombres)
    const sun = new THREE.DirectionalLight('#ffe7c4', 1.7);
    sun.position.set(-2.5, 4.5, -3.5);
    sun.target.position.set(0.5, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -2.5; sc.right = 2.5; sc.top = 2.5; sc.bottom = -2.5; sc.near = 1; sc.far = 12;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    s.add(sun, sun.target);
    // lueur de la TV et lampe chaude
    const glow = new THREE.PointLight('#9cc8ff', 3.5, 6, 1.6);
    glow.position.set(TV.x - 0.5, TV.y, 0);
    s.add(glow);
    const lamp = new THREE.PointLight('#ffc98a', 4, 7, 1.6);
    lamp.position.set(-2.6, 2.1, 2.4);
    s.add(lamp);

    const m = (c: string) => new THREE.MeshLambertMaterial({ color: c });
    const add = (mesh: THREE.Mesh, x: number, y: number, z: number, receive = true) => {
      mesh.position.set(x, y, z);
      mesh.receiveShadow = receive;
      s.add(mesh);
      return mesh;
    };
    // sol en parquet (lames dessinées) et murs
    add(new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, 7.5), new THREE.MeshLambertMaterial({ map: parquetTexture() })), 0, -0.05, 0.4);
    add(new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.015, 1.3), m('#2b2f35')), 0.55, 0.008, 0); // tapis de home trainer
    add(new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.2, 0.1), m('#d8d1c4')), 0, 1.6, -3.0); // mur du fond (fenêtre)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 7.5), m('#cbd3d8')), 3.3, 1.6, 0.4); // mur de la TV
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 7.5), m('#d3ccbf')), -3.5, 1.6, 0.4); // mur arrière
    add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 7.4), m('#f2efe8')), 3.24, 0.06, 0.4); // plinthe

    // fenêtre avec vue sur des collines
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.35), new THREE.MeshBasicMaterial({ map: windowTexture() }));
    win.position.set(-1.0, 1.75, -2.94);
    s.add(win);
    for (const [w, h, x, y] of [[2.0, 0.07, 0, 0.7], [2.0, 0.07, 0, -0.7], [0.07, 1.47, 0.98, 0], [0.07, 1.47, -0.98, 0], [0.045, 1.35, 0, 0]] as const) {
      add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), m('#f4f1ea')), -1.0 + x, 1.75 + y, -2.92, false);
    }

    // TV murale : cadre, écran vivant, meuble et barre de son
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, TV.h + 0.05, TV.w + 0.05), new THREE.MeshPhongMaterial({ color: '#0d0e10', shininess: 80 })), TV.x + 0.07, TV.y, 0, false);
    [this.tvCanvas, this.tvCtx] = makeCanvas(512, 288);
    this.tvTex = new THREE.CanvasTexture(this.tvCanvas);
    this.tvTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(TV.w, TV.h), new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false }));
    screen.position.set(TV.x + 0.04, TV.y, 0);
    screen.rotation.y = -Math.PI / 2;
    s.add(screen);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 2.0), m('#6e5640')), 3.03, 0.25, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.9), m('#1a1b1e')), 3.1, 0.54, 0);

    // étagère avec coupes, plante, ventilateur, lampe, tableau
    add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.28), m('#8a6a4c')), -2.0, 1.5, -2.82);
    for (const [x, c, h] of [[-2.45, '#d4af37', 0.22], [-2.05, '#c0c0c0', 0.17], [-1.7, '#cd7f32', 0.14]] as const) {
      const cup = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, h, 12), new THREE.MeshPhongMaterial({ color: c, shininess: 90, specular: '#ffffff' })), x, 1.52 + h / 2, -2.82, false);
      cup.castShadow = true;
    }
    const pot = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.38, 14), m('#b5654a')), -2.85, 0.19, -2.4);
    pot.castShadow = true;
    for (const [dx, dy, dz, r] of [[0, 0.75, 0, 0.36], [0.15, 0.62, 0.12, 0.26], [-0.14, 0.66, -0.1, 0.28], [0.05, 1.0, -0.05, 0.22]] as const) {
      const leaf = add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshLambertMaterial({ color: '#4f8a3c', flatShading: true })), -2.85 + dx, dy, -2.4 + dz, false);
      leaf.castShadow = true;
    }
    this.fan = new THREE.Group();
    const fanBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), m('#3b4048'));
    fanBase.position.y = 0.5;
    const fanFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 16), m('#3b4048'));
    fanFoot.position.y = 0.02;
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 6, 28), m('#d7dade'));
    cage.position.y = 1.05;
    cage.rotation.y = Math.PI / 2;
    const blades = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.01, 3), new THREE.MeshLambertMaterial({ color: '#cfd6dd', transparent: true, opacity: 0.55 }));
    blades.rotation.z = Math.PI / 2;
    blades.position.y = 1.05;
    blades.name = 'blades';
    this.fan.add(fanBase, fanFoot, cage, blades);
    this.fan.position.set(1.5, 0, -1.35);
    this.fan.rotation.y = -2.0;
    this.fan.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    s.add(this.fan);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.18, 1.7, 10), m('#2c2f33')), -2.6, 0.85, 2.4, false);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 16), new THREE.MeshLambertMaterial({ color: '#fff1d6', emissive: '#7a5a2a' })), -2.6, 1.85, 2.4, false);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 1.0), m('#2d4a6b')), -3.43, 1.8, 0.2, false); // tableau

    this.rider = new RiderModel(look, { trainer: true });
    s.add(this.rider.root);
    this.drawTv(0);
    this.update(0);
  }

  /** Change l'apparence de l'avatar (couleurs, matériel). */
  setLook(look: RiderLook): void {
    this.scene.remove(this.rider.root);
    this.rider.dispose();
    this.rider = new RiderModel(look, { trainer: true });
    this.scene.add(this.rider.root);
  }

  /** Cadrage : pièce entière, ou gros plan sur le cycliste (onglet Profil). */
  setFocus(f: Focus): void {
    this.focus = f;
  }

  resize(w: number, h: number): void {
    this.size = { w, h };
    // Sur grand écran, le panneau de réglages (≈ 460 px) occupe la droite : on décale l'image.
    this.shift = w > 900 ? 230 : 0;
  }

  /** Plonge la caméra dans l'écran de la TV. La promesse se résout quand l'écran remplit la vue. */
  enterTv(onProgress?: (p: number) => void, dur = 1.9): Promise<void> {
    return new Promise((resolve) => {
      this.anim = { kind: 'enter', t: 0, dur, from: this.camera.position.clone(), fromTarget: this.camTarget.clone(), onProgress, resolve };
    });
  }

  /** Ressort de la TV vers la vue de la pièce (retour de sortie). */
  exitTv(dur = 1.6): void {
    this.anim = { kind: 'exit', t: 0, dur, from: tvFront(0.32), fromTarget: tvCenter() };
  }

  /** Position de la caméra en orbite lente autour du vélo. */
  private orbit(out: THREE.Vector3, target: THREE.Vector3): void {
    const z = smooth(this.zoom);
    // Angle autour du vélo : de 3/4 avant-droit à 3/4 arrière (la TV apparaît derrière le cycliste).
    const base = 1.95 - z * 0.25;
    const swing = 0.6 - z * 0.25;
    const a = base + Math.sin(this.t * 0.1) * swing;
    const r = 3.4 - z * 0.75;
    out.set(RIDER_TARGET.x + Math.cos(a) * r, 1.45 - z * 0.15 + Math.sin(this.t * 0.2) * 0.06, Math.sin(a) * r);
    target.copy(RIDER_TARGET).add(new THREE.Vector3(0.25 * (1 - z), 0.05 - z * 0.05, 0));
  }

  update(dt: number): void {
    this.t += dt;
    this.rider.update(dt, 82);
    const blades = this.fan.getObjectByName('blades');
    if (blades) blades.rotation.x += dt * 18;
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
        bezier(a.from, ctrl, tvFront(0.32), e, pos);
        target.copy(a.fromTarget).lerp(tvCenter(), smooth(Math.min(1, p * 1.4)));
        shift *= 1 - smooth(Math.min(1, p * 1.5));
        a.onProgress?.(p);
        if (p >= 1) {
          this.anim = null;
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
    if (shift > 0.5) cam.setViewOffset(this.size.w, this.size.h, shift, 0, this.size.w, this.size.h);
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

function tvCenter(): THREE.Vector3 {
  return new THREE.Vector3(TV.x, TV.y, 0);
}

/** Point situé à `d` mètres devant l'écran, dans l'axe. */
function tvFront(d: number): THREE.Vector3 {
  return new THREE.Vector3(TV.x - d, TV.y, 0);
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

function parquetTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(512, 512);
  const tones = ['#9a7652', '#8c6a48', '#a47f59', '#94704c', '#87653f'];
  for (let row = 0; row < 16; row++) {
    let x = -((row * 97) % 180);
    while (x < 512) {
      const len = 140 + ((row * 31 + x) % 90);
      g.fillStyle = tones[(row * 7 + Math.abs(x)) % tones.length];
      g.fillRect(x, row * 32, len, 32);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, row * 32, 2, 32);
      x += len;
    }
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, row * 32, 512, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.anisotropy = 8;
  return t;
}

function windowTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(256, 180);
  const sky = g.createLinearGradient(0, 0, 0, 120);
  sky.addColorStop(0, '#7db7ea');
  sky.addColorStop(1, '#d9ecf7');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 180);
  g.fillStyle = '#9cbf7d';
  g.beginPath();
  g.moveTo(0, 180); g.lineTo(0, 110); g.quadraticCurveTo(70, 70, 140, 105); g.quadraticCurveTo(200, 130, 256, 95); g.lineTo(256, 180);
  g.fill();
  g.fillStyle = '#6f9a52';
  g.beginPath();
  g.moveTo(0, 180); g.lineTo(0, 140); g.quadraticCurveTo(110, 115, 256, 145); g.lineTo(256, 180);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
