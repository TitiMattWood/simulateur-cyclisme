/**
 * Objets du paysage construits à partir de la BD TOPO de l'IGN :
 * bâtiments (emprise et hauteur réelles), forêts, haies, vignes, routes, voies ferrées.
 */
import * as THREE from 'three';
import { ROAD_PERIOD, roadU, FACADE } from './textures';
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

/** Teintes d'enduit (crème, ocre clair, rose pâle, gris clair…) pour les façades enduites. */
const RENDERS = ['#f3ead8', '#efe0c4', '#f0d9c6', '#e7dccd', '#f5f1e8', '#e9d2b4', '#dfe3e0', '#f1e1d0', '#e8d9bf', '#ece6dc'];
/** Teintes des bardages de hangars. */
const CLADDING = ['#d7dbde', '#b9c7cf', '#c9c2b4', '#a9b8a6', '#c7cfd6'];
const ROOF_TILES = ['#a5482f', '#b4553c', '#8e3f2b', '#9a5a3e', '#a34d38'];

/** Tuiles vernissées bourguignonnes (jaune, vert, rouge, noir). */
const GLAZED = ['#c9a227', '#2f6b3a', '#8e2a1c', '#1f2428'].map((c) => hexLinear(c));

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

/** Style de façade et teinte d'un bâtiment, déduits des attributs BD TOPO. */
export interface FacadeChoice {
  /** case de l'atlas pour les étages */
  upper: number;
  /** case de l'atlas pour le rez-de-chaussée */
  ground: number;
  /** teinte (hex) appliquée à la texture */
  tint: string;
}

/**
 * Choix de la façade d'après la BD TOPO (matériaux = codes des fichiers fonciers :
 * 1 pierre, 2 meulière, 3 béton, 4 brique, 5 aggloméré, 6 bois ; le premier chiffre est le
 * matériau principal).
 */
export function chooseFacade(props: Record<string, unknown>, h: number, area: number, r: () => number): FacadeChoice {
  const usage = String(props.usage_1 ?? 'Résidentiel');
  const nature = String(props.nature ?? '');
  const mat = String(props.materiaux_des_murs ?? '').charAt(0);
  const year = parseInt(String(props.date_d_apparition ?? '').slice(0, 4), 10);
  const dwellings = Number(props.nombre_de_logements ?? 0);
  const light = props.construction_legere === true || props.construction_legere === 'true';
  const near = (hex: string) => `#${new THREE.Color(hex).offsetHSL(0, 0, (r() - 0.5) * 0.06).getHexString()}`;
  const same = (cell: number, tint: string): FacadeChoice => ({ upper: cell, ground: cell, tint });
  if (/glise|Chapelle|Château|Tour|donjon|Fort|Monument|Arc/.test(nature) || usage === 'Religieux') return same(FACADE.pierre, near('#f2eee4'));
  if (light || usage === 'Annexe' || (h < 3.2 && area < 40)) return same(FACADE.enduit, pick(RENDERS, r()));
  if (usage === 'Industriel' || usage === 'Agricole' || (usage === 'Commercial et services' && h <= 10 && area > 700)) {
    return same(FACADE.bardage, pick(CLADDING, r()));
  }
  if (usage === 'Commercial et services' && h > 10) return same(FACADE.bureaux, near('#ffffff'));
  if (usage === 'Commercial et services') return { upper: FACADE.enduit, ground: FACADE.vitrine, tint: pick(RENDERS, r()) };
  // résidentiel et indifférencié
  const collective = dwellings > 4 || h > 11;
  if (mat === '2') return same(FACADE.meuliere, near('#ffffff'));
  if (mat === '4') return same(FACADE.brique, near('#ffffff'));
  if (mat === '1' || (year > 0 && year < 1900 && !collective)) return same(FACADE.pierre, near('#ffffff'));
  if (collective) {
    // immeubles : rez-de-chaussée commerçant pour une partie d'entre eux
    const shops = h > 12 && r() < 0.35;
    return { upper: FACADE.balcons, ground: shops ? FACADE.vitrine : FACADE.balcons, tint: pick(RENDERS, r()) };
  }
  return same(FACADE.pavillon, pick(RENDERS, r()));
}

