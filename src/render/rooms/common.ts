/**
 * Outils communs aux décors de l'accueil : matériaux physiques, textures dessinées par le code
 * (aucun fichier à télécharger) et petites pièces de mobilier réutilisables.
 *
 * Repère de la pièce : le vélo est à l'origine et regarde vers +X ; la TV est sur le mur x ≈ 3,3 ;
 * mur du fond en z = −3 ; mur arrière en x = −3,5 ; la caméra tourne côté z positif.
 */
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { BloomStyle } from '../post';

export interface RoomSetup {
  group: THREE.Group;
  /** écran de la TV face au vélo : centre (x, y), largeur, hauteur (plan vertical, centré en z = 0) */
  tv: { x: number; y: number; w: number; h: number };
  background: THREE.ColorRepresentation;
  exposure: number;
  bloom: BloomStyle;
  /** animation éventuelle (ventilateur, clignotement…) */
  update?(t: number): void;
}

/** Réglage des néons de la pièce (couleur et interrupteur), choisi au profil. */
export interface NeonSetting {
  color: string;
  on: boolean;
}

/** Teinte voisine (décalée sur le cercle des couleurs), pour un deuxième ruban assorti. */
export function neighbourHue(hex: string, shift = 0.12): string {
  return `#${new THREE.Color(hex).offsetHSL(shift, 0, 0).getHexString()}`;
}

let areaLightsReady = false;
/** Les lumières rectangulaires (rubans LED, fenêtres) demandent une initialisation unique. */
export function initAreaLights(): void {
  if (!areaLightsReady) {
    RectAreaLightUniformsLib.init();
    areaLightsReady = true;
  }
}

// ---------------------------------------------------------------------------
// Matériaux

export const std = (color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

/** Matériau lumineux (néon, ampoule, ruban LED) : il « bave » grâce au halo du post-traitement. */
export const glow = (color: THREE.ColorRepresentation, intensity = 3) =>
  new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: intensity, roughness: 1 });

export const texMat = (map: THREE.Texture, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ map, roughness, metalness, ...extra });

// ---------------------------------------------------------------------------
// Textures

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function tex(c: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

/** Générateur pseudo-aléatoire stable : le même décor à chaque chargement. */
export function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const shade = (hex: string, dl: number) => `#${new THREE.Color(hex).offsetHSL(0, 0, dl).getHexString()}`;

/** Parquet ou plancher : lames décalées avec veinage. */
export function woodFloor(tones: string[], plankW = 64, seed = 3): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const r = rng(seed);
  const rows = Math.floor(1024 / plankW);
  for (let row = 0; row < rows; row++) {
    let x = -Math.floor(r() * 400);
    while (x < 1024) {
      const len = 260 + Math.floor(r() * 300);
      const base = tones[Math.floor(r() * tones.length)];
      g.fillStyle = base;
      g.fillRect(x, row * plankW, len, plankW);
      // veinage
      for (let k = 0; k < 9; k++) {
        g.strokeStyle = shade(base, (r() - 0.5) * 0.08);
        g.globalAlpha = 0.5;
        g.lineWidth = 1 + r() * 2;
        const y = row * plankW + r() * plankW;
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 8, x + len * 0.7, y + (r() - 0.5) * 8, x + len, y + (r() - 0.5) * 4);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x, row * plankW, 2, plankW);
      x += len;
    }
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, row * plankW, 1024, 2);
  }
  return tex(c, 2, 2);
}

/** Béton lissé : nuages de gris et petites taches. */
export function concrete(base = '#8d8f91', seed = 5, repeat = 3): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 160; k++) {
    const x = r() * 512, y = r() * 512, rad = 20 + r() * 90;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const col = shade(base, (r() - 0.5) * 0.12);
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.35;
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.globalAlpha = 1;
  for (let k = 0; k < 2500; k++) {
    g.fillStyle = r() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
    g.fillRect(r() * 512, r() * 512, 1.5, 1.5);
  }
  return tex(c, repeat, repeat);
}

/** Mur de briques rouges avec joints clairs. */
export function bricks(seed = 9): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const r = rng(seed);
  g.fillStyle = '#b9b2a6';
  g.fillRect(0, 0, 1024, 1024);
  const bw = 128, bh = 48;
  for (let row = 0; row < 1024 / bh; row++) {
    for (let col = -1; col < 1024 / bw + 1; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
      const base = ['#8e3b27', '#9b4630', '#7d3322', '#a5523a', '#874031'][Math.floor(r() * 5)];
      g.fillStyle = shade(base, (r() - 0.5) * 0.06);
      g.fillRect(x + 4, y + 4, bw - 8, bh - 8);
      for (let k = 0; k < 30; k++) {
        g.fillStyle = r() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,220,200,0.08)';
        g.fillRect(x + 4 + r() * (bw - 10), y + 4 + r() * (bh - 10), 3, 3);
      }
    }
  }
  return tex(c, 2, 2);
}

