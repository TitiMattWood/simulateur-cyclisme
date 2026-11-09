/**
 * Objets du paysage construits à partir de la BD TOPO de l'IGN :
 * bâtiments (emprise et hauteur réelles), forêts, haies, vignes, routes, voies ferrées.
 */
import * as THREE from 'three';
import {
  MeshBuilder, geoToPolys, geoToLines, pointInPoly, polyArea, sampleGrid, rng, hashString,
  type HeightGrid, type Poly, type RGB,
} from './geometry';
import { hexLinear } from '../render/engine';
import type { GeoFeature } from '../geo/ign';
import type { LocalProjection } from '../geo/projection';
import { ROAD_CLASSES, roadWidth, roadColor } from './roads';

/** Fonction « ce point est-il à éviter ? » (chaussée, parcours…). */
export type Avoid = (x: number, z: number) => boolean;

interface TileBounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const inTile = (b: TileBounds, x: number, z: number) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;

// ---------------------------------------------------------------------------
// Bâtiments

const PALETTES: Record<string, { walls: string[]; flat: string; pitched: string[] }> = {
  'Résidentiel': { walls: ['#efe6d2', '#e6d6bb', '#f4efe6', '#dccbb0', '#e9dfcf'], flat: '#8d939a', pitched: ['#b4553c', '#9e4a35', '#7d6f68', '#a65d44'] },
  'Commercial et services': { walls: ['#cfd6dd', '#dfe3e6', '#c4ccd4'], flat: '#7f878f', pitched: ['#6f7780'] },
  'Industriel': { walls: ['#c3c1b8', '#b5b8bb', '#d0ccc0'], flat: '#9aa0a6', pitched: ['#8a9096'] },
  'Agricole': { walls: ['#b89b74', '#a88a63', '#c7ad86'], flat: '#7a6a58', pitched: ['#8c5a3c', '#6f6a64'] },
  'Religieux': { walls: ['#d9d0b8', '#cfc4a8'], flat: '#5b6470', pitched: ['#55606c'] },
  'Sportif': { walls: ['#d6dde3', '#e3e7ea'], flat: '#8f979e', pitched: ['#7a838c'] },
  'Annexe': { walls: ['#d3c9b6', '#c9bfa9'], flat: '#8a8a86', pitched: ['#9a5440'] },
};

/** Tuiles vernissées bourguignonnes (jaune, vert, rouge, noir). */
const GLAZED = ['#c9a227', '#2f6b3a', '#8e2a1c', '#1f2428'].map((c) => hexLinear(c));

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

