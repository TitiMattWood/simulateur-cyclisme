/**
 * Modèle de parcours : la trace GPX est ré-échantillonnée tous les 5 m, lissée,
 * puis enrichie (altitude IGN, pente, cap, vitesse maximale en virage).
 *
 * Toutes les grandeurs sont stockées dans des tableaux typés (rapides à parcourir),
 * indexés par numéro d'échantillon.
 */
import { LocalProjection, geodesicDistance } from './projection';
import type { GpxPoint } from './gpx';

/** Pas de ré-échantillonnage (m). */
export const ROUTE_STEP = 5;
/** Accélération latérale maximale acceptée en virage (m/s²) — freinage automatique. */
const LATERAL_ACCEL = 4.5;
/** Décélération de freinage (m/s²). */
const BRAKE_DECEL = 3.5;
/** Vitesse maximale absolue en descente (m/s), soit 90 km/h. */
const VMAX_ABS = 25;

export interface RouteSample {
  x: number;
  z: number;
  /** altitude (m) */
  ele: number;
  /** pente (fraction : 0.08 = 8 %) */
  grade: number;
  /** direction horizontale normalisée */
  dirX: number;
  dirZ: number;
  lat: number;
  lon: number;
  /** vitesse maximale conseillée à cet endroit (m/s) */
  vmax: number;
  /** distance depuis le départ (m) */
  dist: number;
  index: number;
}

export const emptySample = (): RouteSample => ({
  x: 0, z: 0, ele: 0, grade: 0, dirX: 1, dirZ: 0, lat: 0, lon: 0, vmax: VMAX_ABS, dist: 0, index: 0,
});

export class Route {
  readonly name: string;
  readonly proj: LocalProjection;
  readonly n: number;
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly lat: Float64Array;
  readonly lon: Float64Array;
  /** distance cumulée réelle (m) */
  readonly dist: Float64Array;
  /** altitude brute (avant lissage) */
  rawEle: Float32Array;
  /** altitude lissée, corrigée des ponts et tunnels */
  ele: Float32Array;
  grade: Float32Array;
  readonly dirX: Float32Array;
  readonly dirZ: Float32Array;
  readonly vmax: Float32Array;
  readonly length: number;
  readonly isLoop: boolean;
  readonly bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
  elevationSource: 'ign' | 'gpx' | 'none' = 'none';

  private constructor(name: string, proj: LocalProjection, xs: number[], zs: number[], eles: number[] | null) {
    this.name = name;
    this.proj = proj;
    const n = xs.length;
    this.n = n;
    this.x = Float64Array.from(xs);
    this.z = Float64Array.from(zs);
    this.lat = new Float64Array(n);
    this.lon = new Float64Array(n);
    this.dist = new Float64Array(n);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const ll = proj.toLatLon(xs[i], zs[i]);
      this.lat[i] = ll.lat;
      this.lon[i] = ll.lon;
      if (i > 0) this.dist[i] = this.dist[i - 1] + geodesicDistance(this.lat[i - 1], this.lon[i - 1], ll.lat, ll.lon);
      minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
      minZ = Math.min(minZ, zs[i]); maxZ = Math.max(maxZ, zs[i]);
    }
    this.bbox = { minX, maxX, minZ, maxZ };
    this.length = this.dist[n - 1];
    this.isLoop = Math.hypot(xs[0] - xs[n - 1], zs[0] - zs[n - 1]) < 60;

