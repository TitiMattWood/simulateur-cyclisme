/**
 * Bords de route à la campagne, dans l'esprit d'un décor low-poly « simple et efficace » :
 *  - touffes d'herbes hautes (et quelques fleurs) le long des accotements ;
 *  - clôtures en bois ou blanches, par tronçons ;
 *  - poteaux électriques reliés par des fils ;
 *  - arbres isolés, en bord de route et au milieu des champs.
 *
 * Tout est déduit des routes BD TOPO de la tuile, et seulement hors agglomération
 * (pas de bâtiment à proximité, route non marquée « urbaine »). Les objets répétés sont
 * instanciés pour rester légers.
 */
import * as THREE from 'three';
import { MeshBuilder, geoToLines, geoToPolys, pointInPoly, rng, type HeightGrid, type Poly, type RGB, sampleTerrain } from './geometry';
import { hexLinear } from '../render/engine';
import type { GeoFeature } from '../geo/ign';
import type { LocalProjection } from '../geo/projection';
import { ROAD_CLASSES, roadWidth } from './roads';
import type { TreePlacement } from './features';

/** « Ce point est-il à moins de `margin` mètres du bord d'une chaussée (ou du parcours) ? » */
export type OnRoad = (x: number, z: number, margin: number) => boolean;

interface Bounds { x0: number; z0: number; x1: number; z1: number }

export interface CountrysideInput {
  roads: GeoFeature[];
  buildings: GeoFeature[];
  water: Poly[];
  proj: LocalProjection;
  grid: HeightGrid;
  bounds: Bounds;
  onRoad: OnRoad;
  /** 0 = rien, 1 = densité maximale */
  density: number;
  seed: number;
}

export interface Countryside {
  group: THREE.Group;
  /** arbres à planter avec ceux des forêts (même géométrie, même instanciation) */
  trees: TreePlacement[];
}

/** Routes qui reçoivent un décor de bord de route (pas les autoroutes ni les sentiers). */
const SIDE_ROADS = new Set(['Route à 1 chaussée', 'Route à 2 chaussées', 'Route empierrée', 'Chemin', 'Bretelle']);

/** Largeur (m) de l'accotement herbeux de chaque côté de la route. */
const VERGE_W = 6;
const VERGE: RGB[] = ['#5ea83a', '#64ad3d', '#59a237'].map((h) => hexLinear(h));

/** Taille (m) d'une case de la grille « il y a un bâtiment ici ». */
const URBAN_CELL = 30;

