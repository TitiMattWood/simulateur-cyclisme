/**
 * Avatar « réaliste stylisé » : vélo + cycliste, construits entièrement par le code
 * (aucun fichier 3D à télécharger).
 *
 * - Les membres sont des volumes de révolution (« lathe ») au profil anatomique :
 *   cuisse plus large en haut, mollet bombé, avant-bras qui s'affine vers le poignet.
 * - La silhouette dépend de la taille (proportions) et du poids (corpulence, via l'IMC).
 * - Le maillot est une texture dessinée à la volée : motif, 3 couleurs, col et liserés.
 * - Les jambes suivent les pédales grâce à une cinématique inverse à deux segments
 *   (cuisse + tibia) ; la cheville bascule légèrement au fil du tour de pédale.
 * - Le vélo s'adapte au cycliste : hauteur de selle calculée d'après la longueur des
 *   jambes, cintre placé là où tombent les mains.
 *
 * Repère local : X = vers l'avant, Y = vers le haut, Z = vers la droite du cycliste.
 */
import * as THREE from 'three';
import { WHEELS, type FrameId } from '../physics/equipment';
import { LENS, type RiderLook } from './look';

export type { RiderLook } from './look';

const CRANK = 0.1725;
/** écartement des pédales par rapport à l'axe du vélo (m) */
const Q = 0.11;

const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Géométries partagées entre tous les avatars (créées une seule fois).

const SHARED = new Set<THREE.BufferGeometry>();
function keep<T extends THREE.BufferGeometry>(g: T): T {
  SHARED.add(g);
  return g;
}

/** Cylindre unitaire (hauteur 1, axe Y, base à l'origine). */
const UNIT_CYL = keep(new THREE.CylinderGeometry(1, 1, 1, 12, 1).translate(0, 0.5, 0));
const UNIT_SPHERE = keep(new THREE.SphereGeometry(1, 18, 12));
const UNIT_BOX = keep(new THREE.BoxGeometry(1, 1, 1));

/** Rayon interpolé dans un profil [[y, r], …] (y croissant de 0 à 1). */
function rAt(ctrl: Array<[number, number]>, y: number): number {
  for (let i = 1; i < ctrl.length; i++) {
    if (y <= ctrl[i][0]) {
      const [y0, r0] = ctrl[i - 1], [y1, r1] = ctrl[i];
      return r0 + ((y - y0) / (y1 - y0 || 1)) * (r1 - r0);
    }
  }
  return ctrl[ctrl.length - 1][1];
}

/**
 * Volume de révolution le long de Y, entre y0 et y1, fermé aux deux bouts.
 * Les points sont régulièrement espacés : la texture (coordonnée v) suit donc la hauteur.
 */
function lathe(ctrl: Array<[number, number]>, y0 = 0, y1 = 1, scale = 1, n = 14, segs = 16): THREE.LatheGeometry {
  const pts = [new THREE.Vector2(0.0001, y0)];
  for (let k = 0; k < n; k++) {
    const y = y0 + ((y1 - y0) * k) / (n - 1);
    pts.push(new THREE.Vector2(rAt(ctrl, y) * scale, y));
  }
  pts.push(new THREE.Vector2(0.0001, y1));
  return new THREE.LatheGeometry(pts, segs);
}

// Profils anatomiques (y le long du membre, r relatif au rayon maximal).
const THIGH: Array<[number, number]> = [[0, 0.95], [0.18, 1], [0.5, 0.88], [0.8, 0.7], [1, 0.6]];
const CALF: Array<[number, number]> = [[0, 0.74], [0.12, 0.88], [0.3, 1], [0.55, 0.8], [0.8, 0.57], [1, 0.5]];
const UPPER_ARM: Array<[number, number]> = [[0, 1], [0.4, 0.96], [1, 0.76]];
const FOREARM: Array<[number, number]> = [[0, 0.92], [0.28, 1], [1, 0.6]];

/**
 * Coque de casque CLM : volume de révolution autour de X (avant en +X), ouvert dessous
 * pour laisser le visage dégagé sous la visière.
 */
function ttShellGeometry(): THREE.BufferGeometry {
  const ctrl: Array<[number, number]> = [[0, 0.42], [0.25, 0.7], [0.55, 0.95], [0.78, 1], [0.93, 0.8], [1, 0.25]];
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k < 16; k++) {
    const y = k / 15;
    pts.push(new THREE.Vector2(rAt(ctrl, y), y));
  }
  // demi-tour centré sur le dessus (+ un peu sur les côtés), puis axe Y → axe X
  return new THREE.LatheGeometry(pts, 26, Math.PI * 0.875, Math.PI * 1.25).rotateZ(-Math.PI / 2);
}

/** Étire l'arrière (x < 0) d'une calotte : l'arrière s'allonge et descend, sans cassure. */
function stretchBack<T extends THREE.BufferGeometry>(g: T, k: number): T {
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x < 0) {
      const t = -x;
      pos.setX(i, x - k * t * t);
      pos.setY(i, pos.getY(i) - 0.18 * k * t * t);
      pos.setZ(i, pos.getZ(i) * (1 - 0.18 * t * t));
    }
  }
  g.computeVertexNormals();
  return g;
}

const G = {
  thigh: keep(lathe(THIGH)),
  shortsLeg: keep(lathe(THIGH, 0, 0.8, 1.07)),
  calf: keep(lathe(CALF)),
  sockHigh: keep(lathe(CALF, 0.45, 1, 1.07)),
  sockMid: keep(lathe(CALF, 0.7, 1, 1.07)),
  sockLow: keep(lathe(CALF, 0.86, 1, 1.08)),
  overshoe: keep(lathe(CALF, 0.82, 1, 1.15)),
  upperArm: keep(lathe(UPPER_ARM)),
  sleeveShort: keep(lathe(UPPER_ARM, 0, 0.55, 1.12)),
  sleeveUpper: keep(lathe(UPPER_ARM, 0, 1, 1.1)),
  forearm: keep(lathe(FOREARM)),
  sleeveFore: keep(lathe(FOREARM, 0, 1, 1.1)),
  /** demi-sphère (calotte) pour les casques */
  dome: keep(new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
  /** coque de casque CLM à queue courte : axe X, avant en +X, arrière tronqué en −X */
  ttShell: keep(ttShellGeometry()),
  /** coque de casque route : calotte qui descend sous l'équateur (couvre la nuque et les tempes) */
  helmetShell: keep(new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI * 0.6)),
  /** liseré inférieur de la coque */
  helmetEdge: keep(new THREE.SphereGeometry(1.015, 40, 2, 0, Math.PI * 2, Math.PI * 0.555, Math.PI * 0.05)),
  /** coque de casque aéro : même calotte, étirée en douceur vers l'arrière (goutte d'eau courte) */
  aeroShell: keep(stretchBack(new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI * 0.6), 0.6)),
  aeroEdge: keep(stretchBack(new THREE.SphereGeometry(1.015, 40, 2, 0, Math.PI * 2, Math.PI * 0.555, Math.PI * 0.05), 0.6)),
  /** molette de serrage */
  dial: keep(new THREE.CylinderGeometry(1, 1, 1, 16)),
  /** verre de lunettes enveloppant (portion de cylindre ouvert, centré vers +X) */
  lens: keep(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true, Math.PI / 2 - 1.25, 2.5)),
};

/**
 * Prisme de hauteur 1 (axe Y) dont la section est donnée par des points [x, z] tournant
 * dans le sens direct. Les bouts sont fermés.
 */