export function buildBuildings(
  feats: GeoFeature[], proj: LocalProjection, grid: HeightGrid, bounds: TileBounds,
): THREE.BufferGeometry | null {
  const mb = new MeshBuilder();
  const up: [number, number, number] = [0, 1, 0];
  for (const f of feats) {
    const polys = geoToPolys(f.geometry, proj);
    if (!polys.length) continue;
    const p = polys[0];
    let ring = p.outer;
    if (ring.length < 3) continue;
    let cx = 0, cz = 0;
    for (const [x, z] of ring) { cx += x; cz += z; }
    cx /= ring.length; cz /= ring.length;
    if (!inTile(bounds, cx, cz)) continue; // chaque bâtiment appartient à une seule tuile

    const props = f.properties;
    const usage = String(props.usage_1 ?? 'Résidentiel');
    const nature = String(props.nature ?? '');
    let h = Number(props.hauteur);
    if (!(h > 0)) h = Number(props.nombre_d_etages) > 0 ? Number(props.nombre_d_etages) * 3 + 1 : 6;
    h = Math.min(250, Math.max(2.5, h));
    // tours, donjons, châteaux et monuments : pierre de taille
    const stone = /Tour|donjon|Château|Fort|Monument|Arc/.test(nature);
    const pal = stone ? PALETTES['Religieux'] : PALETTES[usage] ?? PALETTES['Résidentiel'];
    const r = rng(hashString(f.id));
    const wall = hexLinear(pick(pal.walls, r()));
    // Base : point le plus bas du sol sous l'emprise, enfoncé pour ne pas flotter en pente.
    let base = Infinity;
    for (const [x, z] of ring) base = Math.min(base, sampleGrid(grid, x, z));
    base -= 1;
    const area = Math.abs(polyArea(ring));
    if (polyArea(ring) > 0) ring = ring.slice().reverse();

    const church = /glise|Chapelle/.test(nature);
    const pitched = !church && ring.length === 4 && h <= 13 && area < 600 && usage !== 'Industriel' && usage !== 'Commercial et services';
    const roofH = pitched ? Math.min(4, 0.42 * Math.sqrt(area) * 0.5) : 0;
    const eaves = base + 1 + h - roofH;

    // Murs : le contour est parcouru dans le sens horaire (aire négative), ce qui oriente
    // chaque mur vers l'extérieur, même pour les bâtiments en L ou en arc de cercle.
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
      const shade = 0.88 + 0.12 * Math.abs(Math.sin(i * 1.7));
      const col: RGB = [wall[0] * shade, wall[1] * shade, wall[2] * shade];
      mb.quad([ax, base, az], [bx, base, bz], [bx, eaves, bz], [ax, eaves, az], col);
    }

    if (pitched) {
      // Toit à deux pans, faîtage dans le sens de la longueur.
      const roof = hexLinear(pick(pal.pitched, r()));
      let [A, B, C, D] = ring;
      if (Math.hypot(B[0] - A[0], B[1] - A[1]) < Math.hypot(C[0] - B[0], C[1] - B[1])) [A, B, C, D] = [B, C, D, A];
      const top = eaves + roofH;
      const M1 = [(A[0] + D[0]) / 2, top, (A[1] + D[1]) / 2];
      const M2 = [(B[0] + C[0]) / 2, top, (B[1] + C[1]) / 2];
      const a = [A[0], eaves, A[1]], b = [B[0], eaves, B[1]], c = [C[0], eaves, C[1]], d = [D[0], eaves, D[1]];
      mb.quad(a, b, M2, M1, roof, up);
      const roof2: RGB = [roof[0] * 0.82, roof[1] * 0.82, roof[2] * 0.82];
      mb.quad(c, d, M1, M2, roof2, up);
      mb.tri(b[0], b[1], b[2], c[0], c[1], c[2], M2[0], M2[1], M2[2], wall);
      mb.tri(d[0], d[1], d[2], a[0], a[1], a[2], M1[0], M1[1], M1[2], wall);
    } else {
      // Toit plat triangulé (ou pointe pour les églises).
      const roof = hexLinear(church ? '#55606c' : pal.flat);
      const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [i, j, k] of tris) {
        mb.tri(ring[i][0], eaves, ring[i][1], ring[j][0], eaves, ring[j][1], ring[k][0], eaves, ring[k][1], roof, up);
      }
      if (church && area > 80) {
        const spire = eaves + Math.min(30, h * 0.9);
        // En Bourgogne, les églises portent des toits de tuiles vernissées multicolores.
        const burgundy = proj.lat0 > 46.6 && proj.lat0 < 48 && proj.lon0 > 4 && proj.lon0 < 5.6;
        for (let i = 0; i < ring.length; i++) {
          const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
          mb.tri(ax, eaves, az, bx, eaves, bz, cx, spire, cz, burgundy ? GLAZED[i % GLAZED.length] : roof);
        }
      }
    }
  }
  return mb.build();
}

// ---------------------------------------------------------------------------
// Végétation

type TreeKind = 'leaf' | 'conifer' | 'bush';

interface VegRule {
  kind: TreeKind | 'mixed';
  /** espacement moyen entre arbres (m) */
  spacing: number;
  scale: number;
}

const VEG: Record<string, VegRule> = {
  'Forêt fermée de feuillus': { kind: 'leaf', spacing: 9, scale: 1.1 },
  'Forêt fermée de conifères': { kind: 'conifer', spacing: 8, scale: 1.15 },
  'Forêt fermée mixte': { kind: 'mixed', spacing: 9, scale: 1.1 },
  'Forêt ouverte': { kind: 'mixed', spacing: 17, scale: 1 },
  'Bois': { kind: 'leaf', spacing: 10, scale: 1 },
  'Peupleraie': { kind: 'leaf', spacing: 8, scale: 1.3 },
  'Haie': { kind: 'leaf', spacing: 5, scale: 0.7 },
  'Lande ligneuse': { kind: 'bush', spacing: 7, scale: 1 },
  'Verger': { kind: 'leaf', spacing: 8, scale: 0.6 },
  'Vigne': { kind: 'bush', spacing: 2.6, scale: 0.55 },
};