export function buildCountryside(inp: CountrysideInput): Countryside {
  const { grid, bounds, onRoad, density } = inp;
  const r = rng(inp.seed);
  const group = new THREE.Group();
  const trees: TreePlacement[] = [];
  if (density <= 0) return { group, trees };

  // Grille des cases bâties : un point est « en ville » si une case voisine contient un bâtiment.
  const built = new Set<number>();
  const cellKey = (cx: number, cz: number) => (cx + 30000) * 60000 + (cz + 30000);
  for (const f of inp.buildings) {
    const ring = geoToPolys(f.geometry, inp.proj)[0]?.outer;
    if (!ring?.length) continue;
    built.add(cellKey(Math.floor(ring[0][0] / URBAN_CELL), Math.floor(ring[0][1] / URBAN_CELL)));
  }
  const urban = (x: number, z: number) => {
    const cx = Math.floor(x / URBAN_CELL), cz = Math.floor(z / URBAN_CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (built.has(cellKey(cx + i, cz + j))) return true;
    return false;
  };
  const inTile = (x: number, z: number) => x >= bounds.x0 && x < bounds.x1 && z >= bounds.z0 && z < bounds.z1;
  const inWater = (x: number, z: number) => inp.water.some((p) => x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && pointInPoly(x, z, p));
  const ground = (x: number, z: number) => sampleTerrain(grid, x, z);

  const grass: THREE.Matrix4[] = [];
  const flowers: THREE.Matrix4[] = [];
  const fence = new MeshBuilder();
  const verge = new MeshBuilder();
  /** bord extérieur de l'accotement au pas précédent, par côté (pour relier les bandes) */
  let lastVerge: Array<[number[], number[]] | null> = [null, null];
  const poles = new MeshBuilder();
  const wires: number[] = [];
  const maxGrass = Math.round(40000 * density);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  const addTuft = (x: number, z: number, big: number) => {
    if (grass.length + flowers.length >= maxGrass) return;
    q.setFromAxisAngle(yAxis, r() * Math.PI * 2);
    const sc = (0.7 + r() * 0.5) * big;
    s.set(sc, sc * (0.8 + r() * 0.5), sc);
    v.set(x, ground(x, z) - 0.05, z);
    (r() < 0.05 ? flowers : grass).push(m.compose(v, q, s).clone());
  };

  for (const f of inp.roads) {
    const p = f.properties;
    const nature = String(p.nature);
    if (!SIDE_ROADS.has(nature) || !ROAD_CLASSES[nature]) continue;
    if (Number(p.position_par_rapport_au_sol ?? 0) !== 0) continue;
    const roadUrban = p.urbain === true || p.urbain === 'true';
    const halfW = roadWidth(p) / 2;
    const lines = geoToLines(f.geometry, inp.proj);
    for (const line of lines) {
      // côté des poteaux et présence de poteaux : tirés une fois par tronçon
      const poleSide = r() < 0.5 ? -1 : 1;
      const hasPoles = !roadUrban && nature.startsWith('Route') && r() < 0.55;
      const fenceRun = [0, 0]; // pas restants de clôture, par côté
      const fenceType = [0, 0];
      const lastPost: Array<[number, number, number] | null> = [null, null];
      let lastPole: [number, number, number] | null = null;
      let sinceTree = 0, sincePole = 40;
      const STEP = 2.4;
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, , az] = line[i], [bx, , bz] = line[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const tx = (bx - ax) / len, tz = (bz - az) / len;
        const nx = -tz, nz = tx;
        for (let d = 0; d < len; d += STEP) {
          const x = ax + tx * d, z = az + tz * d;
          if (!inTile(x, z)) { lastPost[0] = lastPost[1] = null; lastPole = null; lastVerge = [null, null]; continue; }
          const town = roadUrban || urban(x, z);
          if (town) { lastPost[0] = lastPost[1] = null; lastPole = null; lastVerge = [null, null]; continue; }

          // --- accotement herbeux : bande verte de 6 m de chaque côté, sous les herbes hautes
          for (const si of [0, 1]) {
            const side = si === 0 ? -1 : 1;
            const ix = x + nx * side * (halfW + 0.05), iz = z + nz * side * (halfW + 0.05);
            // largeur réduite si une autre route passe tout près
            let vw = VERGE_W;
            while (vw > 1 && onRoad(x + nx * side * (halfW + vw), z + nz * side * (halfW + vw), 0.3)) vw /= 2;
            const ox = x + nx * side * (halfW + vw), oz = z + nz * side * (halfW + vw);
            if (vw <= 1 || onRoad((ix + ox) / 2, (iz + oz) / 2, 0.1)) { lastVerge[si] = null; continue; }
            const inner = [ix, ground(ix, iz) + 0.08, iz], outer = [ox, ground(ox, oz) + 0.08, oz];
            const prev = lastVerge[si];
            if (prev) verge.quad(prev[0], inner, outer, prev[1], VERGE[(i + Math.floor(d)) % VERGE.length], [0, 1, 0]);
            lastVerge[si] = [inner, outer];
          }

          // --- herbes hautes : bande de 0,4 à 5 m après le bord, plus dense près de la route
          for (const side of [-1, 1]) {
            const n = Math.round((7 + r() * 5) * density);
            for (let k = 0; k < n; k++) {
              const off = halfW + 0.35 + Math.pow(r(), 1.5) * (VERGE_W + 1);
              const gx = x + nx * side * off + tx * (r() - 0.5) * STEP;
              const gz = z + nz * side * off + tz * (r() - 0.5) * STEP;
              if (onRoad(gx, gz, 0.25) || inWater(gx, gz)) continue;
              addTuft(gx, gz, off < halfW + 2 ? 1 : 1.15);
            }
          }

          // --- clôtures par tronçons de 50 à 200 m, d'un côté ou de l'autre
          for (const si of [0, 1]) {
            const side = si === 0 ? -1 : 1;
            if (fenceRun[si] <= 0) {
              lastPost[si] = null;
              if (r() < 0.012) { fenceRun[si] = 20 + Math.floor(r() * 60); fenceType[si] = r() < 0.6 ? 0 : 1; }
              continue;
            }
            fenceRun[si]--;
            const off = halfW + 1.7;
            const fx = x + nx * side * off, fz = z + nz * side * off;
            if (onRoad(fx, fz, 1.2) || inWater(fx, fz)) { lastPost[si] = null; continue; }
            const post: [number, number, number] = [fx, ground(fx, fz), fz];
            fenceBay(fence, lastPost[si], post, fenceType[si]);
            lastPost[si] = post;
          }

          // --- poteaux électriques tous les ~40 m, reliés par des fils
          sincePole += STEP;
          if (hasPoles && sincePole >= 40) {
            sincePole = 0;
            const off = halfW + 3.4;
            const px = x + nx * poleSide * off, pz = z + nz * poleSide * off;
            if (onRoad(px, pz, 2.4) || inWater(px, pz)) { lastPole = null; }
            else {
              const pole: [number, number, number] = [px, ground(px, pz), pz];
              utilityPole(poles, pole, tx, tz);
              if (lastPole) catenary(wires, lastPole, pole, tx, tz);
              lastPole = pole;
            }
          }

          // --- arbres isolés et buissons en bord de champ
          sinceTree += STEP;
          if (sinceTree > 9 && r() < 0.1 * density) {
            sinceTree = 0;
            const side = r() < 0.5 ? -1 : 1;
            const cluster = 1 + Math.floor(r() * 3);
            for (let k = 0; k < cluster; k++) {
              const off = halfW + 6 + r() * 22;
              const ex = x + nx * side * off + tx * (r() - 0.5) * 14, ez = z + nz * side * off + tz * (r() - 0.5) * 14;
              if (!inTile(ex, ez) || onRoad(ex, ez, 4) || urban(ex, ez) || inWater(ex, ez)) continue;
              trees.push({ x: ex, z: ez, kind: r() < 0.85 ? 'leaf' : 'conifer', scale: 0.8 + r() * 0.6 });
            }
          }
          if (r() < 0.025 * density) {
            const side = r() < 0.5 ? -1 : 1;
            const off = halfW + 2.6 + r() * 4;
            const bx2 = x + nx * side * off, bz2 = z + nz * side * off;
            if (!onRoad(bx2, bz2, 1.5) && !inWater(bx2, bz2)) trees.push({ x: bx2, z: bz2, kind: 'bush', scale: 0.8 + r() * 0.7 });
          }
        }
      }
    }
  }

  // Arbres solitaires au milieu des champs (environ un par hectare hors ville).
  const field = Math.round(((bounds.x1 - bounds.x0) * (bounds.z1 - bounds.z0)) / 10000 * density);
  for (let k = 0; k < field; k++) {
    const x = bounds.x0 + r() * (bounds.x1 - bounds.x0), z = bounds.z0 + r() * (bounds.z1 - bounds.z0);
    if (urban(x, z) || onRoad(x, z, 5) || inWater(x, z)) continue;
    trees.push({ x, z, kind: r() < 0.8 ? 'leaf' : 'conifer', scale: 0.9 + r() * 0.7 });
  }

  // --- assemblage
  const gg = grassGeos();
  for (const [list, geo] of [[grass, gg.grass], [flowers, gg.flower]] as const) {
    if (!list.length) continue;
    const inst = new THREE.InstancedMesh(geo, grassMaterial, list.length);
    list.forEach((mat, i) => inst.setMatrixAt(i, mat));
    inst.computeBoundingSphere();
    inst.receiveShadow = true;
    inst.userData.kind = 'grass';
    group.add(inst);
  }
  const vg = verge.build();
  if (vg) { const vm = new THREE.Mesh(vg, vergeMaterial); vm.receiveShadow = true; group.add(vm); }
  const fg = fence.build();
  if (fg) { const fm = new THREE.Mesh(fg, propMaterial); fm.castShadow = true; fm.receiveShadow = true; group.add(fm); }
  const pg = poles.build();
  if (pg) { const pm = new THREE.Mesh(pg, propMaterial); pm.castShadow = true; group.add(pm); }
  if (wires.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    group.add(new THREE.LineSegments(wg, wireMaterial));
  }
  return { group, trees };
}

