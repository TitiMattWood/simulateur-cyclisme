/**
 * Avatar low-poly : vélo + cycliste, construits entièrement par le code.
 * Les jambes suivent les pédales grâce à une cinématique inverse à deux segments
 * (cuisse + tibia) : le genou se place tout seul à chaque position du pédalier.
 *
 * Repère local : X = vers l'avant, Y = vers le haut, Z = vers la droite du cycliste.
 */
import * as THREE from 'three';
import type { FrameId, WheelId } from '../physics/equipment';
import { WHEELS } from '../physics/equipment';

export interface RiderLook {
  heightCm: number;
  frame: FrameId;
  wheels: WheelId;
  jerseyColor: string;
  jerseyColor2: string;
  helmetColor: string;
  highSocks: boolean;
  aeroHelmet: boolean;
}

const WHEEL_R = 0.34;
const CRANK = 0.1725;

const mat = (color: THREE.ColorRepresentation) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Cylindre unitaire (hauteur 1, axe Y, base à l'origine) réutilisé pour tous les segments. */
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0);

/** Place un cylindre unitaire entre deux points, avec un rayon donné. */
function placeSegment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length() || 1e-6;
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.scale.set(radius, len, radius);
}

function segment(material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.Mesh {
  const m = new THREE.Mesh(UNIT_CYL, material);
  placeSegment(m, a, b, r);
  return m;
}

const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

export class RiderModel {
  readonly root = new THREE.Group();
  /** groupe incliné selon la pente (le vélo suit la route) */
  readonly body = new THREE.Group();
  /** objets cachés en vue « cockpit » (tête, casque) */
  readonly headParts: THREE.Object3D[] = [];
  private wheels: THREE.Group[] = [];
  private crank = new THREE.Group();
  private legs: Array<{ thigh: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh; sock: THREE.Mesh; side: number }> = [];
  private hip: THREE.Vector3;
  private scale: number;
  private thighLen: number;
  private shinLen: number;
  crankAngle = 0;
  private shadow: THREE.Mesh;

  constructor(look: RiderLook, opts: { trainer?: boolean } = {}) {
    this.scale = look.heightCm / 178;
    const s = this.scale;
    this.thighLen = 0.44 * s;
    this.shinLen = 0.44 * s;
    this.root.add(this.body);

    const frameColor = look.frame === 'aero' ? '#1b1f24' : look.frame === 'mtb' ? '#2a6f97' : '#c8102e';
    const mFrame = mat(frameColor);
    const mDark = mat('#202225');
    const mTire = mat('#151515');
    const mRim = mat(look.wheels === 'alu' ? '#9aa1a8' : '#2b2b2b');
    const mJersey = mat(look.jerseyColor);
    const mJersey2 = mat(look.jerseyColor2);
    const mShorts = mat('#16181b');
    const mSkin = mat('#e0ac8a');
    const mHelmet = mat(look.helmetColor);
    const mSock = mat('#f4f4f4');
    const mShoe = mat('#f2f2f2');

    // ----- Vélo -----
    const bike = new THREE.Group();
    const rear = V(0, WHEEL_R), front = V(1.0, WHEEL_R);
    const bb = V(0.41, 0.27), seatTop = V(0.27, 0.80), headTop = V(0.86, 0.80), headBot = V(0.9, 0.64);
    const tubeR = look.frame === 'aero' ? 0.026 : 0.019;
    for (const z of [-0.06, 0.06]) {
      bike.add(segment(mFrame, V(0, WHEEL_R, z), V(bb.x, bb.y, z), 0.011)); // haubans bas
      bike.add(segment(mFrame, V(0, WHEEL_R, z), V(seatTop.x, seatTop.y - 0.04, z * 0.5), 0.010)); // haubans
      bike.add(segment(mFrame, V(front.x, WHEEL_R, z), V(headBot.x, headBot.y, 0), 0.013)); // fourche
    }
    bike.add(segment(mFrame, bb, seatTop, tubeR)); // tube de selle
    bike.add(segment(mFrame, bb, headBot, tubeR * 1.2)); // tube diagonal
    bike.add(segment(mFrame, seatTop, headTop, tubeR)); // tube horizontal
    bike.add(segment(mFrame, headBot, headTop, tubeR * 1.3)); // douille
    const saddle = V(0.22 * s + 0.0, 0.8 + 0.12 * s);
    bike.add(segment(mDark, seatTop, saddle, 0.013)); // tige de selle
    const saddleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.12), mDark);
    saddleMesh.position.copy(saddle).add(V(0.02, 0.02));
    bike.add(saddleMesh);
    const bar = V(0.98, 0.86 + 0.06 * s);
    bike.add(segment(mDark, headTop, bar, 0.014)); // potence
    const barL = V(bar.x, bar.y, -0.21), barR = V(bar.x, bar.y, 0.21);
    bike.add(segment(mDark, barL, barR, 0.012));
    for (const z of [-0.21, 0.21]) {
      bike.add(segment(mDark, V(bar.x, bar.y, z), V(bar.x + 0.08, bar.y - 0.05, z), 0.012));
      bike.add(segment(mDark, V(bar.x + 0.08, bar.y - 0.05, z), V(bar.x + 0.02, bar.y - 0.16, z), 0.012));
    }
    // Roues : pneu + jante plus ou moins haute selon le modèle.
    const rimDepth = WHEELS[look.wheels].rimDepth / 1000;
    for (const c of [rear, front]) {
      const w = new THREE.Group();
      w.position.copy(c);
      if (!(opts.trainer && c === rear)) {
        w.add(new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.014, 0.014, 4, 20), mTire));
        w.add(new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.028 - rimDepth / 2, rimDepth / 2, 3, 20), mRim));
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const spoke = segment(mDark, V(0, 0), V(Math.cos(a) * (WHEEL_R - 0.03 - rimDepth), Math.sin(a) * (WHEEL_R - 0.03 - rimDepth)), 0.003);
          w.add(spoke);
        }
        this.wheels.push(w);
      }
      bike.add(w);
    }
    // Pédalier
    this.crank.position.copy(bb);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 14), mDark);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = 0.06;
    this.crank.add(ring);
    for (const side of [-1, 1]) {
      const arm = segment(mDark, V(0, 0, side * 0.07), V(0, -CRANK * side, side * 0.08), 0.012);
      this.crank.add(arm);
    }
    bike.add(this.crank);
    this.body.add(bike);

    if (opts.trainer) {
      // Home trainer « direct drive » : bloc à la place de la roue arrière + cale de roue avant.
      const mTrainer = mat('#2d3136');
      const unit = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.2), mTrainer);
      unit.position.set(0.02, 0.2, 0);
      this.body.add(unit);
      const fly = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 16), mat('#c7ced6'));
      fly.rotation.x = Math.PI / 2;
      fly.position.set(0.02, 0.24, 0.13);
      this.body.add(fly);
      for (const z of [-0.32, 0.32]) {
        this.body.add(segment(mTrainer, V(-0.25, 0.02, z), V(0.3, 0.02, z * 0.4), 0.025));
      }
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.14), mTrainer);
      block.position.set(1.0, 0.03, 0);
      this.body.add(block);
    }

    // ----- Cycliste -----
    this.hip = V(0.2, 0.8 + 0.12 * s + 0.07);
    const hipMid = this.hip.clone();
    const shoulder = V(0.2 + 0.43 * s, hipMid.y + 0.36 * s);
    const torso = segment(mJersey, hipMid, shoulder, 0.15 * s);
    torso.scale.z = 0.15 * s;
    torso.scale.x = 0.12 * s;
    this.body.add(torso);
    // bande de couleur secondaire sur le maillot
    const band = segment(mJersey2, hipMid.clone().lerp(shoulder, 0.55), hipMid.clone().lerp(shoulder, 0.72), 0.152 * s);
    band.scale.x = 0.125 * s;
    this.body.add(band);
    const neck = shoulder.clone().add(V(0.06 * s, 0.07 * s));
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 * s, 1), mSkin);
    head.position.copy(neck).add(V(0.06 * s, 0.07 * s));
    this.body.add(head);
    const helmet = new THREE.Mesh(
      look.aeroHelmet ? new THREE.SphereGeometry(0.125 * s, 8, 6).scale(1.5, 0.85, 1) : new THREE.SphereGeometry(0.122 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      mHelmet,
    );
    helmet.position.copy(head.position).add(V(-0.01, 0.025 * s));
    if (look.aeroHelmet) helmet.position.add(V(-0.05 * s, 0));
    this.body.add(helmet);
    this.headParts.push(head, helmet);
    // bras : épaule → coude → mains sur les cocottes
    for (const side of [-1, 1]) {
      const sh = V(shoulder.x, shoulder.y - 0.03, side * 0.19 * s);
      const hand = V(bar.x + 0.07, bar.y - 0.03, side * 0.21);
      const elbow = this.solveKnee(sh, hand, 0.29 * s, 0.29 * s, -1).setZ(side * 0.24 * s);
      this.body.add(segment(mJersey, sh, elbow, 0.045 * s));
      this.body.add(segment(mSkin, elbow, hand, 0.035 * s));
    }
    // jambes (mises à jour à chaque image)
    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(UNIT_CYL, mShorts);
      const shin = new THREE.Mesh(UNIT_CYL, mSkin);
      const sock = new THREE.Mesh(UNIT_CYL, look.highSocks ? mSock : mSkin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.25 * s, 0.07, 0.09), mShoe);
      this.body.add(thigh, shin, sock, foot);
      this.legs.push({ thigh, shin, foot, sock, side });
    }

    // Ombre portée simplifiée (disque sombre au sol).
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2).scale(0.85, 1, 0.32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.shadow.position.set(0.5, 0.03, 0);
    this.root.add(this.shadow);
    this.update(0, 0);
  }

  /**
   * Cinématique inverse à deux segments dans le plan vertical X-Y.
   * bend = +1 : l'articulation part vers l'avant (genou) ; -1 : vers le bas/arrière (coude).
   */
  private solveKnee(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, bend: number): THREE.Vector3 {
    const dx = b.x - a.x, dy = b.y - a.y;
    let d = Math.hypot(dx, dy);
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
    const ang = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)) * bend;
    const base = Math.atan2(dy, dx);
    return V(a.x + Math.cos(base + ang) * l1, a.y + Math.sin(base + ang) * l1, a.z);
  }

  /** Anime le pédalage (cadence en tr/min) et la rotation des roues (vitesse en m/s). */
  update(dt: number, cadence: number, speed = 0): void {
    this.crankAngle += (cadence / 60) * Math.PI * 2 * dt;
    this.crank.rotation.z = -this.crankAngle;
    for (const w of this.wheels) w.rotation.z -= (speed / WHEEL_R) * dt;
    const bb = this.crank.position;
    for (const leg of this.legs) {
      // pédale : extrémité de la manivelle (droite en bas à l'angle 0, gauche en haut)
      const a = this.crankAngle + (leg.side > 0 ? 0 : Math.PI);
      const pedal = V(bb.x - Math.sin(a) * CRANK, bb.y - Math.cos(a) * CRANK, leg.side * 0.11);
      const ankle = V(pedal.x - 0.05, pedal.y + 0.07, pedal.z);
      const hip = V(this.hip.x, this.hip.y, leg.side * 0.1 * this.scale);
      const knee = this.solveKnee(hip, ankle, this.thighLen, this.shinLen, 1);
      knee.z = leg.side * 0.11 * this.scale;
      placeSegment(leg.thigh, hip, knee, 0.068 * this.scale);
      const mid = knee.clone().lerp(ankle, 0.62);
      placeSegment(leg.shin, knee, mid, 0.048 * this.scale);
      placeSegment(leg.sock, mid, ankle, 0.042 * this.scale);
      leg.foot.position.set(pedal.x + 0.02, pedal.y + 0.035, pedal.z);
    }
  }

  /** Inclinaison du vélo selon la pente (fraction). */
  setGrade(grade: number): void {
    this.body.rotation.z = Math.atan(grade);
  }

  setHeadVisible(v: boolean): void {
    for (const o of this.headParts) o.visible = v;
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (o.geometry !== UNIT_CYL) o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