function prism(section: Array<[number, number]>): THREE.BufferGeometry {
  const n = section.length;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k <= n; k++) {
    const [x, z] = section[k % n];
    pos.push(x, 0, z, x, 1, z);
    uv.push(k / n, 0, k / n, 1);
  }
  for (let k = 0; k < n; k++) {
    const a = 2 * k, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  for (const y of [0, 1]) {
    const base = pos.length / 3;
    pos.push(0, y, 0);
    uv.push(0.5, y);
    for (const [x, z] of section) {
      pos.push(x, y, z);
      uv.push(0.5, y);
    }
    for (let k = 0; k < n; k++) {
      const i = base + 1 + k, j = base + 1 + ((k + 1) % n);
      if (y === 0) idx.push(base, i, j);
      else idx.push(base, j, i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Section de tube « profil tronqué » (Kamm tail), comme sur les cadres aéro modernes :
 * bord d'attaque arrondi vers +X, flancs qui s'affinent, arrière coupé net.
 * Largeur ±1 (en Z), longueur de −1 à +1 (en X).
 */
function kammSection(): Array<[number, number]> {
  const pts: Array<[number, number]> = [[-1, 0], [-1, -0.5]];
  for (let k = 1; k <= 6; k++) {
    const x = -1 + (k / 6) * 1.2;
    pts.push([x, -(0.5 + 0.5 * Math.pow(k / 6, 0.6))]);
  }
  for (let k = 1; k < 16; k++) {
    const a = -Math.PI / 2 + (k / 16) * Math.PI;
    pts.push([0.2 + 0.8 * Math.cos(a), Math.sin(a)]);
  }
  for (let k = 6; k >= 1; k--) {
    const x = -1 + (k / 6) * 1.2;
    pts.push([x, 0.5 + 0.5 * Math.pow(k / 6, 0.6)]);
  }
  pts.push([-1, 0.5]);
  return pts;
}

/** Tube de cadre profilé (section Kamm), base à l'origine, longueur 1 le long de Y. */
const AIRFOIL = keep(prism(kammSection()));
/** Douille de direction conique : plus large en bas (roulement 1"1/2) qu'en haut. */
const HEAD_TUBE = keep(new THREE.CylinderGeometry(0.78, 1, 1, 18).translate(0, 0.5, 0));
/** Supports du décor « MyHomeRide » posé sur les deux flancs du tube diagonal. */
const DECAL_R = keep(new THREE.PlaneGeometry(1, 1).rotateZ(Math.PI / 2).scale(1.05, 0.62, 1).translate(0.15, 0.52, 1.03));
const DECAL_L = keep(new THREE.PlaneGeometry(1, 1).rotateZ(Math.PI / 2).scale(1.05, 0.62, 1).rotateX(Math.PI).translate(0.15, 0.52, -1.03));

// ---------------------------------------------------------------------------
// Outils de placement.

/** Place une géométrie « le long de Y » entre deux points, avec un rayon (et une épaisseur). */
function place(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, depth = 1): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length() || 1e-6;
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  // X local = épaisseur dans le plan du vélo, Z local = largeur
  mesh.scale.set(radius * depth, len, radius);
}

/** Ellipsoïde centré en p, de demi-axes (x, y, z). */
function blob(material: THREE.Material, p: THREE.Vector3, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(UNIT_SPHERE, material);
  m.position.copy(p);
  m.scale.set(x, y, z);
  return m;
}

function box(material: THREE.Material, p: THREE.Vector3, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(UNIT_BOX, material);
  m.position.copy(p);
  m.scale.set(x, y, z);
  return m;
}

/** Cinématique inverse à deux segments dans le plan X-Y (bend +1 : vers l'avant, −1 : vers l'arrière). */
function solve2(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, bend: number): THREE.Vector3 {
  const dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const ang = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)) * bend;
  const base = Math.atan2(dy, dx);
  return V(a.x + Math.cos(base + ang) * l1, a.y + Math.sin(base + ang) * l1, a.z);
}

/**
 * Position de l'épaule : intersection du cercle de rayon `torso` autour de la hanche et du
 * cercle de rayon `reach` autour des mains (solution du dessus). Si les mains sont trop loin,
 * les bras se tendent et le buste pointe vers elles.
 */
function fitShoulder(hip: THREE.Vector3, grip: THREE.Vector3, torso: number, reach: number): THREE.Vector3 {
  const dx = grip.x - hip.x, dy = grip.y - hip.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const r = Math.min(Math.max(reach, d - torso + 1e-3), d + torso - 1e-3);
  const a = (torso * torso - r * r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, torso * torso - a * a));
  return V(hip.x + (a * dx) / d - (h * dy) / d, hip.y + (a * dy) / d + (h * dx) / d);
}

// ---------------------------------------------------------------------------
// Géométrie des cadres (roue arrière en x = 0). Valeurs en mètres pour un cadre « M ».

type Hands = 'hoods' | 'flare' | 'flat' | 'tt';
interface FrameGeo {
  /** rayon de la roue avec le pneu */
  R: number;
  /** demi-épaisseur du pneu */
  tire: number;
  wheelbase: number;
  bb: [number, number];
  seatTop: [number, number];
  headTop: [number, number];
  headBot: [number, number];
  /** rayon des tubes */
  tube: number;
  /** profondeur des tubes (profil aéro > 1) */
  deep: number;
  /** hauteur où les haubans rejoignent le tube de selle (fraction, haubans plongeants) */
  stayAt: number;
  /** angle du buste au-dessus de l'horizontale (degrés) */
  torso: number;
  hands: Hands;
  /** potence : longueur (m) et angle par rapport à l'horizontale (degrés, + = vers le haut) */
  stemLen: number;
  stemAngle: number;
  /** hauteur d'entretoises sous la potence (m) */
  spacer: number;
  /** recul de la selle (m, + = vers l'avant) */
  saddleFwd: number;
  suspension: boolean;
}

const GEO: Record<FrameId, FrameGeo> = {
  // Route « grimpeur » (esprit Scott Addict RC) : tubes fins à profil tronqué, haubans plongeants.
  climb: { R: 0.335, tire: 0.0135, wheelbase: 0.99, bb: [0.41, 0.27], seatTop: [0.26, 0.78], headTop: [0.85, 0.79], headBot: [0.895, 0.635], tube: 0.0155, deep: 1.6, stayAt: 0.7, torso: 41, hands: 'hoods', stemLen: 0.11, stemAngle: -8, spacer: 0.02, saddleFwd: 0, suspension: false },
  // Route aéro (esprit Scott Foil) : tubes très profonds, haubans bas, avant plus bas.
  aero: { R: 0.335, tire: 0.0135, wheelbase: 0.99, bb: [0.41, 0.27], seatTop: [0.27, 0.77], headTop: [0.85, 0.77], headBot: [0.893, 0.62], tube: 0.0135, deep: 2.6, stayAt: 0.6, torso: 37, hands: 'hoods', stemLen: 0.115, stemAngle: -10, spacer: 0.01, saddleFwd: 0.005, suspension: false },
  // Gravel (esprit Scott Addict Gravel) : pneus larges, cintre évasé, avant plus haut.
  gravel: { R: 0.35, tire: 0.02, wheelbase: 1.03, bb: [0.43, 0.28], seatTop: [0.27, 0.77], headTop: [0.88, 0.81], headBot: [0.925, 0.645], tube: 0.0165, deep: 1.5, stayAt: 0.68, torso: 45, hands: 'flare', stemLen: 0.09, stemAngle: -4, spacer: 0.03, saddleFwd: 0, suspension: false },
  // Contre-la-montre (esprit Scott Plasma) : avant massif et intégré, prolongateurs.
  tt: { R: 0.335, tire: 0.0125, wheelbase: 1.0, bb: [0.42, 0.27], seatTop: [0.31, 0.74], headTop: [0.86, 0.71], headBot: [0.89, 0.6], tube: 0.013, deep: 3.0, stayAt: 0.55, torso: 13, hands: 'tt', stemLen: 0.1, stemAngle: 0, spacer: 0, saddleFwd: 0.035, suspension: false },
  // VTT tout-suspendu 29" (esprit Scott Spark) : direction très couchée (65,5°), fourche longue,
  // tube horizontal plongeant, potence courte, cintre large relevé, amortisseur sous le tube horizontal.
  mtb: { R: 0.37, tire: 0.029, wheelbase: 1.18, bb: [0.44, 0.34], seatTop: [0.33, 0.75], headTop: [0.954, 0.97], headBot: [1.0, 0.87], tube: 0.021, deep: 1.35, stayAt: 0.74, torso: 50, hands: 'flat', stemLen: 0.05, stemAngle: 0, spacer: 0.02, saddleFwd: 0, suspension: true },
};

// ---------------------------------------------------------------------------
// Textures du maillot.

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Texture du buste. Repère : x = tour du corps (0 = côté droit, 64 = poitrine,
 * 128 = côté gauche, 192 = dos), y = hauteur (0 = col, 256 = bas du maillot).
 */