// ---------------------------------------------------------------------------
// Matériaux et géométries partagés

const propMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
const grassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
/** l'accotement est posé juste au-dessus du terrain : décalage de profondeur contre le scintillement */
const vergeMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.96, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const wireMaterial = new THREE.LineBasicMaterial({ color: '#26282b' });

let grassCache: { grass: THREE.BufferGeometry; flower: THREE.BufferGeometry } | null = null;

/** Touffe de brins (triangles fins) : pied vert foncé, pointe vert clair, comme un dégradé peint. */
function grassGeos(): NonNullable<typeof grassCache> {
  if (grassCache) return grassCache;
  const tuft = (tip: string, blades: number, h: number, seed: number) => {
    const r = rng(seed);
    const pos: number[] = [], col: number[] = [];
    const base = hexLinear('#3d7a25'), top = hexLinear(tip);
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2 + r() * 0.6;
      const lean = 0.12 + r() * 0.2;
      const bh = h * (0.7 + r() * 0.5);
      const w = 0.05;
      const spread = 0.05 + r() * 0.22;
      const ox = Math.cos(a) * spread, oz = Math.sin(a) * spread;
      // brin : base large (2 sommets), pointe penchée vers l'extérieur
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + Math.cos(a) * lean, bh, oz + Math.sin(a) * lean);
      col.push(...base, ...base, ...top);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    // normales vers le haut : l'herbe est éclairée comme le sol, sans faces sombres
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return g;
  };
  const grass = tuft('#8fd04e', 12, 0.6, 7);
  // fleur : la même touffe, plus un petit bouton violet en haut
  const flowerHead = new THREE.OctahedronGeometry(0.07, 0).translate(0.05, 0.85, 0);
  const fc = hexLinear('#9a5fd0');
  const fcol = new Float32Array(flowerHead.getAttribute('position').count * 3);
  for (let i = 0; i < fcol.length; i += 3) { fcol[i] = fc[0]; fcol[i + 1] = fc[1]; fcol[i + 2] = fc[2]; }
  flowerHead.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
  flowerHead.deleteAttribute('uv');
  const base = tuft('#8fd04e', 4, 0.7, 13);
  const flower = new THREE.BufferGeometry();
  const fh = flowerHead; // un octaèdre de three.js est déjà « non indexé »
  const cat = (a: string) => new THREE.Float32BufferAttribute([
    ...(base.getAttribute(a).array as Float32Array), ...(fh.getAttribute(a).array as Float32Array),
  ], 3);
  flower.setAttribute('position', cat('position'));
  flower.setAttribute('color', cat('color'));
  flower.setAttribute('normal', cat('normal'));
  grassCache = { grass, flower };
  return grassCache;
}