    // Direction de la route (différence centrée sur ±10 m).
    this.dirX = new Float32Array(n);
    this.dirZ = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      const dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz) || 1;
      this.dirX[i] = dx / l;
      this.dirZ[i] = dz / l;
    }
    this.vmax = computeSpeedLimits(this);

    const raw = eles ? Float32Array.from(eles) : new Float32Array(n);
    this.rawEle = raw;
    this.ele = raw;
    this.grade = new Float32Array(n);
    this.setElevation(raw, eles ? 'gpx' : 'none');
  }

  /** Construit un parcours à partir des points d'un fichier GPX. */
  static fromPoints(name: string, pts: GpxPoint[]): Route {
    if (pts.length < 2) throw new Error('route-too-short');
    const proj = new LocalProjection(pts[0].lat, pts[0].lon);
    const hasEle = pts.some((p) => p.ele !== undefined);
    // 1) Projection et suppression des doublons (points à moins de 0,5 m).
    const px: number[] = [], pz: number[] = [], pe: number[] = [];
    for (const p of pts) {
      const { x, z } = proj.toLocal(p.lat, p.lon);
      const k = px.length - 1;
      if (k >= 0 && Math.hypot(x - px[k], z - pz[k]) < 0.5) continue;
      px.push(x); pz.push(z); pe.push(p.ele ?? (k >= 0 ? pe[k] : 0));
    }
    if (px.length < 2) throw new Error('route-too-short');
    // 2) Ré-échantillonnage à pas constant.
    const cum = [0];
    for (let i = 1; i < px.length; i++) cum.push(cum[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]));
    const total = cum[cum.length - 1];
    if (total < 50) throw new Error('route-too-short');
    const count = Math.ceil(total / ROUTE_STEP) + 1;
    const xs: number[] = [], zs: number[] = [], es: number[] = [];
    let seg = 0;
    for (let k = 0; k < count; k++) {
      const s = Math.min(k * ROUTE_STEP, total);
      while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
      const l = cum[seg + 1] - cum[seg] || 1;
      const t = Math.min(1, Math.max(0, (s - cum[seg]) / l));
      xs.push(px[seg] + (px[seg + 1] - px[seg]) * t);
      zs.push(pz[seg] + (pz[seg + 1] - pz[seg]) * t);
      es.push(pe[seg] + (pe[seg + 1] - pe[seg]) * t);
    }
    // 3) Lissage latéral (moyenne glissante sur ±10 m) pour gommer le bruit GPS.
    const sx = smooth(xs, 2), sz = smooth(zs, 2);
    return new Route(name, proj, sx, sz, hasEle ? es : null);
  }

  /** Remplace l'altitude (par exemple par celle de l'IGN) et recalcule pentes et lissage. */
  setElevation(raw: Float32Array, source: Route['elevationSource']): void {
    this.rawEle = raw;
    this.elevationSource = source;
    const { ele, grade } = processProfile(this.dist, raw);
    this.ele = ele;
    this.grade = grade;
  }

  /** Index de l'échantillon juste avant la distance d (recherche dichotomique). */
  indexAt(d: number): number {
    const dist = this.dist;
    if (d <= 0) return 0;
    if (d >= this.length) return this.n - 2;
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (dist[mid] <= d) lo = mid; else hi = mid;
    }
    return lo;
  }

  /** Toutes les grandeurs du parcours à la distance d, interpolées. */
  sampleAt(d: number, out: RouteSample = emptySample()): RouteSample {
    const dd = Math.min(Math.max(d, 0), this.length);
    const i = this.indexAt(dd);
    const j = Math.min(i + 1, this.n - 1);
    const span = this.dist[j] - this.dist[i] || 1;
    const t = Math.min(1, Math.max(0, (dd - this.dist[i]) / span));
    const lerp = (a: ArrayLike<number>) => a[i] + (a[j] - a[i]) * t;
    out.x = lerp(this.x);
    out.z = lerp(this.z);
    out.ele = lerp(this.ele);
    out.grade = lerp(this.grade);
    let dx = lerp(this.dirX), dz = lerp(this.dirZ);
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    out.dirX = dx;
    out.dirZ = dz;
    out.lat = lerp(this.lat);
    out.lon = lerp(this.lon);
    out.vmax = Math.min(this.vmax[i], this.vmax[j]);
    out.dist = dd;
    out.index = i;
    return out;
  }

  /** Dénivelé positif cumulé (m) entre deux distances. */
  ascentBetween(d0 = 0, d1 = this.length): number {
    const a = this.indexAt(d0), b = this.indexAt(d1) + 1;
    let up = 0;
    for (let i = a + 1; i <= b && i < this.n; i++) {
      const dh = this.ele[i] - this.ele[i - 1];
      if (dh > 0) up += dh;
    }
    return up;
  }

  get totalAscent(): number {
    return this.ascentBetween();
  }

  get minEle(): number {
    let m = Infinity;
    for (const e of this.ele) m = Math.min(m, e);
    return m;
  }

  get maxEle(): number {
    let m = -Infinity;
    for (const e of this.ele) m = Math.max(m, e);
    return m;
  }
}