function jerseyTexture(look: RiderLook): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const c1 = look.jerseyColor, c2 = look.jerseyColor2, c3 = look.jerseyColor3;
  g.fillStyle = c1;
  g.fillRect(0, 0, 256, 256);
  switch (look.pattern) {
    case 'hoops':
      g.fillStyle = c2;
      for (let y = 40; y < 240; y += 44) g.fillRect(0, y, 256, 20);
      break;
    case 'diagonal':
      g.strokeStyle = c2;
      g.lineWidth = 46;
      g.beginPath();
      g.moveTo(132, 10); g.lineTo(-8, 250); // écharpe sur la poitrine
      g.moveTo(264, 10); g.lineTo(124, 250); // et dans le dos
      g.stroke();
      g.strokeStyle = c3;
      g.lineWidth = 5;
      for (const dx of [-25, 25]) {
        g.beginPath();
        g.moveTo(132 + dx, 10); g.lineTo(-8 + dx, 250);
        g.moveTo(264 + dx, 10); g.lineTo(124 + dx, 250);
        g.stroke();
      }
      break;
    case 'chest':
      g.fillStyle = c2;
      g.fillRect(0, 74, 256, 46);
      g.fillStyle = c3;
      g.fillRect(0, 70, 256, 5);
      g.fillRect(0, 120, 256, 5);
      break;
    case 'shoulders':
      g.fillStyle = c2;
      g.fillRect(0, 0, 256, 70);
      g.fillStyle = c3;
      g.fillRect(0, 68, 256, 6);
      // panneaux latéraux
      g.fillStyle = c2;
      g.fillRect(0, 74, 12, 182);
      g.fillRect(116, 74, 24, 182);
      g.fillRect(244, 74, 12, 182);
      break;
    case 'checker': {
      g.fillStyle = c2;
      const n = 32;
      for (let y = 0; y < 256; y += n) for (let x = 0; x < 256; x += n) if (((x + y) / n) % 2 === 0) g.fillRect(x, y, n, n);
      break;
    }
    case 'polka':
      g.fillStyle = c2;
      for (let y = 14, row = 0; y < 256; y += 30, row++) {
        for (let x = row % 2 ? 16 : 0; x < 270; x += 32) {
          g.beginPath();
          g.arc(x, y, 9, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    case 'gradient': {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, c2);
      grad.addColorStop(0.75, c1);
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      break;
    }
    case 'solid':
    default:
      // coutures latérales
      g.fillStyle = c3;
      g.fillRect(0, 0, 3, 256);
      g.fillRect(126, 0, 4, 256);
      g.fillRect(253, 0, 3, 256);
      break;
  }
  // col et bas du maillot
  g.fillStyle = c3;
  g.fillRect(0, 0, 256, 10);
  g.fillRect(0, 244, 256, 12);
  // fermeture éclair sur la poitrine
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(63, 0, 2, 256);
  return toTexture(c);
}

/** Inscription « MyHomeRide » du tube diagonal (fond transparent). */
function wordmarkTexture(color: string): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = color;
  g.font = 'italic 800 78px system-ui, "Segoe UI", sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText('MyHomeRide', 256, 66);
  // petit trait de soulignement dynamique
  g.fillRect(70, 108, 372, 6);
  return toTexture(c);
}

/** Texture d'une manche : couleur de base et, si demandé, bord-côte de couleur 3. */
function sleeveTexture(base: string, cuff: string | null, hoop: string | null): THREE.CanvasTexture {
  const [c, g] = canvas(32, 64);
  g.fillStyle = base;
  g.fillRect(0, 0, 32, 64);
  if (hoop) {
    g.fillStyle = hoop;
    g.fillRect(0, 22, 32, 10);
  }
  if (cuff) {
    // v = 1 (haut de l'image) = extrémité de la manche
    g.fillStyle = cuff;
    g.fillRect(0, 0, 32, 9);
  }
  return toTexture(c);
}

// ---------------------------------------------------------------------------

export class RiderModel {
  readonly root = new THREE.Group();
  /** groupe incliné selon la pente (le vélo suit la route) */
  readonly body = new THREE.Group();
  /** objets cachés en vue « cockpit » (tête, casque, lunettes) */
  readonly headParts: THREE.Object3D[] = [];
  /** position des yeux et de la poitrine (repère du groupe body), pour les caméras */
  readonly eye = new THREE.Vector3();
  readonly chest = new THREE.Vector3();
  crankAngle = 0;

  private wheels: THREE.Group[] = [];
  private crank = new THREE.Group();
  private legs: Array<{ side: number; thigh: THREE.Mesh[]; calf: THREE.Mesh[]; knee: THREE.Mesh; ankle: THREE.Mesh; foot: THREE.Group }> = [];
  private hip: THREE.Vector3;
  private bb: THREE.Vector3;
  private thighLen: number;
  private shinLen: number;
  private s: number;
  private limbR: number;
  private shadow: THREE.Mesh;