// ---------------------------------------------------------------------------
// Constructions simples (boîtes orientées)

const WOOD: RGB = hexLinear('#8a6242');
const WOOD_DARK: RGB = hexLinear('#6f4d33');
const WHITE: RGB = hexLinear('#f1efe8');
const POLE: RGB = hexLinear('#5e4632');

/**
 * Boîte entre deux points au sol a → b : largeur `t` (épaisseur), hauteur `h`,
 * posée à `y0` au-dessus de chaque extrémité (suit la pente).
 */
function beam(mb: MeshBuilder, a: [number, number, number], b: [number, number, number], y0: number, h: number, t: number, c: RGB): void {
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * t / 2, nz = (dx / len) * t / 2;
  const A = (sx: number, sy: number) => [a[0] + nx * sx, a[1] + y0 + sy, a[2] + nz * sx];
  const B = (sx: number, sy: number) => [b[0] + nx * sx, b[1] + y0 + sy, b[2] + nz * sx];
  box8(mb, [A(-1, 0), A(1, 0), A(1, h), A(-1, h)], [B(-1, 0), B(1, 0), B(1, h), B(-1, h)], c);
}

/** Poteau vertical de section carrée. */
function post(mb: MeshBuilder, p: [number, number, number], h: number, t: number, c: RGB, y0 = -0.2): void {
  const [x, y, z] = p, e = t / 2;
  const ring = (yy: number) => [[x - e, yy, z - e], [x + e, yy, z - e], [x + e, yy, z + e], [x - e, yy, z + e]];
  box8(mb, ring(y + y0), ring(y + h), c);
}

