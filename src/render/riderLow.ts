/**
 * Coureur « allégé » pour les IA éloignées de la caméra.
 *
 * Le modèle complet (riderModel.ts) compte une centaine d'objets à dessiner. À 30 coureurs,
 * la carte graphique intégrée ne suivrait pas. Au-delà de quelques dizaines de mètres, on
 * affiche donc cette version simple, calée sur les mêmes points clés que le modèle complet :
 *  - un seul objet pour tout ce qui ne bouge pas (vélo, buste, bras, tête, casque), coloré
 *    par sommet aux couleurs du coureur ;
 *  - quatre segments pour les jambes, qui pédalent ;
 *  - un disque d'ombre au sol (pas de calcul d'ombre portée).
 * Soit 6 objets au lieu de ~100.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CRANK, type RiderPose } from './riderModel';
import type { RiderLook } from './look';

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** Cylindre unitaire (axe y, de 0 à 1), partagé par tous les segments. */
const SEG = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);

/** Colore tous les sommets d'une géométrie (pour la fusion en un seul objet). */
function paint(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  return geo;
}

/** Tube de a à b (rayon r). */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, color: string, sides = 6): THREE.BufferGeometry {
  const d = tmpA.copy(b).sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), sides, 1).translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
  g.translate(a.x, a.y, a.z);
  return paint(g, color);
}

function ball(c: THREE.Vector3, rx: number, ry: number, rz: number, color: string): THREE.BufferGeometry {
  return paint(new THREE.SphereGeometry(1, 8, 6).scale(rx, ry, rz).translate(c.x, c.y, c.z), color);
}

