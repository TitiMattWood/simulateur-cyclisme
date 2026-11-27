/**
 * Garage de l'accueil, contre le mur arrière (x ≈ −3,5) de chaque pièce :
 *  - les vélos rangés au sol côte à côte, roue avant contre le mur ; l'emplacement du vélo
 *    choisi au profil reste vide (il est sur le home trainer, ou exposé en mode configuration) ;
 *  - au-dessus, les paires de roues accrochées au mur ; l'emplacement de la paire montée sur
 *    le vélo reste vide. Changer de roues au profil « échange » donc les roues : la nouvelle
 *    paire quitte le mur pour aller sur le vélo, l'ancienne reprend sa place.
 */
import * as THREE from 'three';
import { RiderModel } from './riderModel';
import { defaultAppearance, type RiderLook } from './look';
import { WHEELS, type FrameId, type WheelId } from '../physics/equipment';

/** Mur arrière de la pièce (repère commun des décors : le vélo du home trainer à l'origine). */
const WALL_X = -3.47;

/** Vélos du garage, dans l'ordre des emplacements (de gauche à droite vus de la pièce). */
const RACK: FrameId[] = ['climb', 'aero', 'gravel', 'tt', 'mtb'];
const RACK_Z0 = -2.05;
const RACK_STEP = 0.5;

/** Paires de roues exposées au mur : roues alu de série et modèles du catalogue. */
export const WALL_WHEELS: WheelId[] = [
  'alu', 'clim45', 'pro55', 'saw58', 'mono60', 'pro65',
  'arc62', 'tt80d', 'tt100d', 'g25', 'g30', 'g54',
];
const WALL_Z0 = -2.0;
const WALL_STEP = 0.56;
const ROW_Y = [2.28, 1.52];

/** Coloris des vélos rangés (d'après les photos de référence : route blanc, aéro gris mat…). */
const STORED: Record<FrameId, Partial<RiderLook>> = {
  climb: { frameColor: '#eef0f0', frameColor2: '#2a2c30', finish: 'gloss', tireWall: 'tan', wheels: 'c45' },
  aero: { frameColor: '#6d6e6b', frameColor2: '#b9b5a8', finish: 'matte', tireWall: 'black', wheels: 'c55' },
  gravel: { frameColor: '#b0121d', frameColor2: '#f2f2f2', finish: 'gloss', tireWall: 'tan', wheels: 'c30' },
  tt: { frameColor: '#e9e7ee', frameColor2: '#1c1d20', finish: 'gloss', tireWall: 'black', wheels: 'c88' },
  mtb: { frameColor: '#22313f', frameColor2: '#e94b2b', finish: 'matte', tireWall: 'black', wheels: 'alu' },
};

export class Garage {
  readonly group = new THREE.Group();
  private bikes = new Map<FrameId, RiderModel>();
  private wheels = new Map<WheelId, THREE.Group>();
  private style: RiderLook['style'] | null = null;

  constructor() {
    // rail de rangement au sol (les roues avant s'y calent) et barre d'accroche des roues
    const steel = new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.45, metalness: 0.7 });
    const len = RACK_STEP * (RACK.length - 1) + 0.6;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, len), steel);
    rail.position.set(WALL_X + 0.25, 0.03, RACK_Z0 + (RACK_STEP * (RACK.length - 1)) / 2);
    rail.receiveShadow = true;
    this.group.add(rail);
    const wlen = WALL_STEP * 5 + 0.7;
    for (const y of ROW_Y) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, wlen), steel);
      bar.position.set(WALL_X + 0.02, y + 0.36, WALL_Z0 + (WALL_STEP * 5) / 2);
      this.group.add(bar);
    }
  }

  /** Met le garage en accord avec le vélo et les roues choisis (emplacements vides). */
  update(look: RiderLook): void {
    if (this.style !== look.style) this.rebuild(look.style);
    for (const [f, m] of this.bikes) m.root.visible = f !== look.frame;
    for (const [w, g] of this.wheels) g.visible = w !== look.wheels;
  }

  private rebuild(style: RiderLook['style']): void {
    this.style = style;
    for (const m of this.bikes.values()) { this.group.remove(m.root); m.dispose(); }
    this.bikes.clear();
    RACK.forEach((f, i) => {
      const look: RiderLook = {
        ...defaultAppearance(f), style, heightCm: 178, weightKg: 72, frame: f, wheels: 'c40',
        jerseyColor: '#000', jerseyColor2: '#000', helmetColor: '#000', overshoes: false, bottles: 0, computer: false,
        ...STORED[f],
      };
      const m = new RiderModel(look, { bikeOnly: true });
      // tourné vers le mur : roue avant contre le mur, roue arrière vers la pièce
      m.root.rotation.y = Math.PI;
      m.root.position.set(WALL_X + 0.06 + m.pose.R + m.pose.wheelbase, 0, RACK_Z0 + i * RACK_STEP);
      m.setBlobShadow(false);
      m.root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
      this.group.add(m.root);
      this.bikes.set(f, m);
    });
    if (!this.wheels.size) {
      WALL_WHEELS.forEach((id, i) => {
        const row = i < 6 ? 0 : 1;
        const col = i % 6;
        const g = wheelPair(id);
        g.position.set(WALL_X + 0.13 + (col % 2) * 0.05, ROW_Y[row], WALL_Z0 + col * WALL_STEP);
        this.group.add(g);
        this.wheels.set(id, g);
      });
    }
  }

  dispose(): void {
    for (const m of this.bikes.values()) m.dispose();
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  }
}