  constructor(look: RiderLook, opts: { trainer?: boolean } = {}) {
    const s = (this.s = look.heightCm / 178);
    // Corpulence : 0 pour un IMC de 22, positif au-dessus, négatif en dessous.
    const bmi = look.weightKg / Math.pow(look.heightCm / 100, 2);
    const build = Math.min(1.4, Math.max(-0.6, (bmi - 22) / 5));
    const wm = 1 + 0.13 * build;
    this.limbR = wm;
    this.thighLen = 0.44 * s;
    this.shinLen = 0.43 * s;
    const geo = GEO[look.frame] ?? GEO.climb;
    this.root.add(this.body);

    // ----- Matériaux
    const own: THREE.Material[] = [];
    const lam = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => {
      const m = new THREE.MeshLambertMaterial({ color, ...extra });
      own.push(m);
      return m;
    };
    const shiny = (color: THREE.ColorRepresentation, shininess = 60, specular: THREE.ColorRepresentation = '#555555') => {
      const m = new THREE.MeshPhongMaterial({ color, shininess, specular });
      own.push(m);
      return m;
    };
    const mFrame = look.finish === 'matte' ? lam(look.frameColor) : shiny(look.frameColor, 80, '#777777');
    const mDecal = look.finish === 'matte' ? lam(look.frameColor2) : shiny(look.frameColor2, 80, '#777777');
    const groupColor = look.groupset === 'silver' ? '#b9bec4' : '#1e2023';
    const mGroup = shiny(groupColor, look.groupset === 'silver' ? 90 : 40, look.groupset === 'silver' ? '#cccccc' : '#444444');
    const mBlack = lam('#1b1c1f');
    const mRubber = lam('#121212');
    const mTan = lam('#b98d5c');
    const mRim = look.wheels === 'alu' ? shiny('#3a3d41', 50) : shiny('#1d1e20', 70, '#666666');
    const mDecalW = lam('#d9dde0', { side: THREE.DoubleSide });
    const mTape = lam(look.barTape);
    const mSaddle = lam(look.saddleColor);
    const mSkin = lam(look.skin);
    const mShorts = lam(look.shortsColor);
    const mSock = lam(look.sockColor);
    const mShoe = shiny(look.overshoes ? '#141414' : look.shoeColor, 50);
    const mSole = lam('#202020');
    const mDial = shiny('#2a2c30', 60);
    const mGlove = lam('#1c1d20');
    const mHair = lam(look.hairColor);
    const mHelmet = shiny(look.helmetColor, 70, '#666666');
    mHelmet.side = THREE.DoubleSide; // l'intérieur des coques ouvertes reste visible
    const mHelmetDark = lam('#1a1a1a');
    const lens = LENS[look.lens] ?? LENS.dark;
    const mLens = new THREE.MeshPhongMaterial({ color: lens.color, specular: lens.specular, shininess: 120, side: THREE.DoubleSide, transparent: look.lens === 'clear', opacity: look.lens === 'clear' ? 0.55 : 1 });
    own.push(mLens);
    const jerseyTex = jerseyTexture(look);
    const mJersey = lam('#ffffff', { map: jerseyTex });
    const sleeveBase = look.pattern === 'shoulders' ? look.jerseyColor2 : look.jerseyColor;
    const sleeveHoop = look.pattern === 'hoops' ? look.jerseyColor2 : null;
    const mSleeveCuff = lam('#ffffff', { map: sleeveTexture(sleeveBase, look.jerseyColor3, sleeveHoop) });
    const mSleevePlain = lam('#ffffff', { map: sleeveTexture(sleeveBase, null, null) });
    const mShoulder = lam(sleeveBase);

    // ----- Vélo
    const bike = new THREE.Group();
    const R = geo.R;
    const rear = V(0, R), front = V(geo.wheelbase, R);
    const bb = (this.bb = V(geo.bb[0], geo.bb[1]));
    const seatTop = V(...geo.seatTop), headTop = V(...geo.headTop), headBot = V(...geo.headBot);
    const tube = (mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number, depth = 1) => {
      const m = new THREE.Mesh(UNIT_CYL, mat);
      place(m, a, b, r, depth);
      bike.add(m);
      return m;
    };
    const T = geo.tube, D = geo.deep;
    /** tube de cadre : profil tronqué si le cadre est profilé, rond sinon */
    const ftube = (a: THREE.Vector3, b: THREE.Vector3, r: number, depth = D, mat: THREE.Material = mFrame) => {
      const m = new THREE.Mesh(depth > 1.05 ? AIRFOIL : UNIT_CYL, mat);
      place(m, a, b, r, depth);
      bike.add(m);
      return m;
    };
    const ttDepth = Math.min(D, 1.4);
    // triangle avant
    ftube(bb, seatTop, T, D); // tube de selle
    ftube(bb, headBot.clone().add(V(-0.01, -0.01)), T * 1.4, D * 0.95); // tube diagonal
    // tube horizontal (plongeant sur le VTT : il rejoint le tube de selle bien plus bas)
    ftube(geo.suspension ? bb.clone().lerp(seatTop, 0.8) : seatTop.clone().add(V(-0.01, 0)), headTop.clone().add(V(-0.012, -0.02)), T * 0.95, ttDepth);
    {
      // douille conique, profilée sur les cadres aéro
      const ht = new THREE.Mesh(D > 2 ? AIRFOIL : HEAD_TUBE, mFrame);
      place(ht, headBot.clone().add(V(0.005, -0.035)), headTop.clone().add(V(-0.004, 0.012)), T * (D > 2 ? 1.5 : 1.75), D > 2 ? 1.9 : 1);
      bike.add(ht);
    }
    bike.add(blob(mFrame, bb, 0.034, 0.034, 0.045)); // boîtier de pédalier
    bike.add(blob(mFrame, seatTop.clone().add(V(-0.004, -0.008)), T * 1.25, T * 1.6, T * 1.1)); // nœud de selle
    // décor « MyHomeRide » sur les deux flancs du tube diagonal
    {
      const mWord = lam('#ffffff', { map: wordmarkTexture(look.frameColor2), transparent: true, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
      for (const g of [DECAL_R, DECAL_L]) {
        const m = new THREE.Mesh(g, mWord);
        place(m, bb, headBot.clone().add(V(-0.01, -0.01)), T * 1.4, D * 0.95);
        bike.add(m);
      }
    }
    // liseré de couleur 2 sur le haut du tube de selle et le bas de la fourche
    ftube(bb.clone().lerp(seatTop, 0.88), seatTop, T * 1.04, D * 1.02, mDecal);

    // triangle arrière
    const pivot = bb.clone().add(V(-0.035, 0.08));
    const stayTop = bb.clone().lerp(seatTop, geo.stayAt);
    for (const z of [-0.064, 0.064]) {
      // bases (pour le VTT : bras oscillant jusqu'au pivot principal)
      ftube(V(0, R, z), geo.suspension ? V(pivot.x, pivot.y, z * 0.6) : V(bb.x - 0.03, bb.y + 0.005, z * 0.5), T * (geo.suspension ? 0.85 : 0.68), 1.25);
      // haubans plongeants
      ftube(V(0.005, R + 0.005, z), V(stayTop.x - (geo.suspension ? 0.05 : 0), stayTop.y, z * 0.32), T * 0.55, Math.min(D, 1.5));
      bike.add(box(mFrame, V(0.005, R, z * 1.02), 0.04, 0.03, 0.008)); // patte de roue
    }
    if (geo.suspension) {
      // biellette sur le tube de selle, amortisseur couché sous le tube horizontal
      const rkPivot = bb.clone().lerp(seatTop, 0.75);
      const rkBack = V(stayTop.x - 0.05, stayTop.y);
      const rkFront = rkPivot.clone().add(V(0.07, 0.025));
      for (const z of [-0.03, 0.03]) tube(mBlack, V(rkBack.x, rkBack.y, z), V(rkFront.x, rkFront.y, z), 0.011, 1.8);
      bike.add(blob(mBlack, rkPivot, 0.016, 0.016, 0.04));
      const shockEnd = bb.clone().lerp(headBot, 0.3).add(V(-0.01, 0.045));
      const can = rkFront.clone().lerp(shockEnd, 0.5);
      tube(mBlack, rkFront, can, 0.024); // chambre à air
      tube(shiny('#c9ccd0', 90, '#ffffff'), can, shockEnd, 0.011); // tige
      tube(lam('#d03a2a'), can.clone().lerp(rkFront, 0.15), can.clone().lerp(rkFront, 0.3), 0.025); // bague de réglage
      bike.add(blob(mFrame, shockEnd, 0.02, 0.02, 0.03)); // patte d'amortisseur
      bike.add(blob(mBlack, pivot, 0.02, 0.02, 0.05)); // pivot principal
    }
    // fourche
    if (geo.suspension) {
      // fourche suspendue : té noir, plongeurs dorés, fourreaux et arceau noirs
      const crown = V(headBot.x + 0.005, headBot.y - 0.035);
      bike.add(blob(mBlack, crown, 0.035, 0.025, 0.075));
      const mGold = shiny('#c9a24a', 90, '#fff2c0');
      const fdir = new THREE.Vector3().subVectors(front, crown);
      const knee = crown.clone().addScaledVector(fdir, 0.42);
      for (const z of [-0.06, 0.06]) {
        tube(mGold, V(crown.x, crown.y, z), V(knee.x, knee.y, z), 0.0175);
        tube(mBlack, V(knee.x, knee.y, z), V(front.x, front.y, z), 0.022);
      }
      const arch = knee.clone().addScaledVector(fdir, 0.08).add(V(0.035, 0));
      tube(mBlack, V(arch.x, arch.y, -0.06), V(arch.x + 0.02, arch.y + 0.02, 0), 0.014);
      tube(mBlack, V(arch.x + 0.02, arch.y + 0.02, 0), V(arch.x, arch.y, 0.06), 0.014);
    } else {
      // fourche fuselée, té intégré dans la douille
      const crown = V(headBot.x + 0.004, headBot.y - 0.04);
      bike.add(blob(mFrame, crown, 0.03, 0.022, 0.05));
      for (const z of [-0.055, 0.055]) {
        const m = new THREE.Mesh(AIRFOIL, mFrame);
        place(m, V(front.x - 0.004, front.y, z * 0.95), V(crown.x, crown.y, z * 0.7), T * 0.85, Math.min(D * 0.95, 2.4));
        bike.add(m);
      }
    }

    // ----- Position du cycliste : selle, hanche, buste, mains.
    const stDir = new THREE.Vector3().subVectors(seatTop, bb).normalize();
    const legReach = 0.955 * (this.thighLen + this.shinLen);
    // Hauteur de selle : on cherche la distance qui donne une jambe presque tendue en bas du tour.
    let lo = 0.3, hi = 1.1;
    for (let it = 0; it < 30; it++) {
      const d = (lo + hi) / 2;
      const hip = this.hipFor(bb, stDir, d, geo.saddleFwd);
      let maxReach = 0;
      for (let k = 0; k < 24; k++) maxReach = Math.max(maxReach, hip.distanceTo(this.ankleAt(bb, (k / 24) * Math.PI * 2, 0)));
      if (maxReach > legReach) hi = d; else lo = d;
    }
    const saddleD = lo;
    const saddle = bb.clone().addScaledVector(stDir, saddleD).add(V(geo.saddleFwd, 0));
    this.hip = this.hipFor(bb, stDir, saddleD, geo.saddleFwd);
    const hip = this.hip;
    const torsoLen = 0.54 * s;
    // bras : épaule → coude, puis coude → milieu de la main posée sur le cintre
    const upperArm = 0.3 * s, foreArm = 0.33 * s;
    /** articulation de l'épaule par rapport au haut du buste */
    const shOff = V(-0.01 * s, -0.035 * s);

    // tige de selle + selle
    const postEnd = saddle.clone().addScaledVector(stDir, -0.025);
    if (geo.suspension) {
      // tige de selle télescopique : fourreau noir, partie coulissante argentée
      const mid = seatTop.clone().lerp(postEnd, 0.45);
      tube(mBlack, seatTop, mid, 0.017);
      tube(shiny('#2b2d30', 70, '#888888'), mid, postEnd, 0.0145);
    } else {
      ftube(seatTop, postEnd, T * 0.95, Math.min(D, 1.9), D > 2 ? mFrame : mBlack); // tige profilée
    }
    // selle à bec court (rembourrage + coque)
    bike.add(blob(mSaddle, saddle.clone().add(V(-0.04, 0.013)), 0.07, 0.019, 0.072));
    bike.add(blob(mSaddle, saddle.clone().add(V(0.055, 0.007)), 0.075, 0.016, 0.032));
    bike.add(blob(mBlack, saddle.clone().add(V(-0.01, 0.0)), 0.11, 0.012, 0.055));
    bike.add(blob(mBlack, saddle.clone().add(V(-0.02, 0.031)), 0.06, 0.004, 0.01)); // canal central
    tube(mGroup, saddle.clone().add(V(-0.09, -0.005, -0.03)), saddle.clone().add(V(0.12, 0.0, -0.015)), 0.003);
    tube(mGroup, saddle.clone().add(V(-0.09, -0.005, 0.03)), saddle.clone().add(V(0.12, 0.0, 0.015)), 0.003);

    // Cockpit : sa position vient du vélo (entretoises + potence), comme en vrai ;
    // le cycliste s'y adapte en inclinant le buste pour que ses mains tombent sur le cintre.
    const hands: THREE.Vector3[] = [];
    const elbows: THREE.Vector3[] = [];
    let barCenter: THREE.Vector3;
    let shoulder: THREE.Vector3;
    const axis = new THREE.Vector3().subVectors(headTop, headBot).normalize();
    const stemFrom = headTop.clone().addScaledVector(axis, geo.spacer + 0.012);
    if (geo.hands === 'tt') {
      // Avant-bras posés sur les manchettes (8,5 cm au-dessus de la douille), bras verticaux.
      const padY = headTop.y + 0.085;
      const dy = Math.min(torsoLen * 0.9, padY + upperArm * 0.97 - shOff.y - hip.y);
      shoulder = hip.clone().add(V(Math.sqrt(torsoLen * torsoLen - dy * dy), dy));
      const elbowC = shoulder.clone().add(shOff).add(V(0.03 * s, -upperArm * 0.97));
      barCenter = elbowC.clone().add(V(0.07, -0.07));
      for (const side of [-1, 1]) {
        const el = V(elbowC.x, elbowC.y, side * 0.095);
        const hd = V(elbowC.x + foreArm * 0.9, elbowC.y + 0.04, side * 0.045);
        elbows.push(el);
        hands.push(hd);
        // manchette creuse et coussin
        bike.add(box(mBlack, V(el.x + 0.015, el.y - 0.04, el.z), 0.12, 0.012, 0.08));
        bike.add(blob(lam('#2f3237'), V(el.x + 0.015, el.y - 0.03, el.z), 0.06, 0.012, 0.036));
        // rehausses entre la base et les manchettes
        tube(mBlack, V(el.x + 0.02, el.y - 0.046, side * 0.085), V(barCenter.x - 0.005, barCenter.y, side * 0.085), 0.012, 1.6);
        // prolongateur « ski » : droit puis relevé au bout
        const ext = new THREE.CatmullRomCurve3([
          V(el.x - 0.02, el.y - 0.05, side * 0.06),
          V(el.x + 0.12, el.y - 0.05, side * 0.052),
          V(hd.x + 0.02, hd.y - 0.035, side * 0.045),
          V(hd.x + 0.055, hd.y - 0.005, side * 0.045),
          V(hd.x + 0.065, hd.y + 0.035, side * 0.045),
        ]);
        bike.add(new THREE.Mesh(new THREE.TubeGeometry(ext, 24, 0.011, 8), mBlack));
        // cornes de la base, avec levier de frein au bout
        const horn = new THREE.CatmullRomCurve3([
          V(barCenter.x, barCenter.y, side * 0.17),
          V(barCenter.x + 0.04, barCenter.y - 0.005, side * 0.215),
          V(barCenter.x + 0.11, barCenter.y - 0.03, side * 0.22),
          V(barCenter.x + 0.14, barCenter.y - 0.06, side * 0.215),
        ]);
        bike.add(new THREE.Mesh(new THREE.TubeGeometry(horn, 16, 0.013, 8), mTape));
        tube(mGroup, V(barCenter.x + 0.145, barCenter.y - 0.06, side * 0.215), V(barCenter.x + 0.19, barCenter.y - 0.075, side * 0.215), 0.006, 1.6);
      }
      // base en aile
      {
        const wing = new THREE.Mesh(AIRFOIL, mBlack);
        place(wing, V(barCenter.x + 0.01, barCenter.y, -0.18), V(barCenter.x + 0.01, barCenter.y, 0.18), 0.008, 3.6);
        bike.add(wing);
      }
    } else {
      const sa = (geo.stemAngle * Math.PI) / 180;
      barCenter = stemFrom.clone().add(V(Math.cos(sa) * geo.stemLen, Math.sin(sa) * geo.stemLen));
      if (geo.hands === 'flat') {
        // cintre VTT relevé (3 cm), large (76 cm), légèrement reculé vers les mains
        const w = 0.38, rise = 0.03, bc = barCenter;
        const bar = new THREE.CatmullRomCurve3([
          V(bc.x - 0.03, bc.y + rise, -w), V(bc.x - 0.012, bc.y + rise, -0.2), V(bc.x, bc.y + 0.006, -0.08), V(bc.x, bc.y, 0),
          V(bc.x, bc.y + 0.006, 0.08), V(bc.x - 0.012, bc.y + rise, 0.2), V(bc.x - 0.03, bc.y + rise, w),
        ]);
        bike.add(new THREE.Mesh(new THREE.TubeGeometry(bar, 40, 0.0115, 8), mBlack));
        for (const side of [-1, 1]) {
          const g0 = V(bc.x - 0.024, bc.y + rise, side * (w - 0.13)), g1 = V(bc.x - 0.03, bc.y + rise, side * w);
          tube(mTape, g0, g1, 0.016); // poignée
          tube(mGroup, V(bc.x - 0.018, bc.y + rise + 0.01, side * (w - 0.155)), V(bc.x + 0.06, bc.y + rise - 0.005, side * (w - 0.06)), 0.005); // levier de frein
          bike.add(blob(mBlack, V(bc.x - 0.02, bc.y + rise, side * (w - 0.15)), 0.02, 0.018, 0.012)); // maître-cylindre
          hands.push(V(bc.x - 0.022, bc.y + rise + 0.012, side * (w - 0.07)));
        }
      } else {
        // Cintre route : la main est posée sur la cocotte, 8 cm devant le haut du cintre.
        const w = geo.hands === 'flare' ? 0.215 : 0.2;
        const flare = geo.hands === 'flare' ? 0.045 : 0.008;
        // cintre-potence monobloc : le dessus du cintre est une aile plate (cockpit intégré)
        {
          const wing = new THREE.Mesh(AIRFOIL, mBlack);
          place(wing, V(barCenter.x + 0.008, barCenter.y, -(w - 0.04)), V(barCenter.x + 0.008, barCenter.y, w - 0.04), 0.0085, 2.7);
          bike.add(wing);
        }
        for (const side of [-1, 1]) {
          const z = side * w;
          const curve = new THREE.CatmullRomCurve3([
            V(barCenter.x + 0.004, barCenter.y, side * (w - 0.06)),
            V(barCenter.x + 0.015, barCenter.y, side * (w - 0.025)),
            V(barCenter.x + 0.065, barCenter.y - 0.005, z),
            V(barCenter.x + 0.09, barCenter.y - 0.055, z + side * flare * 0.4),
            V(barCenter.x + 0.065, barCenter.y - 0.12, z + side * flare),
            V(barCenter.x - 0.02, barCenter.y - 0.128, z + side * flare),
          ]);
          bike.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.0118, 8), mTape));
          // cocotte et levier
          const hood = V(barCenter.x + 0.08, barCenter.y + 0.012, z + side * 0.002);
          const h = blob(mBlack, hood.clone().add(V(-0.005, -0.002)), 0.042, 0.02, 0.016);
          h.rotation.z = 0.3;
          bike.add(h, blob(mBlack, hood.clone().add(V(0.03, 0.012)), 0.012, 0.014, 0.012));
          tube(mGroup, hood.clone().add(V(0.025, -0.01)), hood.clone().add(V(0.02, -0.12)), 0.0055, 1.8);
          hands.push(hood.clone().add(V(-0.005, 0.02, 0)));
        }
      }
      // Épaule : à torsoLen de la hanche et à portée de bras (coudes un peu fléchis) des mains.
      shoulder = fitShoulder(hip, hands[1].clone().sub(shOff).setZ(0), torsoLen, (upperArm + foreArm) * (geo.hands === 'flat' ? 0.88 : 0.9));
    }
    const ta = Math.atan2(shoulder.y - hip.y, shoulder.x - hip.x);
    // potence
    if (geo.hands === 'flat') {
      tube(mBlack, stemFrom, barCenter, 0.017, 1.1);
      tube(mBlack, headTop.clone().add(V(-0.005, 0.0)), stemFrom, 0.019); // entretoises
    } else {
      // potence profilée, câbles cachés ; cache-entretoises dans le prolongement de la douille
      const stem = new THREE.Mesh(AIRFOIL, mBlack);
      place(stem, stemFrom, barCenter, 0.016, 1.8);
      bike.add(stem);
      const cover = new THREE.Mesh(D > 2 ? AIRFOIL : HEAD_TUBE, D > 2 ? mFrame : mBlack);
      place(cover, headTop.clone().add(V(-0.004, 0.0)), stemFrom.clone().add(V(0, 0.012)), T * (D > 2 ? 1.5 : 1.35), D > 2 ? 1.9 : 1);
      bike.add(cover);
    }
    // compteur
    if (look.computer) {
      const cp = geo.hands === 'tt' ? hands[0].clone().lerp(hands[1], 0.5).add(V(-0.05, 0.005)) : barCenter.clone().add(V(0.07, 0.022));
      bike.add(box(mBlack, cp, 0.075, 0.016, 0.05));
      const screen = box(lam('#9fb4c4'), cp.clone().add(V(0, 0.0085)), 0.06, 0.002, 0.04);
      bike.add(screen);
    }
    // serviette posée sur le cintre (home trainer seulement)
    if (opts.trainer && look.towel && geo.hands !== 'tt') {
      // tissu souple : une bande qui passe par-dessus le cintre et retombe de chaque côté
      const mTowel = lam('#ece7dd', { side: THREE.DoubleSide });
      const path = new THREE.CatmullRomCurve3([
        V(-0.045, -0.11), V(-0.03, -0.03), V(-0.012, 0.012), V(0.012, 0.016), V(0.035, -0.02), V(0.05, -0.09), V(0.055, -0.15),
      ].map((p) => p.add(barCenter)));
      const cloth = new THREE.PlaneGeometry(1, 1, 1, 24);
      const pos = cloth.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const pt = path.getPoint(pos.getY(i) + 0.5);
        pos.setXYZ(i, pt.x, pt.y, pos.getX(i) * 0.2);
      }
      cloth.computeVertexNormals();
      bike.add(new THREE.Mesh(cloth, mTowel));
    }

    // ----- Roues
    const rimDepth = WHEELS[look.wheels].rimDepth / 1000;
    const tireR = geo.tire;
    for (const c of [rear, front]) {
      const isRear = c === rear;
      const w = new THREE.Group();
      w.position.copy(c);
      bike.add(w);
      // Disque de frein (côté gauche) et moyeu : présents même sur le trainer pour la roue avant.
      if (opts.trainer && isRear) continue;
      w.add(new THREE.Mesh(new THREE.TorusGeometry(R - tireR, tireR, 10, 64), look.tireWall === 'tan' ? mTan : mRubber));
      if (look.tireWall === 'tan') w.add(new THREE.Mesh(new THREE.TorusGeometry(R - tireR * 0.55, tireR * 0.62, 8, 64), mRubber));
      // crampons (VTT et, plus fins, gravel)
      if (geo.tire >= 0.019) {
        const rows = geo.suspension ? [-0.6, 0, 0.6] : [-0.35, 0.35];
        const n = geo.suspension ? 46 : 56;
        const knobs = new THREE.InstancedMesh(UNIT_BOX, mRubber, n * rows.length);
        const q = new THREE.Object3D();
        let i = 0;
        for (let k = 0; k < n; k++) {
          for (const [j, zr] of rows.entries()) {
            const a = ((k + (j % 2) * 0.5) / n) * Math.PI * 2;
            const rr = R - tireR * (Math.abs(zr) > 0.5 ? 0.45 : 0.08);
            q.position.set(Math.cos(a) * rr, Math.sin(a) * rr, zr * tireR);
            q.rotation.set(0, 0, a);
            q.scale.set(geo.suspension ? 0.009 : 0.005, geo.suspension ? 0.011 : 0.009, geo.suspension ? 0.011 : 0.008);
            q.updateMatrix();
            knobs.setMatrixAt(i++, q.matrix);
          }
        }
        w.add(knobs);
      }
      const rimOut = R - 2 * tireR + 0.003;
      const rimIn = rimOut - Math.max(0.02, rimDepth);
      for (const z of [-0.0095, 0.0095]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(rimIn, rimOut, 64), mRim);
        ring.position.z = z;
        (ring.material as THREE.Material).side = THREE.DoubleSide;
        w.add(ring);
        if (look.wheels !== 'alu') {
          // décor de jante générique
          for (const a0 of [0.3, 0.3 + Math.PI]) {
            const dec = new THREE.Mesh(new THREE.RingGeometry(rimIn + 0.25 * (rimOut - rimIn), rimIn + 0.7 * (rimOut - rimIn), 16, 1, a0, 0.9), mDecalW);
            dec.position.z = z * 1.06;
            w.add(dec);
          }
        }
      }
      // rayons (lignes fines) : alternés gauche/droite
      const nSpokes = look.wheels === 'alu' ? 28 : 24;
      const pts: number[] = [];
      for (let k = 0; k < nSpokes; k++) {
        const a = (k / nSpokes) * Math.PI * 2;
        const side = k % 2 ? 1 : -1;
        const ha = a + side * 0.12;
        pts.push(Math.cos(ha) * 0.022, Math.sin(ha) * 0.022, side * 0.03, Math.cos(a) * rimIn, Math.sin(a) * rimIn, 0);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lm = new THREE.LineBasicMaterial({ color: look.wheels === 'alu' ? '#8d9399' : '#202224' });
      own.push(lm);
      w.add(new THREE.LineSegments(sg, lm));
      // moyeu
      const hub = new THREE.Mesh(UNIT_CYL, mGroup);
      hub.scale.set(0.02, 0.11, 0.02);
      hub.rotation.x = Math.PI / 2;
      hub.position.z = -0.055;
      w.add(hub);
      // disque de frein
      const rotor = new THREE.Mesh(new THREE.RingGeometry(0.05, isRear ? 0.08 : 0.08, 28), shiny('#b5b9be', 90, '#cccccc'));
      (rotor.material as THREE.Material).side = THREE.DoubleSide;
      rotor.position.z = -0.065;
      w.add(rotor);
      if (isRear) {
        // cassette
        const cas = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.035, 20), mGroup);
        cas.rotation.x = Math.PI / 2;
        cas.position.z = 0.04;
        w.add(cas);
      }
      this.wheels.push(w);
    }
    // étriers de frein
    bike.add(box(mBlack, V(0.06, R + 0.05, -0.07), 0.05, 0.03, 0.02));
    bike.add(box(mBlack, V(geo.wheelbase - 0.07, R + 0.04, -0.07), 0.05, 0.03, 0.02));

    // ----- Transmission
    this.crank.position.copy(bb);
    const ringR = geo.suspension ? 0.075 : 0.1;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(ringR, ringR, 0.005, 44), mGroup);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = 0.065;
    this.crank.add(ring);
    const spider = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 5), mBlack);
    spider.rotation.x = Math.PI / 2;
    spider.position.z = 0.07;
    this.crank.add(spider);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(UNIT_CYL, mGroup);
      place(arm, V(0, 0, side * 0.075), V(0, -CRANK * side, side * 0.085), 0.011, 1.9);
      this.crank.add(arm);
    }
    bike.add(this.crank);
    // boîtier, chaîne et dérailleurs
    tube(mGroup, V(bb.x, bb.y, -0.07), V(bb.x, bb.y, 0.07), 0.021);
    const chainZ = 0.06;
    const cogTop = rear.clone().add(V(0, opts.trainer ? 0.04 : 0.045, chainZ));
    const cogBot = rear.clone().add(V(0.0, -0.04, chainZ));
    const mChain = shiny('#6f757b', 40);
    tube(mChain, V(bb.x, bb.y + ringR, chainZ), cogTop, 0.0035);
    tube(mChain, V(bb.x, bb.y - ringR, chainZ), cogBot.clone().add(V(0.01, -0.05)), 0.0035);
    bike.add(box(mGroup, rear.clone().add(V(0.0, -0.085, 0.065)), 0.035, 0.07, 0.018)); // dérailleur arrière
    bike.add(box(mGroup, bb.clone().lerp(seatTop, 0.2).add(V(0.03, 0, 0.035)), 0.045, 0.02, 0.012)); // dérailleur avant

    // ----- Bidons
    const mBottle = lam(look.bottleColor);
    const bottleOn = (a: THREE.Vector3, b: THREE.Vector3, t: number, inward: boolean) => {
      const d = new THREE.Vector3().subVectors(b, a).normalize();
      const n = inward ? V(-d.y, d.x) : V(d.y, -d.x);
      const c = a.clone().lerp(b, t).addScaledVector(n, T * D * 0.5 + 0.04);
      const p0 = c.clone().addScaledVector(d, -0.1), p1 = c.clone().addScaledVector(d, 0.1);
      tube(mBottle, p0, p1, 0.034);
      tube(mBlack, p1, p1.clone().addScaledVector(d, 0.025), 0.016);
      tube(mBlack, c.clone().addScaledVector(n, -0.03).addScaledVector(d, -0.08), c.clone().addScaledVector(n, -0.03).addScaledVector(d, 0.08), 0.004); // porte-bidon
    };
    if (look.bottles >= 1) bottleOn(bb, headBot, 0.36, true);
    if (look.bottles >= 2) bottleOn(bb, seatTop, 0.42, false);

    this.body.add(bike);

    // ----- Home trainer « direct drive » (roue arrière remplacée par le trainer)
    if (opts.trainer) {
      const mTrainer = shiny('#24272b', 30);
      const mCover = shiny('#d9dde1', 60);
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.11, 36), mTrainer);
      housing.rotation.x = Math.PI / 2;
      housing.position.set(0.0, R - 0.02, -0.03);
      this.body.add(housing);
      const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 36), mCover);
      cover.rotation.x = Math.PI / 2;
      cover.position.set(0.0, R - 0.02, -0.09);
      this.body.add(cover);
      this.body.add(box(mTrainer, V(0, (R - 0.02) / 2, -0.03), 0.12, R - 0.02, 0.1));
      const cog = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 20), mGroup);
      cog.rotation.x = Math.PI / 2;
      cog.position.set(0, R, chainZ);
      this.body.add(cog);
      const axle = new THREE.Mesh(UNIT_CYL, mGroup);
      axle.scale.set(0.012, 0.16, 0.012);
      axle.rotation.x = Math.PI / 2;
      axle.position.set(0, R, -0.08);
      this.body.add(axle);
      // pieds repliables
      const foot = (a: THREE.Vector3, b: THREE.Vector3) => {
        const m = new THREE.Mesh(UNIT_CYL, mTrainer);
        place(m, a, b, 0.022, 1.4);
        this.body.add(m);
      };
      foot(V(-0.24, 0.025, -0.36), V(-0.24, 0.025, 0.36));
      foot(V(0.24, 0.025, -0.33), V(0.24, 0.025, 0.33));
      foot(V(-0.24, 0.03, 0), V(0.24, 0.03, 0));
      foot(V(0, 0.03, -0.03), V(0, R - 0.1, -0.03));
      // cale de roue avant
      this.body.add(box(mTrainer, V(geo.wheelbase, 0.015, 0), 0.32, 0.03, 0.16));
    }

    // ----- Cycliste
    // bassin (cuissard) et buste (maillot)
    this.body.add(blob(mShorts, hip.clone().add(V(-0.005, -0.015)), 0.12 * s * wm, 0.095 * s * wm, 0.15 * s * wm));
    const belly = Math.max(0, build - 0.3) * 0.12;
    const torsoProfile: Array<[number, number]> = [[0, 0.86], [0.18, 0.8 + belly * 0.5], [0.38, 0.86 + belly], [0.62, 0.98 + belly * 0.4], [0.82, 1], [0.93, 0.84], [1, 0.42]];
    const torsoGeo = lathe(torsoProfile, 0, 1, 1, 18, 24);
    const torso = new THREE.Mesh(torsoGeo, mJersey);
    const torsoTop = shoulder.clone().add(V(Math.cos(ta) * 0.06 * s, Math.sin(ta) * 0.06 * s));
    place(torso, hip.clone().add(V(-0.02 * s, -0.01)), torsoTop, 1);
    torso.scale.x = 0.118 * s * (1 + 0.2 * build);
    torso.scale.z = 0.168 * s * (1 + 0.12 * build);
    this.body.add(torso);

    // cou, tête, visage
    const headAng = ta + (Math.PI / 2 - ta) * 0.45;
    const headC = shoulder.clone().add(V(Math.cos(headAng) * 0.175 * s, Math.sin(headAng) * 0.175 * s));
    const neck = new THREE.Mesh(UNIT_CYL, mSkin);
    place(neck, shoulder.clone().add(V(0.0, 0.02 * s)), headC.clone().add(V(-0.02 * s, -0.03 * s)), 0.047 * s * wm);
    this.body.add(neck);
    const hs = s * (1 + 0.04 * build);
    const head = blob(mSkin, headC, 0.1 * hs, 0.113 * hs, 0.082 * hs);
    const nose = blob(mSkin, headC.clone().add(V(0.097 * hs, -0.012 * hs)), 0.022 * hs, 0.02 * hs, 0.013 * hs);
    const ears = [-1, 1].map((side) => blob(mSkin, headC.clone().add(V(-0.005, -0.005, side * 0.08 * hs)), 0.022 * hs, 0.03 * hs, 0.012 * hs));
    this.body.add(head, nose, ...ears);
    this.headParts.push(neck, head, nose, ...ears);
    // cheveux et barbe
    const hairParts: THREE.Mesh[] = [];
    if (look.hair !== 'bald') {
      hairParts.push(blob(mHair, headC.clone().add(V(-0.028 * hs, 0.012 * hs)), 0.092 * hs, 0.108 * hs, 0.087 * hs));
      if (look.hair === 'long') hairParts.push(blob(mHair, headC.clone().add(V(-0.075 * hs, -0.085 * hs)), 0.055 * hs, 0.1 * hs, 0.08 * hs));
      if (look.hair === 'ponytail') {
        const tail = blob(mHair, headC.clone().add(V(-0.135 * hs, -0.04 * hs)), 0.06 * hs, 0.026 * hs, 0.026 * hs);
        tail.rotation.z = 0.7;
        hairParts.push(tail);
      }
    }
    if (look.beard !== 'none') {
      const mBeard = look.beard === 'full' ? mHair : lam(new THREE.Color(look.skin).lerp(new THREE.Color(look.hairColor), 0.45));
      const k = look.beard === 'full' ? 1.07 : 1.015;
      hairParts.push(blob(mBeard, headC.clone().add(V(0.02 * hs, -0.058 * hs)), 0.085 * hs * k, 0.06 * hs * k, 0.08 * hs * k));
    }
    this.body.add(...hairParts);
    this.headParts.push(...hairParts);

    // casque (lignes inspirées des casques Specialized : Prevail, Evade, TT5)
    const helmetParts: THREE.Object3D[] = [];
    const mVent = lam('#0d0e10');
    /** aération : fente sombre posée sur la coque, au point (x, z) de la calotte unité */
    const vent = (shell: THREE.Object3D, x: number, z: number, len: number, wid: number) => {
      const y = Math.sqrt(Math.max(0.02, 1 - x * x - z * z));
      const n = new THREE.Vector3(x, y, z).normalize();
      const m = new THREE.Mesh(UNIT_SPHERE, mVent);
      m.position.copy(n).multiplyScalar(0.972);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      m.scale.set(len, 0.034, wid);
      shell.add(m);
    };
    if (look.helmetType === 'tt') {
      const shell = new THREE.Mesh(G.ttShell, mHelmet);
      shell.scale.set(0.31 * hs, 0.125 * hs, 0.112 * hs);
      shell.position.copy(headC).add(V(-0.17 * hs, 0.03 * hs));
      shell.rotation.z = 0.12 + (ta - 0.25) * 0.4;
      helmetParts.push(shell);
      // bandeau sombre à l'arrière et deux prises d'air frontales
      const back = blob(mHelmetDark, headC.clone().add(V(-0.16 * hs, 0.02 * hs)), 0.012 * hs, 0.06 * hs, 0.075 * hs);
      helmetParts.push(back);
      for (const side of [-1, 1]) helmetParts.push(blob(mVent, headC.clone().add(V(0.11 * hs, 0.065 * hs, side * 0.03 * hs)), 0.012 * hs, 0.009 * hs, 0.016 * hs));
      // visière enveloppante aimantée
      const visor = new THREE.Mesh(G.lens, mLens);
      visor.scale.set(0.108 * hs, 0.075 * hs, 0.108 * hs);
      visor.position.copy(headC).add(V(0.006 * hs, 0.004 * hs));
      helmetParts.push(visor);
    } else {
      const aero = look.helmetType === 'aero';
      // la coque est un groupe à l'échelle de la tête : les aérations s'y placent en coordonnées unité
      const shell = new THREE.Group();
      shell.position.copy(headC).add(V(-0.016 * hs, 0.05 * hs));
      shell.scale.set((aero ? 0.15 : 0.145) * hs, (aero ? 0.098 : 0.104) * hs, (aero ? 0.108 : 0.112) * hs);
      shell.rotation.z = 0.3; // l'avant remonte au-dessus des sourcils, l'arrière descend sur la nuque
      shell.add(new THREE.Mesh(aero ? G.aeroShell : G.helmetShell, mHelmet), new THREE.Mesh(aero ? G.aeroEdge : G.helmetEdge, mHelmetDark));
      if (aero) {
        // Evade : coque lisse, trois entrées d'air à l'avant, deux sorties à l'arrière
        for (const z of [-0.34, 0, 0.34]) vent(shell, 0.74, z, 0.15, 0.09);
        for (const z of [-0.26, 0.26]) vent(shell, -0.55, z, 0.12, 0.07);
        vent(shell, 0.05, 0, 0.38, 0.05); // canal central
      } else {
        // Prevail : grandes fentes longitudinales réparties sur toute la calotte
        for (const z of [-0.62, -0.36, -0.12, 0.12, 0.36, 0.62]) {
          const edge = Math.abs(z) > 0.5;
          vent(shell, 0.42, z, edge ? 0.2 : 0.26, 0.095);
          vent(shell, -0.2, z * 1.02, edge ? 0.22 : 0.3, 0.095);
        }
        for (const z of [-0.2, 0.2]) vent(shell, -0.68, z, 0.14, 0.08);
        for (const z of [-0.42, -0.14, 0.14, 0.42]) vent(shell, 0.8, z, 0.1, 0.11); // ouïes du front
      }
      // molette de serrage à l'arrière
      const dial = new THREE.Mesh(G.dial, mHelmetDark);
      dial.position.set(aero ? -1.5 : -0.98, aero ? -0.48 : -0.32, 0);
      dial.rotation.z = Math.PI / 2;
      dial.scale.set(0.16, 0.12, 0.16);
      shell.add(dial);
      helmetParts.push(shell);
    }
    // jugulaires
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(UNIT_CYL, mHelmetDark);
      place(strap, headC.clone().add(V(-0.01 * hs, 0.02 * hs, side * 0.083 * hs)), headC.clone().add(V(0.04 * hs, -0.11 * hs, side * 0.025 * hs)), 0.003);
      helmetParts.push(strap);
    }
    // lunettes enveloppantes
    if (look.glasses && look.helmetType !== 'tt') {
      const glass = new THREE.Mesh(G.lens, mLens);
      glass.scale.set(0.094 * hs, 0.036 * hs, 0.094 * hs);
      glass.position.copy(headC).add(V(0.013 * hs, 0.014 * hs));
      helmetParts.push(glass);
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(UNIT_CYL, mBlack);
        place(arm, headC.clone().add(V(0.035 * hs, 0.016 * hs, side * 0.083 * hs)), headC.clone().add(V(-0.04 * hs, 0.012 * hs, side * 0.086 * hs)), 0.0025);
        helmetParts.push(arm);
      }
    }
    this.body.add(...helmetParts);
    this.headParts.push(...helmetParts);

    // bras
    const longSleeves = look.sleeves === 'long';
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const sh = V(shoulder.x - 0.01 * s, shoulder.y - 0.035 * s, side * 0.185 * s * (1 + 0.1 * build));
      const hand = hands[i].clone();
      const elbow = elbows[i] ?? solve2(sh, hand, upperArm, foreArm, -1).setZ(side * 0.235 * s);
      const ur = 0.046 * s * wm, fr = 0.038 * s * wm;
      this.body.add(blob(mShoulder, sh, 0.062 * s * wm, 0.06 * s * wm, 0.058 * s * wm)); // épaule
      const up = new THREE.Mesh(G.upperArm, mSkin);
      place(up, sh, elbow, ur);
      this.body.add(up);
      const sleeve = new THREE.Mesh(longSleeves ? G.sleeveUpper : G.sleeveShort, longSleeves ? mSleevePlain : mSleeveCuff);
      place(sleeve, sh, elbow, ur);
      this.body.add(sleeve);
      this.body.add(blob(longSleeves ? mSleevePlain : mSkin, elbow, fr * 1.05, fr * 1.05, fr * 1.05)); // coude
      if (longSleeves) {
        const fs = new THREE.Mesh(G.sleeveFore, mSleeveCuff);
        place(fs, elbow, hand, fr);
        this.body.add(fs);
      } else {
        const fa = new THREE.Mesh(G.forearm, mSkin);
        place(fa, elbow, hand, fr);
        this.body.add(fa);
      }
      // main (gant) et doigts
      const mHand = look.gloves === 'none' ? mSkin : mGlove;
      this.body.add(blob(mHand, hand.clone().add(V(0.012, 0.0)), 0.048 * s, 0.03 * s, 0.035 * s));
      const fingers = blob(look.gloves === 'mitts' ? mSkin : mHand, hand.clone().add(V(0.045 * s, -0.022 * s)), 0.022 * s, 0.03 * s, 0.03 * s);
      this.body.add(fingers);
    }

    // jambes (mises à jour à chaque image)
    const sockGeo = look.sockHeight === 'high' ? G.sockHigh : look.sockHeight === 'mid' ? G.sockMid : G.sockLow;
    for (const side of [-1, 1]) {
      const thighSkin = new THREE.Mesh(G.thigh, mSkin);
      const thighShorts = new THREE.Mesh(G.shortsLeg, mShorts);
      const calfSkin = new THREE.Mesh(G.calf, mSkin);
      const calfParts: THREE.Mesh[] = [calfSkin, new THREE.Mesh(sockGeo, mSock)];
      if (look.overshoes) calfParts.push(new THREE.Mesh(G.overshoe, mShoe));
      const knee = blob(mSkin, V(0, 0), 1, 1, 1);
      const ankle = blob(look.overshoes ? mShoe : mSock, V(0, 0), 1, 1, 1);
      // chaussure : repère local centré sur l'axe de la pédale
      const foot = new THREE.Group();
      foot.add(blob(mShoe, V(-0.022 * s, 0.038), 0.135 * s, 0.042, 0.047 * s));
      foot.add(blob(mShoe, V(-0.13 * s, 0.05), 0.04 * s, 0.045, 0.045 * s)); // talon renforcé
      foot.add(box(mSole, V(-0.022 * s, 0.006), 0.27 * s, 0.014, 0.088 * s));
      if (!look.overshoes) {
        // deux molettes de serrage sur le dessus
        for (const [dx, dy] of [[-0.055, 0.074], [0.02, 0.068]] as const) {
          const d = new THREE.Mesh(G.dial, mDial);
          d.position.set(dx * s, dy, 0.012 * side);
          d.scale.set(0.013, 0.008, 0.013);
          d.rotation.z = -0.2;
          foot.add(d);
        }
      }
      foot.add(box(mBlack, V(0, -0.008), 0.08, 0.014, 0.07)); // pédale
      this.body.add(thighSkin, thighShorts, ...calfParts, knee, ankle, foot);
      this.legs.push({ side, thigh: [thighSkin, thighShorts], calf: calfParts, knee, ankle, foot });
    }

    // repères pour les caméras
    this.eye.copy(headC).add(V(0.09 * hs, 0.05 * hs));
    this.chest.copy(shoulder).add(V(0.05 * s, -0.06 * s));

    // Ombre portée simplifiée (disque sombre au sol), utile en extérieur.
    const mShadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    own.push(mShadow);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2).scale(0.85, 1, 0.32), mShadow);
    this.shadow.position.set(geo.wheelbase / 2, 0.03, 0);
    this.shadow.visible = !opts.trainer;
    this.root.add(this.shadow);

    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o !== this.shadow) o.castShadow = true;
    });
    this.update(0, 0);
  }

  /** Bascule de la chaussure (rad, + = pointe vers le bas) selon l'angle du pédalier. */
  private static pitch(a: number): number {
    return 0.18 + 0.15 * Math.cos(a - 0.6);
  }

  /** Position de la pédale (angle 0 = pédale droite en bas). */
  private pedalAt(bb: THREE.Vector3, a: number, z: number): THREE.Vector3 {
    return V(bb.x - Math.sin(a) * CRANK, bb.y - Math.cos(a) * CRANK, z);
  }

  /** Position de la cheville : en arrière et au-dessus de l'axe de pédale, selon la bascule du pied. */
  private ankleAt(bb: THREE.Vector3, a: number, z: number): THREE.Vector3 {
    const p = this.pedalAt(bb, a, z);
    const d = -RiderModel.pitch(a);
    const ox = -0.09 * (this.s ?? 1), oy = 0.085;
    return V(p.x + ox * Math.cos(d) - oy * Math.sin(d), p.y + ox * Math.sin(d) + oy * Math.cos(d), z);
  }

  /** Articulation de la hanche, 8 cm au-dessus de la selle placée à la distance d sur le tube de selle. */
  private hipFor(bb: THREE.Vector3, stDir: THREE.Vector3, d: number, fwd: number): THREE.Vector3 {
    return bb.clone().addScaledVector(stDir, d).add(V(0.025 * (this.s ?? 1) + fwd, 0.08 * (this.s ?? 1)));
  }

  /** Anime le pédalage (cadence en tr/min) et la rotation des roues (vitesse en m/s). */
  update(dt: number, cadence: number, speed = 0): void {
    this.crankAngle += (cadence / 60) * Math.PI * 2 * dt;
    this.crank.rotation.z = -this.crankAngle;
    for (const w of this.wheels) w.rotation.z -= (speed / (w.position.y || 0.34)) * dt;
    const s = this.s, wm = this.limbR;
    for (const leg of this.legs) {
      const a = this.crankAngle + (leg.side > 0 ? 0 : Math.PI);
      const z = leg.side * Q;
      const pedal = this.pedalAt(this.bb, a, z);
      const ankle = this.ankleAt(this.bb, a, z);
      const hip = V(this.hip.x, this.hip.y, leg.side * 0.095 * s * wm);
      const knee = solve2(hip, ankle, this.thighLen, this.shinLen, 1);
      knee.z = leg.side * 0.105 * s * wm;
      for (const m of leg.thigh) place(m, hip, knee, 0.074 * s * wm);
      for (const m of leg.calf) place(m, knee, ankle, 0.057 * s * wm);
      leg.knee.position.copy(knee);
      leg.knee.scale.setScalar(0.05 * s * wm);
      leg.ankle.position.copy(ankle);
      leg.ankle.scale.setScalar(0.031 * s);
      leg.foot.position.copy(pedal);
      leg.foot.rotation.z = -RiderModel.pitch(a);
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
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        if (!SHARED.has(o.geometry)) o.geometry.dispose();
        const m = o.material as THREE.Material & { map?: THREE.Texture | null };
        m.map?.dispose();
        m.dispose();
      }
    });
  }
}