/** Boîte quelconque : deux faces de 4 sommets (bas/haut ou début/fin) dans le même ordre. */
function box8(mb: MeshBuilder, a: number[][], b: number[][], c: RGB): void {
  const cx = (a[0][0] + a[2][0] + b[0][0] + b[2][0]) / 4;
  const cy = (a[0][1] + a[2][1] + b[0][1] + b[2][1]) / 4;
  const cz = (a[0][2] + a[2][2] + b[0][2] + b[2][2]) / 4;
  const face = (p: number[][]) => {
    const fx = (p[0][0] + p[2][0]) / 2 - cx, fy = (p[0][1] + p[2][1]) / 2 - cy, fz = (p[0][2] + p[2][2]) / 2 - cz;
    mb.quad(p[0], p[1], p[2], p[3], c, [fx, fy, fz]);
  };
  face(a); face(b);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    face([a[i], a[j], b[j], b[i]]);
  }
}

/** Une travée de clôture : poteau en `p`, lisses jusqu'au poteau précédent. */
function fenceBay(mb: MeshBuilder, prev: [number, number, number] | null, p: [number, number, number], type: number): void {
  if (type === 0) {
    // bois : poteaux bruts, trois lisses
    post(mb, p, 1.15, 0.14, WOOD_DARK);
    if (prev) for (const y of [0.3, 0.62, 0.94]) beam(mb, prev, p, y, 0.1, 0.05, WOOD);
  } else {
    // clôture blanche de pré : deux larges lisses
    post(mb, p, 1.05, 0.12, WHITE);
    if (prev) for (const y of [0.42, 0.82]) beam(mb, prev, p, y, 0.13, 0.05, WHITE);
  }
}

/** Poteau électrique en bois avec sa traverse. */
function utilityPole(mb: MeshBuilder, p: [number, number, number], tx: number, tz: number): void {
  post(mb, p, 8.2, 0.24, POLE, -0.5);
  const nx = -tz, nz = tx;
  const a: [number, number, number] = [p[0] - nx * 0.8, p[1], p[2] - nz * 0.8];
  const b: [number, number, number] = [p[0] + nx * 0.8, p[1], p[2] + nz * 0.8];
  beam(mb, a, b, 7.6, 0.14, 0.14, POLE);
}

/** Fils entre deux poteaux : courbe en chaînette approchée (8 segments, flèche 0,6 m). */
function catenary(out: number[], a: [number, number, number], b: [number, number, number], tx: number, tz: number): void {
  const nx = -tz, nz = tx;
  for (const off of [-0.65, 0, 0.65]) {
    const y0 = off === 0 ? 8.15 : 7.74;
    let px = a[0] + nx * off, py = a[1] + y0, pz = a[2] + nz * off;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const x = a[0] + (b[0] - a[0]) * t + nx * off;
      const z = a[2] + (b[2] - a[2]) * t + nz * off;
      const y = a[1] + (b[1] - a[1]) * t + y0 - 0.6 * 4 * t * (1 - t);
      out.push(px, py, pz, x, y, z);
      px = x; py = y; pz = z;
    }
  }
}