/** Mur de parpaings peints (atelier). */
export function blocks(base = '#c9cbc6', seed = 13): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = rng(seed);
  const bw = 128, bh = 64;
  g.fillStyle = shade(base, -0.12);
  g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 512 / bh; row++) {
    for (let col = -1; col < 512 / bw + 1; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
      g.fillStyle = shade(base, (r() - 0.5) * 0.04);
      g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    }
  }
  return tex(c, 3, 2);
}

/** Panneau perforé pour accrocher les outils. */
export function pegboard(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c69c6d';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#3b2a1c';
  for (let y = 8; y < 256; y += 16) for (let x = 8; x < 256; x += 16) {
    g.beginPath();
    g.arc(x, y, 2.6, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c, 3, 2);
}

/** Fresque murale : crêtes de montagnes en dégradé, soleil couchant. */
export function mountainMural(sky: [string, string], ridges: string[]): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, sky[0]);
  grad.addColorStop(1, sky[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = 'rgba(255,220,200,0.85)';
  g.beginPath();
  g.arc(700, 210, 60, 0, Math.PI * 2);
  g.fill();
  const r = rng(21);
  ridges.forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 512);
    const base = 230 + i * 70;
    let y = base;
    for (let x = 0; x <= 1024; x += 32) {
      y = Math.max(base - 150, Math.min(base + 40, y + (r() - 0.5) * 90));
      g.lineTo(x, y);
    }
    g.lineTo(1024, 512);
    g.fill();
  });
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Vue extérieure par une fenêtre : ciel, collines, quelques arbres. */
export function outdoorView(bright = true): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  const sky = g.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, bright ? '#6fb0ee' : '#8aa3b8');
  sky.addColorStop(1, bright ? '#e4f1fb' : '#d7dee4');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  const r = rng(4);
  for (const [col, base, amp] of [['#a9c48c', 280, 60], ['#7fa65d', 330, 45], ['#5e8a42', 390, 30]] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 512);
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin(x * 0.006 + base) * Math.sin(x * 0.0023 + 1)));
    g.lineTo(1024, 512);
    g.fill();
  }
  for (let k = 0; k < 40; k++) {
    const x = r() * 1024, y = 340 + r() * 120, s = 8 + r() * 18;
    g.fillStyle = '#3f6b32';
    g.beginPath();
    g.arc(x, y - s, s, 0, Math.PI * 2);
    g.fill();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Dégradé sombre transparent : « occlusion peinte » au pied des murs et dans les coins. */
let aoTex: THREE.CanvasTexture | null = null;
function aoTexture(): THREE.CanvasTexture {
  if (!aoTex) {
    const [c, g] = canvas(8, 128);
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.35, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 128);
    aoTex = new THREE.CanvasTexture(c);
  }
  return aoTex;
}

/**
 * Bande d'ombre douce le long d'une arête (pied de mur) : posée à plat sur le sol et contre le mur.
 * a → b : l'arête au sol ; inward : direction du sol qui s'éloigne du mur.
 */
export function aoEdge(group: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, inward: THREE.Vector3, size = 0.45): void {
  const mat = new THREE.MeshBasicMaterial({ map: aoTexture(), transparent: true, depthWrite: false, toneMapped: false });
  const len = a.distanceTo(b);
  const mid = a.clone().lerp(b, 0.5);
  const dir = b.clone().sub(a).normalize();
  // au sol
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(len, size), mat);
  const n = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4().makeBasis(dir, inward.clone().negate(), n);
  floor.quaternion.setFromRotationMatrix(m);
  floor.position.copy(mid).addScaledVector(inward, size / 2).setY(0.004);
  floor.renderOrder = 1;
  group.add(floor);
  // sur le mur
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, size), mat);
  const m2 = new THREE.Matrix4().makeBasis(dir, new THREE.Vector3(0, -1, 0), inward);
  wall.quaternion.setFromRotationMatrix(m2);
  wall.position.copy(mid).addScaledVector(inward, 0.004).setY(size / 2);
  wall.renderOrder = 1;
  group.add(wall);
}

// ---------------------------------------------------------------------------
// Petites pièces de décor

export function box(group: THREE.Group, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  m.castShadow = shadows;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

export function cyl(group: THREE.Group, mat: THREE.Material, x: number, y: number, z: number, rt: number, rb: number, h: number, segs = 20): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

/** Plante en pot : feuillage en plusieurs boules facettées. */
export function plant(group: THREE.Group, x: number, z: number, size = 1, pot = '#e8e2d8', seed = 1): void {
  const r = rng(seed);
  cyl(group, std(pot, 0.6), x, 0.2 * size, z, 0.17 * size, 0.13 * size, 0.4 * size);
  const leaf = std('#3f7f3a', 0.7, 0, { flatShading: true });
  for (let k = 0; k < 6; k++) {
    const s = (0.16 + r() * 0.14) * size;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), leaf);
    m.position.set(x + (r() - 0.5) * 0.3 * size, (0.55 + r() * 0.5) * size, z + (r() - 0.5) * 0.3 * size);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.castShadow = true;
    group.add(m);
  }
}