/** Géométries partagées par toutes les tuiles (créées une seule fois). */
let treeGeos: Record<TreeKind, THREE.BufferGeometry> | null = null;

function colorize(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const [r, gg, b] = hexLinear(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  for (const p of parts) {
    pos.push(...(p.getAttribute('position').array as Float32Array));
    col.push(...(p.getAttribute('color').array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function getTreeGeos(): Record<TreeKind, THREE.BufferGeometry> {
  if (treeGeos) return treeGeos;
  const trunk = (h: number) => colorize(new THREE.CylinderGeometry(0.18, 0.28, h, 5).translate(0, h / 2, 0), '#6b4f3a');
  const leaf = mergeSimple([
    trunk(3),
    colorize(new THREE.IcosahedronGeometry(2.6, 0).scale(1, 1.15, 1).translate(0, 5, 0), '#5f8f3e'),
    colorize(new THREE.IcosahedronGeometry(1.7, 0).translate(0.9, 6.6, 0.4), '#6e9c45'),
  ]);
  const conifer = mergeSimple([
    trunk(2),
    colorize(new THREE.ConeGeometry(2.3, 5, 6).translate(0, 4.2, 0), '#2f5e3a'),
    colorize(new THREE.ConeGeometry(1.7, 4, 6).translate(0, 7, 0), '#356a40'),
  ]);
  const bush = mergeSimple([colorize(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.8, 1).translate(0, 0.7, 0), '#5d7f37')]);
  treeGeos = { leaf, conifer, bush };
  return treeGeos;
}

const treeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });

/** Place les arbres dans les zones de végétation de la tuile (instanciation : 1 appel GPU par espèce). */
export function buildVegetation(
  feats: GeoFeature[], proj: LocalProjection, grid: HeightGrid, bounds: TileBounds,
  avoid: Avoid | null, maxTrees: number, seed: number,
): THREE.Group | null {
  const zones: Array<{ poly: Poly; rule: VegRule }> = [];
  let estimate = 0;
  for (const f of feats) {
    const rule = VEG[String(f.properties.nature)];
    if (!rule) continue;
    for (const poly of geoToPolys(f.geometry, proj)) {
      const ix0 = Math.max(poly.minX, bounds.x0), ix1 = Math.min(poly.maxX, bounds.x1);
      const iz0 = Math.max(poly.minZ, bounds.z0), iz1 = Math.min(poly.maxZ, bounds.z1);
      if (ix1 <= ix0 || iz1 <= iz0) continue;
      zones.push({ poly, rule });
      estimate += Math.min(Math.abs(polyArea(poly.outer)), (ix1 - ix0) * (iz1 - iz0)) / (rule.spacing * rule.spacing);
    }
  }
  if (!zones.length) return null;
  // Si la tuile est très boisée, on espace un peu les arbres pour rester fluide.
  const density = estimate > maxTrees ? Math.sqrt(estimate / maxTrees) : 1;
  const r = rng(seed);
  const items: Record<TreeKind, THREE.Matrix4[]> = { leaf: [], conifer: [], bush: [] };
  const colors: Record<TreeKind, THREE.Color[]> = { leaf: [], conifer: [], bush: [] };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let count = 0;
  for (const { poly, rule } of zones) {
    const sp = rule.spacing * density;
    const ix0 = Math.max(poly.minX, bounds.x0), ix1 = Math.min(poly.maxX, bounds.x1);
    const iz0 = Math.max(poly.minZ, bounds.z0), iz1 = Math.min(poly.maxZ, bounds.z1);
    for (let z = iz0 + sp / 2; z < iz1; z += sp) {
      for (let x = ix0 + sp / 2; x < ix1; x += sp) {
        if (count >= maxTrees) break;
        const px = x + (r() - 0.5) * sp * 0.8, pz = z + (r() - 0.5) * sp * 0.8;
        if (!pointInPoly(px, pz, poly)) continue;
        if (avoid && avoid(px, pz)) continue; // pas d'arbre sur la chaussée
        const kind: TreeKind = rule.kind === 'mixed' ? (r() < 0.5 ? 'leaf' : 'conifer') : rule.kind;
        const sc = rule.scale * (0.75 + r() * 0.6);
        q.setFromAxisAngle(yAxis, r() * Math.PI * 2);
        s.set(sc, sc * (0.85 + r() * 0.35), sc);
        v.set(px, sampleGrid(grid, px, pz) - 0.2, pz);
        items[kind].push(m.compose(v, q, s).clone());
        const l = 0.82 + r() * 0.36;
        colors[kind].push(new THREE.Color(l, l * (0.95 + r() * 0.1), l * 0.9));
        count++;
      }
    }
  }
  const geos = getTreeGeos();
  const group = new THREE.Group();
  (Object.keys(items) as TreeKind[]).forEach((k) => {
    if (!items[k].length) return;
    const inst = new THREE.InstancedMesh(geos[k], treeMaterial, items[k].length);
    items[k].forEach((mat, i) => {
      inst.setMatrixAt(i, mat);
      inst.setColorAt(i, colors[k][i]);
    });
    inst.computeBoundingSphere();
    group.add(inst);
  });
  return group;
}

// ---------------------------------------------------------------------------
// Routes et voies ferrées

export function buildRoads(
  roads: GeoFeature[], rails: GeoFeature[], proj: LocalProjection, grid: HeightGrid,
  bounds: TileBounds, skip: Avoid | null,
): THREE.BufferGeometry | null {
  const mb = new MeshBuilder();
  const up: [number, number, number] = [0, 1, 0];

  const ribbon = (line: Array<[number, number, number]>, width: number, color: RGB, lift: number, ownZ: boolean, skipRoute: boolean) => {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ah, az] = line[i], [bx, bh, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.1) continue;
      const pieces = Math.max(1, Math.ceil(len / 10));
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const nx = -dz * (width / 2), nz = dx * (width / 2);
      for (let k = 0; k < pieces; k++) {
        // segments légèrement prolongés pour combler les angles
        const t0 = Math.max(0, k / pieces - 0.02), t1 = Math.min(1, (k + 1) / pieces + 0.02);
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
        const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        if (!inTile(bounds, mx, mz)) continue;
        if (skipRoute && skip && skip(mx, mz)) continue; // déjà dessinée par le parcours GPX
        const y0 = (ownZ ? ah + (bh - ah) * t0 : sampleGrid(grid, x0, z0)) + lift;
        const y1 = (ownZ ? ah + (bh - ah) * t1 : sampleGrid(grid, x1, z1)) + lift;
        mb.quad([x0 + nx, y0, z0 + nz], [x0 - nx, y0, z0 - nz], [x1 - nx, y1, z1 - nz], [x1 + nx, y1, z1 + nz], color, up);
      }
    }
  };

  for (const f of roads) {
    const p = f.properties;
    const pos = Number(p.position_par_rapport_au_sol ?? 0);
    if (pos < 0) continue; // tunnel
    const style = ROAD_CLASSES[String(p.nature)];
    if (!style) continue; // escaliers, bacs
    const width = roadWidth(p);
    const color = hexLinear(roadColor(p));
    for (const line of geoToLines(f.geometry, proj)) {
      // Pont : on garde l'altitude BD TOPO de la chaussée ; sinon on épouse le relief.
      const own = pos > 0 && line.every((pt) => Number.isFinite(pt[1]));
      ribbon(line, width, color, own ? 0.2 : 0.14, own, true);
    }
  }
  const ballast = hexLinear('#6f675f'), rail = hexLinear('#b9b9b9');
  for (const f of rails) {
    if (Number(f.properties.position_par_rapport_au_sol ?? 0) < 0) continue;
    for (const line of geoToLines(f.geometry, proj)) {
      ribbon(line, 3.2, ballast, 0.12, false, false);
      // deux rails, décalés de part et d'autre de l'axe
      for (const off of [-0.72, 0.72]) {
        const shifted = offsetLine(line, off);
        ribbon(shifted, 0.12, rail, 0.3, false, false);
      }
    }
  }
  return mb.build();
}

function offsetLine(line: Array<[number, number, number]>, off: number): Array<[number, number, number]> {
  return line.map((pt, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const l = Math.hypot(dx, dz) || 1;
    return [pt[0] - (dz / l) * off, pt[1], pt[2] + (dx / l) * off];
  });
}