/** Résout un « bras » à deux segments (hanche → genou → cheville), genou vers l'avant. */
function knee(hip: THREE.Vector3, ankle: THREE.Vector3, l1: number, l2: number, out: THREE.Vector3): THREE.Vector3 {
  const d = tmpB.copy(ankle).sub(hip);
  const L = Math.min(d.length(), l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = d.x / (d.length() || 1), uy = d.y / (d.length() || 1);
  // perpendiculaire tournée vers l'avant (+x)
  let px = -uy, py = ux;
  if (px < 0) { px = -px; py = -py; }
  return out.set(hip.x + ux * a + px * h, hip.y + uy * a + py * h, hip.z);
}

export class RiderLow {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  crankAngle = 0;
  private legs: Array<{ side: number; thigh: THREE.Mesh; shin: THREE.Mesh }> = [];
  private materials: THREE.Material[] = [];
  private geoms: THREE.BufferGeometry[] = [];
  private shadow: THREE.Mesh;
  private kneeP = new THREE.Vector3();
  private ankleP = new THREE.Vector3();
  private hipP = new THREE.Vector3();

  constructor(look: RiderLook, private pose: RiderPose) {
    const p = pose;
    const s = p.s;
    const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
    const rear = V(0, p.R), front = V(p.wheelbase, p.R);
    const parts: THREE.BufferGeometry[] = [];
    // ----- Vélo : roues (pneu + jante à la couleur du cadre), triangle du cadre, fourche, cintre
    for (const c of [rear, front]) {
      parts.push(paint(new THREE.TorusGeometry(p.R - 0.012, 0.014, 4, 18).translate(c.x, c.y, 0), '#16181b'));
      parts.push(paint(new THREE.TorusGeometry(p.R - 0.04, 0.02, 3, 14).translate(c.x, c.y, 0), look.frameColor2));
    }
    const seatTop = p.hip.clone().add(V(-0.02, -0.06));
    const headTop = p.hand.clone().add(V(-0.08, -0.03));
    const headBot = headTop.clone().add(V(0.04, -0.15));
    const fc = look.frameColor, tr = 0.018;
    parts.push(tube(p.bb, seatTop, tr, fc), tube(p.bb, headBot, tr * 1.2, fc), tube(seatTop, headTop, tr, fc));
    parts.push(tube(rear, p.bb, tr * 0.8, fc), tube(rear, seatTop, tr * 0.7, fc), tube(headBot, front, tr, fc));
    parts.push(tube(headTop, p.hand, 0.014, '#1a1a1a'));
    // ----- Cycliste : buste (maillot), bras, tête, casque
    const w = 0.15 * s * p.limb;
    // buste : capsule de la hanche aux épaules, un peu aplatie d'avant en arrière
    const tLen = p.shoulder.distanceTo(p.hip);
    const torso = new THREE.CapsuleGeometry(w * 0.85, Math.max(0.05, tLen - w * 0.6), 3, 8);
    torso.scale(0.8, 1, 1.05).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, p.shoulder.clone().sub(p.hip).normalize()));
    const mid = p.hip.clone().lerp(p.shoulder, 0.5);
    parts.push(paint(torso.translate(mid.x, mid.y, 0), look.jerseyColor));
    parts.push(paint(new THREE.SphereGeometry(w * 0.95, 8, 6).translate(p.hip.x, p.hip.y, 0), look.shortsColor));
    for (const side of [-1, 1]) {
      const sh = p.shoulder.clone().setZ(side * 0.17 * s);
      const hd = p.hand.clone().setZ(side * 0.2);
      const el = sh.clone().lerp(hd, 0.5).add(V(-0.04, -0.06));
      parts.push(tube(sh, el, 0.042 * s, look.jerseyColor2), tube(el, hd, 0.033 * s, look.skin));
    }
    parts.push(ball(p.head, p.headR, p.headR * 1.05, p.headR * 0.9, look.skin));
    parts.push(ball(p.head.clone().add(V(-0.02, 0.035)), p.headR * 1.3, p.headR * 0.95, p.headR * 1.1, look.helmetColor));
    const merged = mergeGeometries(parts)!;
    parts.forEach((g) => g.dispose());
    this.geoms.push(merged);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
    this.materials.push(mat);
    this.body.add(new THREE.Mesh(merged, mat));

    // ----- Jambes : cuisse (cuissard) et tibia (peau), recalculées à chaque image
    const mShorts = new THREE.MeshStandardMaterial({ color: look.shortsColor, roughness: 0.7 });
    const mSkin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.7 });
    this.materials.push(mShorts, mSkin);
    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(SEG, mShorts);
      const shin = new THREE.Mesh(SEG, mSkin);
      this.body.add(thigh, shin);
      this.legs.push({ side, thigh, shin });
    }

    const mShadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    this.materials.push(mShadow);
    const sg = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2).scale(0.85, 1, 0.32);
    this.geoms.push(sg);
    this.shadow = new THREE.Mesh(sg, mShadow);
    this.shadow.position.set(p.wheelbase / 2, 0.03, 0);
    this.root.add(this.body, this.shadow);
    this.update(0, 0);
  }

  /** Pose un segment (cylindre unitaire) de a à b, de rayon r. */
  private static place(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    const d = tmpA.copy(b).sub(a);
    const len = d.length();
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / (len || 1)));
    m.scale.set(r, len, r);
  }

  update(dt: number, cadence: number): void {
    this.crankAngle += (cadence / 60) * Math.PI * 2 * dt;
    const p = this.pose;
    for (const leg of this.legs) {
      const a = this.crankAngle + (leg.side > 0 ? 0 : Math.PI);
      const z = leg.side * 0.1 * p.s;
      this.hipP.set(p.hip.x, p.hip.y, z);
      this.ankleP.set(p.bb.x - Math.sin(a) * CRANK, p.bb.y - Math.cos(a) * CRANK + 0.06, z);
      knee(this.hipP, this.ankleP, p.thigh, p.shin, this.kneeP);
      RiderLow.place(leg.thigh, this.hipP, this.kneeP, 0.068 * p.s * p.limb);
      RiderLow.place(leg.shin, this.kneeP, this.ankleP, 0.05 * p.s * p.limb);
    }
  }

  setGrade(grade: number): void {
    this.body.rotation.z = Math.atan(grade);
  }

  dispose(): void {
    this.geoms.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