/** Couleur de toiture d'après le matériau BD TOPO (1 tuiles, 2 ardoise, 3 zinc, 4 béton). */
function roofColor(props: Record<string, unknown>, r: () => number, flat: boolean): string {
  const m = String(props.materiaux_de_la_toiture ?? '').charAt(0);
  if (m === '2') return '#4d5560';
  if (m === '3') return '#7d858c';
  if (flat || m === '4') return pick(['#8f8d86', '#8a8e92', '#96928a'], r());
  return pick(ROOF_TILES, r());
}

/** Murs texturés : position, normale, uv (travées, étages), couleur (teinte), case d'atlas. */
class WallBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  cell: number[] = [];

  private push(p: number[], n: number[], u: number[], c: RGB, cell: [number, number]): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(u[0], u[1]);
    this.col.push(c[0], c[1], c[2]);
    this.cell.push(cell[0], cell[1]);
  }

  /** Quadrilatère vertical a-b (en bas) jusqu'à la hauteur top, u de 0 à uMax, v selon la hauteur. */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, ground: number, floorH: number, u0: number, u1: number, tint: RGB, cell: [number, number], push = 0): void {
    const dx = bx - ax, dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const n = [dz / l, 0, -dx / l];
    // décalage vers l'extérieur : départage deux bâtiments BD TOPO aux murs confondus
    ax += n[0] * push; az += n[2] * push; bx += n[0] * push; bz += n[2] * push;
    const v0 = (y0 - ground) / floorH, v1 = (y1 - ground) / floorH;
    const A = [ax, y0, az], B = [bx, y0, bz], C = [bx, y1, bz], D = [ax, y1, az];
    const uA = [u0, v0], uB = [u1, v0], uC = [u1, v1], uD = [u0, v1];
    for (const [p, u] of [[A, uA], [B, uB], [C, uC], [A, uA], [C, uC], [D, uD]]) this.push(p, n, u, tint, cell);
  }

  /** Pignon triangulaire (sous un toit à deux pans). */
  gable(a: number[], b: number[], apex: number[], ground: number, floorH: number, tint: RGB): void {
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const l = Math.hypot(dx, dz) || 1;
    const n = [dz / l, 0, -dx / l];
    const w = l / 3;
    const ua = [0, (a[1] - ground) / floorH], ub = [w, (b[1] - ground) / floorH], uc = [w / 2, (apex[1] - ground) / floorH];
    const cell: [number, number] = [FACADE.enduit, FACADE.enduit];
    for (const [p, u] of [[a, ua], [b, ub], [apex, uc]]) this.push(p, n, u, tint, cell);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aCell', new THREE.Float32BufferAttribute(this.cell, 2));
    return g;
  }
}

/** Bâtiments d'une tuile : murs à façades texturées + toits (couleurs par sommet). */
export interface Buildings {
  walls: THREE.BufferGeometry | null;
  roofs: THREE.BufferGeometry | null;
}