/** Moyenne glissante (fenêtre ±k), extrémités conservées. */
function smooth(v: number[], k: number): number[] {
  const n = v.length;
  const out = v.slice();
  for (let i = k; i < n - k; i++) {
    let s = 0;
    for (let j = -k; j <= k; j++) s += v[i + j];
    out[i] = s / (2 * k + 1);
  }
  return out;
}

/**
 * Nettoie le profil d'altitude :
 *  1. Ponts : le relief IGN est le sol nu, donc sous un pont il « voit » la rivière.
 *     On repère les creux étroits (< 160 m) aux bords très raides et on les comble.
 *  2. Tunnels / tranchées : même chose pour les bosses étroites.
 *  3. Lissage gaussien léger, puis calcul de la pente sur ±10 m.
 */
export function processProfile(dist: Float64Array, raw: Float32Array): { ele: Float32Array; grade: Float32Array } {
  const n = raw.length;
  const step = n > 1 ? dist[n - 1] / (n - 1) : ROUTE_STEP;
  const k = Math.max(2, Math.round(80 / step));
  let e = Float32Array.from(raw);
  const closing = minFilter(maxFilter(e, k), k); // comble les creux étroits
  e = patchRuns(e, closing, 1, step);
  const opening = maxFilter(minFilter(e, k), k); // arase les bosses étroites
  e = patchRuns(e, opening, -1, step);

  // Lissage gaussien (sigma ≈ 10 m).
  const sigma = 10 / step;
  const r = Math.ceil(sigma * 3);
  const w: number[] = [];
  for (let j = -r; j <= r; j++) w.push(Math.exp(-(j * j) / (2 * sigma * sigma)));
  const ele = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, ws = 0;
    for (let j = -r; j <= r; j++) {
      const q = i + j;
      if (q < 0 || q >= n) continue;
      s += e[q] * w[j + r];
      ws += w[j + r];
    }
    ele[i] = s / ws;
  }
  const grade = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    const dd = dist[b] - dist[a];
    grade[i] = dd > 0 ? Math.max(-0.3, Math.min(0.3, (ele[b] - ele[a]) / dd)) : 0;
  }
  return { ele, grade };
}

function maxFilter(v: Float32Array, k: number): Float32Array {
  const n = v.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = -Infinity;
    for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) m = Math.max(m, v[j]);
    out[i] = m;
  }
  return out;
}

function minFilter(v: Float32Array, k: number): Float32Array {
  const n = v.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) m = Math.min(m, v[j]);
    out[i] = m;
  }
  return out;
}

/**
 * Remplace par une interpolation linéaire les zones où le profil filtré s'écarte
 * nettement du profil brut (> 3 m) ET où les bords sont trop raides pour une route (> 15 %).
 * sign = +1 pour les creux (ponts), -1 pour les bosses (tunnels).
 */