// ---------------------------------------------------------------------------
// Roues exposées (modèle simplifié : pneu, jante, rayons, moyeu, ou disque plein)

const mTire = new THREE.MeshStandardMaterial({ color: '#131313', roughness: 0.9 });
const mCarbon = new THREE.MeshStandardMaterial({ color: '#1d1e20', roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide });
const mAlloy = new THREE.MeshStandardMaterial({ color: '#3a3d41', roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
const mDecal = new THREE.MeshStandardMaterial({ color: '#d9dde0', roughness: 0.6, side: THREE.DoubleSide });
const mHub = new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.4, metalness: 0.6 });
const mHook = new THREE.MeshStandardMaterial({ color: '#8b949c', roughness: 0.3, metalness: 0.9 });

/** Une roue dans le plan XY (axe selon z), rayon pneu compris R. */
function wheel(depthMm: number, disc: boolean, gravel: boolean, alloy: boolean): THREE.Group {
  const g = new THREE.Group();
  const R = gravel ? 0.35 : 0.335;
  const tireR = gravel ? 0.02 : 0.0135;
  g.add(new THREE.Mesh(new THREE.TorusGeometry(R - tireR, tireR, 10, 48), mTire));
  const rimOut = R - 2 * tireR + 0.003;
  const mRim = alloy ? mAlloy : mCarbon;
  if (disc) {
    const prof: THREE.Vector2[] = [];
    for (let k = 0; k <= 8; k++) prof.push(new THREE.Vector2(0.03 + (rimOut - 0.03) * (k / 8), 0.026 - 0.0165 * Math.pow(k / 8, 1.4)));
    for (const sgn of [1, -1]) {
      const lens = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), mRim);
      lens.rotation.x = (sgn * Math.PI) / 2;
      g.add(lens);
    }
  } else {
    const rimIn = rimOut - Math.max(0.02, depthMm / 1000);
    for (const z of [-0.0095, 0.0095]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(rimIn, rimOut, 48), mRim);
      ring.position.z = z;
      g.add(ring);
      if (!alloy) {
        for (const a0 of [0.3, 0.3 + Math.PI]) {
          const dec = new THREE.Mesh(new THREE.RingGeometry(rimIn + 0.25 * (rimOut - rimIn), rimIn + 0.7 * (rimOut - rimIn), 12, 1, a0, 0.9), mDecal);
          dec.position.z = z * 1.08;
          g.add(dec);
        }
      }
    }
    const n = alloy ? 28 : 24;
    const pts: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const side = k % 2 ? 1 : -1;
      pts.push(Math.cos(a + side * 0.12) * 0.022, Math.sin(a + side * 0.12) * 0.022, side * 0.03, Math.cos(a) * rimIn, Math.sin(a) * rimIn, 0);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: alloy ? '#8d9399' : '#202224' })));
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 12), mHub);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  return g;
}

/** Paire accrochée au mur : roue avant devant, roue arrière juste derrière (décalée). */
function wheelPair(id: WheelId): THREE.Group {
  const w = WHEELS[id];
  const gravel = w.kind === 'gravel';
  const alloy = id === 'alu' || id === 'alu30' || id === 'g25';
  const pair = new THREE.Group();
  const rear = wheel(w.rimDepthRear ?? w.rimDepth, !!w.rearDisc, gravel, alloy);
  rear.position.set(-0.07, -0.04, -0.07); // (repère local : z = vers le mur après rotation)
  const front = wheel(w.rimDepth, false, gravel, alloy);
  pair.add(rear, front);
  // crochet au-dessus de la jante
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), mHook);
  hook.rotation.x = Math.PI / 2;
  hook.position.set(0, (gravel ? 0.35 : 0.335) - 0.03, -0.1);
  pair.add(hook);
  // les roues sont dessinées dans le plan XY : on les tourne pour qu'elles soient à plat contre le mur
  pair.rotation.y = Math.PI / 2;
  pair.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  return pair;
}