/** Ventilateur sur pied (les pales tournent) ; renvoie la fonction d'animation. */
export function fan(group: THREE.Group, x: number, z: number, rotY: number): (t: number) => void {
  const f = new THREE.Group();
  const dark = std('#2e3237', 0.5, 0.3);
  cyl(f, dark, 0, 0.02, 0, 0.2, 0.22, 0.04);
  cyl(f, dark, 0, 0.55, 0, 0.022, 0.022, 1.0, 10);
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.012, 6, 32), std('#d9dde1', 0.4, 0.6));
  cage.position.y = 1.08;
  cage.rotation.y = Math.PI / 2;
  f.add(cage);
  const blades = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.01, 3), std('#cfd6dd', 0.5, 0, { transparent: true, opacity: 0.55 }));
  blades.rotation.z = Math.PI / 2;
  blades.position.y = 1.08;
  f.add(blades);
  f.position.set(x, 0, z);
  f.rotation.y = rotY;
  group.add(f);
  return (t) => {
    blades.rotation.x = t * 18;
  };
}

/** Cadre de TV (l'écran lui-même est posé par la scène d'accueil). */
export function tvBezel(group: THREE.Group, tv: RoomSetup['tv'], standY?: number): void {
  const black = std('#0b0c0e', 0.35, 0.2);
  box(group, black, tv.x + 0.035, tv.y, 0, 0.05, tv.h + 0.04, tv.w + 0.04, false);
  if (standY !== undefined) {
    // pied central posé sur le meuble
    box(group, black, tv.x + 0.02, (standY + tv.y - tv.h / 2) / 2, 0, 0.06, tv.y - tv.h / 2 - standY, 0.1, false);
    box(group, black, tv.x - 0.05, standY + 0.01, 0, 0.25, 0.02, 0.45, false);
  }
}

/** Petites étagères avec objets (boîtes, livres, coupes). */
export function shelfWithItems(group: THREE.Group, x: number, y: number, z: number, length: number, wood: THREE.Material, seed = 2): void {
  const r = rng(seed);
  box(group, wood, x, y, z, length, 0.035, 0.26);
  let px = x - length / 2 + 0.1;
  while (px < x + length / 2 - 0.12) {
    const kind = r();
    if (kind < 0.35) {
      // pile de livres
      const n = 3 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const h = 0.18 + r() * 0.08;
        box(group, std(['#c0392b', '#2c3e50', '#d4ac0d', '#1e8449', '#7d3c98', '#e5e7e9'][Math.floor(r() * 6)], 0.8), px + k * 0.04, y + 0.02 + h / 2, z, 0.035, h, 0.17);
      }
      px += n * 0.04 + 0.12;
    } else if (kind < 0.6) {
      cyl(group, std(['#d4af37', '#c0c0c0', '#cd7f32'][Math.floor(r() * 3)], 0.25, 0.9), px, y + 0.12, z, 0.05, 0.03, 0.2, 14);
      px += 0.2;
    } else if (kind < 0.8) {
      box(group, std(['#f5f5f5', '#222', '#e67e22'][Math.floor(r() * 3)], 0.6), px + 0.06, y + 0.08, z, 0.14, 0.13, 0.14);
      px += 0.22;
    } else {
      plantSmall(group, px + 0.05, y + 0.02, z);
      px += 0.2;
    }
  }
}

function plantSmall(group: THREE.Group, x: number, y: number, z: number): void {
  cyl(group, std('#efe9df', 0.6), x, y + 0.06, z, 0.055, 0.045, 0.12, 12);
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), std('#4c8c3f', 0.7, 0, { flatShading: true }));
  m.position.set(x, y + 0.18, z);
  m.castShadow = true;
  group.add(m);
}

/** Lumière rectangulaire (ruban LED, fenêtre) + bande émissive visible. */
export function areaStrip(
  group: THREE.Group, color: THREE.ColorRepresentation, intensity: number,
  pos: THREE.Vector3, w: number, h: number, lookAt: THREE.Vector3, visible?: { size: [number, number, number]; at: THREE.Vector3 },
): void {
  initAreaLights();
  const l = new THREE.RectAreaLight(color, intensity, w, h);
  l.position.copy(pos);
  l.lookAt(lookAt);
  group.add(l);
  if (visible) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...visible.size), glow(color, 4));
    m.position.copy(visible.at);
    group.add(m);
  }
}