function patchRuns(e: Float32Array, filtered: Float32Array, sign: number, step: number): Float32Array {
  const n = e.length;
  const out = Float32Array.from(e);
  let i = 0;
  while (i < n) {
    if (sign * (filtered[i] - e[i]) <= 0.5) { i++; continue; }
    const a = i;
    let maxDiff = 0;
    while (i < n && sign * (filtered[i] - e[i]) > 0.5) {
      maxDiff = Math.max(maxDiff, sign * (filtered[i] - e[i]));
      i++;
    }
    const b = i - 1;
    let steep = 0;
    for (let q = Math.max(1, a - 1); q <= Math.min(n - 1, b + 1); q++) steep = Math.max(steep, Math.abs(e[q] - e[q - 1]) / step);
    const left = Math.max(0, a - 1), right = Math.min(n - 1, b + 1);
    if (maxDiff > 3 && steep > 0.15 && right > left) {
      for (let q = left; q <= right; q++) {
        const t = (q - left) / (right - left);
        out[q] = e[left] + (e[right] - e[left]) * t;
      }
    }
  }
  return out;
}

/** Vitesse maximale en virage (freinage automatique avant les épingles). */
function computeSpeedLimits(r: Route): Float32Array {
  const n = r.n;
  const vc = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3);
    const ha = Math.atan2(r.dirZ[a], r.dirX[a]);
    const hb = Math.atan2(r.dirZ[b], r.dirX[b]);
    let dh = hb - ha;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    const ds = r.dist[b] - r.dist[a] || 1;
    const kappa = Math.abs(dh) / ds; // courbure = 1 / rayon
    vc[i] = kappa > 1e-4 ? Math.min(VMAX_ABS, Math.sqrt(LATERAL_ACCEL / kappa)) : VMAX_ABS;
  }
  // Passe arrière : on commence à freiner suffisamment tôt avant le virage.
  for (let i = n - 2; i >= 0; i--) {
    const ds = r.dist[i + 1] - r.dist[i];
    vc[i] = Math.min(vc[i], Math.sqrt(vc[i + 1] * vc[i + 1] + 2 * BRAKE_DECEL * ds));
  }
  return vc;
}

/**
 * Index spatial du parcours : retrouve rapidement le point de route le plus proche
 * d'une position (pour aplanir le terrain sous la chaussée, écarter les arbres, etc.).
 */
export class RouteIndex {
  private readonly cell = 40;
  private readonly grid = new Map<number, number[]>();

  constructor(private readonly route: Route) {
    for (let i = 0; i < route.n - 1; i++) {
      const x0 = Math.min(route.x[i], route.x[i + 1]), x1 = Math.max(route.x[i], route.x[i + 1]);
      const z0 = Math.min(route.z[i], route.z[i + 1]), z1 = Math.max(route.z[i], route.z[i + 1]);
      for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) {
        for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
          const key = this.key(cx, cz);
          let list = this.grid.get(key);
          if (!list) this.grid.set(key, (list = []));
          list.push(i);
        }
      }
    }
  }

  private key(cx: number, cz: number): number {
    return (cx + 50000) * 100000 + (cz + 50000);
  }

  /** Point de route le plus proche dans un rayon maxDist, ou null. */
  nearest(x: number, z: number, maxDist: number): { dist: number; d: number; ele: number } | null {
    const r = Math.ceil(maxDist / this.cell);
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = maxDist, bestD = 0, bestE = 0, found = false;
    const R = this.route;
    for (let i = cx - r; i <= cx + r; i++) {
      for (let j = cz - r; j <= cz + r; j++) {
        const list = this.grid.get(this.key(i, j));
        if (!list) continue;
        for (const s of list) {
          const ax = R.x[s], az = R.z[s], bx = R.x[s + 1], bz = R.z[s + 1];
          const vx = bx - ax, vz = bz - az;
          const l2 = vx * vx + vz * vz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
          const px = ax + vx * t, pz = az + vz * t;
          const dd = Math.hypot(x - px, z - pz);
          if (dd < best) {
            best = dd;
            bestD = R.dist[s] + (R.dist[s + 1] - R.dist[s]) * t;
            bestE = R.ele[s] + (R.ele[s + 1] - R.ele[s]) * t;
            found = true;
          }
        }
      }
    }
    return found ? { dist: best, d: bestD, ele: bestE } : null;
  }
}