export function buildBuildings(
  feats: GeoFeature[], proj: LocalProjection, grid: HeightGrid, bounds: TileBounds,
): Buildings {
  const mb = new MeshBuilder();
  const wb = new WallBuilder();
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
    const floors = Number(props.nombre_d_etages);
    let h = Number(props.hauteur);
    if (!(h > 0)) h = floors > 0 ? floors * 3 + 1 : 6;
    h = Math.min(250, Math.max(2.5, h));
    const r = rng(hashString(f.id));
    // Base : point le plus bas du sol sous l'emprise, enfoncé pour ne pas flotter en pente.
    let base = Infinity;
    for (const [x, z] of ring) base = Math.min(base, sampleGrid(grid, x, z));
    const ground = base;
    base -= 1;
    const area = Math.abs(polyArea(ring));
    if (polyArea(ring) > 0) ring = ring.slice().reverse();

    const church = /glise|Chapelle/.test(nature);
    const pitched = !church && ring.length === 4 && h <= 13 && area < 600 && usage !== 'Industriel' && usage !== 'Commercial et services';
    const roofH = pitched ? Math.min(4, 0.42 * Math.sqrt(area) * 0.5) : 0;
    const eaves = base + 1 + h - roofH;
    const choice = chooseFacade(props, h, area, r);
    // de 1 à 9 cm selon le bâtiment (invisible, mais supprime le scintillement des murs confondus)
    const push = 0.01 + (hashString(f.id) % 9) * 0.01;
    const tint = hexLinear(choice.tint);
    // hauteur d'un étage : d'après le nombre d'étages s'il est connu, sinon ≈ 2,9 m
    const wallH = eaves - ground;
    const nFloors = floors > 0 ? floors : Math.max(1, Math.round(wallH / 2.9));
    const floorH = Math.min(4.2, Math.max(2.5, wallH / nFloors));

    // Murs : le contour est parcouru dans le sens horaire (aire négative), ce qui oriente
    // chaque mur vers l'extérieur, même pour les bâtiments en L ou en arc de cercle.
    // Travées : un mur droit d'au moins 4 m reçoit un nombre entier de travées (fenêtres
    // centrées) ; les suites de petits murs (façades courbes) gardent une trame continue.
    const perimeter = ring.reduce((sum, [x, z], i) => sum + Math.hypot(ring[(i + 1) % ring.length][0] - x, ring[(i + 1) % ring.length][1] - z), 0);
    const tiny = perimeter < 10; // abri, cabane : enduit nu
    let u = 0;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
      const len = Math.hypot(bx - ax, bz - az);
      let u0 = u, u1: number;
      if (len >= 4) {
        u0 = 0;
        u1 = Math.max(1, Math.round(len / 3));
        u = 0;
      } else {
        u1 = u0 + len / 3;
        u = u1;
      }
      const cell: [number, number] = tiny ? [FACADE.enduit, FACADE.enduit] : [choice.upper, choice.ground];
      const shade = 0.9 + 0.1 * Math.abs(Math.sin(i * 1.7));
      wb.wall(ax, az, bx, bz, base, eaves, ground, floorH, u0, u1, [tint[0] * shade, tint[1] * shade, tint[2] * shade], cell, push);
    }

    if (pitched) {
      const roof = hexLinear(roofColor(props, r, false));
      const roof2: RGB = [roof[0] * 0.82, roof[1] * 0.82, roof[2] * 0.82];
      let [A, B, C, D] = ring;
      if (Math.hypot(B[0] - A[0], B[1] - A[1]) < Math.hypot(C[0] - B[0], C[1] - B[1])) [A, B, C, D] = [B, C, D, A];
      const top = eaves + roofH;
      const a = [A[0], eaves, A[1]], b = [B[0], eaves, B[1]], c = [C[0], eaves, C[1]], d = [D[0], eaves, D[1]];
      let M1 = [(A[0] + D[0]) / 2, top, (A[1] + D[1]) / 2];
      let M2 = [(B[0] + C[0]) / 2, top, (B[1] + C[1]) / 2];
      // toit à quatre pans pour une partie des pavillons : faîtage raccourci
      const hip = usage === 'Résidentiel' && area < 260 && r() < 0.45;
      if (hip) {
        const k = Math.min(0.45, (Math.hypot(C[0] - B[0], C[1] - B[1]) / 2) / (Math.hypot(B[0] - A[0], B[1] - A[1]) || 1));
        const m1 = M1.slice(), m2 = M2.slice();
        M1 = [m1[0] + (m2[0] - m1[0]) * k, top, m1[2] + (m2[2] - m1[2]) * k];
        M2 = [m2[0] + (m1[0] - m2[0]) * k, top, m2[2] + (m1[2] - m2[2]) * k];
        mb.tri(b[0], b[1], b[2], c[0], c[1], c[2], M2[0], M2[1], M2[2], roof2, up);
        mb.tri(d[0], d[1], d[2], a[0], a[1], a[2], M1[0], M1[1], M1[2], roof2, up);
      } else {
        wb.gable(b, c, M2, ground, floorH, tint);
        wb.gable(d, a, M1, ground, floorH, tint);
      }
      mb.quad(a, b, M2, M1, roof, up);
      mb.quad(c, d, M1, M2, roof2, up);
    } else {
      // Toit plat triangulé (ou pointe pour les églises).
      const roof = hexLinear(church ? '#55606c' : roofColor(props, r, true));
      const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [i, j, k] of tris) {
        mb.tri(ring[i][0], eaves, ring[i][1], ring[j][0], eaves, ring[j][1], ring[k][0], eaves, ring[k][1], roof, up);
      }
      // acrotère : petit rebord autour des toits plats des immeubles
      if (!church && h > 8) {
        const lip = hexLinear('#b9b4aa');
        for (let i = 0; i < ring.length; i++) {
          const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
          mb.quad([ax, eaves, az], [bx, eaves, bz], [bx, eaves + 0.6, bz], [ax, eaves + 0.6, az], lip);
        }
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
  return { walls: wb.build(), roofs: mb.build() };
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

/** Rues construites pour une tuile : chaussée texturée, trottoirs et marquages, lampadaires. */
export interface Streets {
  /** chaussées (position, normale, uv dans l'atlas de chaussée, couleur de teinte) */
  surface: THREE.BufferGeometry | null;
  /** trottoirs, bordures, passages piétons et voies ferrées (couleurs par sommet) */
  extras: THREE.BufferGeometry | null;
  /** lampadaires : x, y, z, angle (rad) — un par entrée */
  lamps: Array<[number, number, number, number]>;
}

/** Colonne de l'atlas de chaussée selon la route (voir world/textures.ts). */
export function roadColumn(p: Record<string, unknown>): number {
  const style = ROAD_CLASSES[String(p.nature)];
  if (!style || style.surface !== 'asphalt') return 3;
  const nature = String(p.nature);
  const sens = String(p.sens_de_circulation ?? '');
  const width = roadWidth(p);
  const oneWay = sens === 'Sens direct' || sens === 'Sens inverse';
  if (oneWay || width < 4.8 || nature === 'Rond-point' || nature === 'Bretelle' || nature === 'Piste cyclable') return 2;
  return p.urbain === true || p.urbain === 'true' ? 1 : 0;
}

/** Une route de ville (avec trottoirs) ? */
function hasSidewalks(p: Record<string, unknown>): boolean {
  const nature = String(p.nature);
  return (p.urbain === true || p.urbain === 'true')
    && ['Route à 1 chaussée', 'Route à 2 chaussées', 'Rond-point', 'Bretelle'].includes(nature)
    && Number(p.position_par_rapport_au_sol ?? 0) === 0;
}

export function buildStreets(
  roads: GeoFeature[], rails: GeoFeature[], proj: LocalProjection, grid: HeightGrid,
  bounds: TileBounds, skip: Avoid | null,
): Streets {
  const mb = new MeshBuilder();
  const up: [number, number, number] = [0, 1, 0];
  const pos: number[] = [], uv: number[] = [], col: number[] = [];
  const lamps: Streets['lamps'] = [];
  const quadUV = (
    a: number[], b: number[], c: number[], d: number[],
    ua: [number, number], ub: [number, number], uc: [number, number], ud: [number, number], tint: RGB,
  ) => {
    // a, c, b puis a, d, c : sens qui donne une face tournée vers le haut
    for (const [p, t] of [[a, ua], [c, uc], [b, ub], [a, ua], [d, ud], [c, uc]] as Array<[number[], [number, number]]>) {
      pos.push(p[0], p[1], p[2]);
      uv.push(t[0], t[1]);
      col.push(tint[0], tint[1], tint[2]);
    }
  };
  const sidewalk = hexLinear('#b3aea4'), sidewalk2 = hexLinear('#a9a49a'), curb = hexLinear('#8f8f8b'), paint = hexLinear('#e9e8e2');

  for (const f of roads) {
    const p = f.properties;
    const position = Number(p.position_par_rapport_au_sol ?? 0);
    if (position < 0) continue; // tunnel
    const style = ROAD_CLASSES[String(p.nature)];
    if (!style) continue; // escaliers, bacs
    const width = roadWidth(p);
    const column = roadColumn(p);
    const walks = hasSidewalks(p);
    const sw = width < 5 ? 1.5 : 2.0;
    // teinte : enrobé neutre (légère variation), piste cyclable rougeâtre, chemins à leur couleur
    let tint: RGB;
    if (column === 3) {
      const c = hexLinear(roadColor(p));
      const base = hexLinear('#c8b896');
      tint = [c[0] / base[0], c[1] / base[1], c[2] / base[2]];
    } else if (String(p.nature) === 'Piste cyclable') tint = [1.5, 0.75, 0.68];
    else {
      const k = 0.94 + (Number(p.importance ?? 5) % 3) * 0.04;
      tint = [k, k, k];
    }
    for (const line of geoToLines(f.geometry, proj)) {
      // Pont : on garde l'altitude BD TOPO de la chaussée ; sinon on épouse le relief.
      const own = position > 0 && line.every((pt) => Number.isFinite(pt[1]));
      const lift = own ? 0.2 : 0.14;
      let total = 0;
      for (let i = 0; i < line.length - 1; i++) total += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][2] - line[i][2]);
      let dist = 0;
      let lampSide = 1;
      let nextLamp = 10;
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ah, az] = line[i], [bx, bh, bz] = line[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.1) continue;
        const pieces = Math.max(1, Math.ceil(len / 8));
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        const hw = width / 2;
        const nx = -dz, nz = dx; // normale (vers la gauche)
        for (let k = 0; k < pieces; k++) {
          // segments légèrement prolongés pour combler les angles
          const t0 = Math.max(0, k / pieces - 0.02), t1 = Math.min(1, (k + 1) / pieces + 0.02);
          const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
          const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
          const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
          const d0 = dist + len * t0, d1 = dist + len * t1;
          if (!inTile(bounds, mx, mz)) continue;
          if (skip && skip(mx, mz)) continue; // déjà dessinée par le parcours GPX
          const y0 = (own ? ah + (bh - ah) * t0 : sampleGrid(grid, x0, z0)) + lift;
          const y1 = (own ? ah + (bh - ah) * t1 : sampleGrid(grid, x1, z1)) + lift;
          const v0 = d0 / ROAD_PERIOD, v1 = d1 / ROAD_PERIOD;
          quadUV(
            [x0 + nx * hw, y0, z0 + nz * hw], [x0 - nx * hw, y0, z0 - nz * hw], [x1 - nx * hw, y1, z1 - nz * hw], [x1 + nx * hw, y1, z1 + nz * hw],
            [roadU(column, 0), v0], [roadU(column, 1), v0], [roadU(column, 1), v1], [roadU(column, 0), v1], tint,
          );
          if (!walks) continue;
          // trottoirs : pas dans les 6 premiers et derniers mètres (carrefours)
          const nearEnd = Math.min(d0, total - d1) < 6;
          if (!nearEnd) {
            for (const side of [1, -1]) {
              const e = hw * side, o = (hw + sw) * side;
              const h = 0.15;
              const shade = (Math.floor(d0 / 8) % 2) ? sidewalk : sidewalk2;
              // dessus du trottoir
              mb.quad(
                [x0 + nx * e, y0 + h, z0 + nz * e], [x0 + nx * o, y0 + h, z0 + nz * o],
                [x1 + nx * o, y1 + h, z1 + nz * o], [x1 + nx * e, y1 + h, z1 + nz * e], shade, up,
              );
              // bordure (face verticale côté chaussée)
              mb.quad(
                [x0 + nx * e, y0, z0 + nz * e], [x0 + nx * e, y0 + h, z0 + nz * e],
                [x1 + nx * e, y1 + h, z1 + nz * e], [x1 + nx * e, y1, z1 + nz * e], curb, [-nx * side, 0, -nz * side],
              );
            }
          }
          // lampadaires en quinconce, environ tous les 28 m
          if (!nearEnd && d0 >= nextLamp) {
            const o = (hw + sw - 0.35) * lampSide;
            // le bras (axe +X du modèle) pointe vers la chaussée
            lamps.push([mx + nx * o, (y0 + y1) / 2 + 0.15, mz + nz * o, Math.atan2(nz * lampSide, -nx * lampSide)]);
            lampSide = -lampSide;
            nextLamp = d0 + 28;
          }
        }
        dist += len;
      }
      // passages piétons près des carrefours (rues de ville assez larges)
      if (walks && total > 24 && width >= 5) {
        for (const atStart of [true, false]) {
          const i = atStart ? 0 : line.length - 2;
          const [ax, , az] = line[i], [bx, , bz] = line[i + 1];
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 6) continue;
          const dx = (bx - ax) / len, dz = (bz - az) / len;
          const s0 = atStart ? 3 : len - 6;
          const cx = ax + dx * s0, cz = az + dz * s0;
          if (!inTile(bounds, cx, cz) || (skip && skip(cx, cz))) continue;
          const y = sampleGrid(grid, cx, cz) + lift + 0.02;
          const nx = -dz, nz = dx;
          // bandes de 0,5 m parallèles à la route, espacées de 0,5 m, sur 3 m de long
          for (let w = -width / 2 + 0.4; w < width / 2 - 0.4; w += 1.0) {
            const px = cx + nx * w, pz = cz + nz * w;
            const qx = px + nx * 0.5, qz = pz + nz * 0.5;
            mb.quad([px, y, pz], [qx, y, qz], [qx + dx * 3, y, qz + dz * 3], [px + dx * 3, y, pz + dz * 3], paint, up);
          }
        }
      }
    }
  }
  const ballast = hexLinear('#6f675f'), rail = hexLinear('#b9b9b9');
  const ribbon = (line: Array<[number, number, number]>, width: number, color: RGB, lift: number) => {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, , az] = line[i], [bx, , bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.1) continue;
      const pieces = Math.max(1, Math.ceil(len / 10));
      const nx = (-(bz - az) / len) * (width / 2), nz = ((bx - ax) / len) * (width / 2);
      for (let k = 0; k < pieces; k++) {
        const t0 = Math.max(0, k / pieces - 0.02), t1 = Math.min(1, (k + 1) / pieces + 0.02);
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        if (!inTile(bounds, (x0 + x1) / 2, (z0 + z1) / 2)) continue;
        const y0 = sampleGrid(grid, x0, z0) + lift, y1 = sampleGrid(grid, x1, z1) + lift;
        mb.quad([x0 + nx, y0, z0 + nz], [x0 - nx, y0, z0 - nz], [x1 - nx, y1, z1 - nz], [x1 + nx, y1, z1 + nz], color, up);
      }
    }
  };
  for (const f of rails) {
    if (Number(f.properties.position_par_rapport_au_sol ?? 0) < 0) continue;
    for (const line of geoToLines(f.geometry, proj)) {
      ribbon(line, 3.2, ballast, 0.12);
      // deux rails, décalés de part et d'autre de l'axe
      for (const off of [-0.72, 0.72]) ribbon(offsetLine(line, off), 0.12, rail, 0.3);
    }
  }
  let surface: THREE.BufferGeometry | null = null;
  if (pos.length) {
    surface = new THREE.BufferGeometry();
    surface.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    surface.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    surface.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const nrm = new Float32Array(pos.length);
    for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    surface.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  }
  return { surface, extras: mb.build(), lamps };
}

function offsetLine(line: Array<[number, number, number]>, off: number): Array<[number, number, number]> {
  return line.map((pt, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const l = Math.hypot(dx, dz) || 1;
    return [pt[0] - (dz / l) * off, pt[1], pt[2] + (dx / l) * off];
  });
}
