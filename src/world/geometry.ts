/**
 * Outils de géométrie partagés : constructeur de maillage « low-poly »
 * (chaque triangle a sa propre couleur), polygones, grilles d'altitude.
 */
import * as THREE from 'three';
import type { LocalProjection } from '../geo/projection';

export type RGB = [number, number, number];

/** Accumule des triangles colorés puis produit une BufferGeometry non indexée (faces planes). */
export class MeshBuilder {
  private pos: number[] = [];
  private col: number[] = [];

  get triangleCount(): number {
    return this.pos.length / 9;
  }

  /**
   * Ajoute un triangle. Si `facing` est fourni, l'ordre des sommets est corrigé pour que
   * la face regarde dans cette direction (vers le haut pour un toit, vers l'extérieur pour un mur).
   */
  tri(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    color: RGB,
    facing?: [number, number, number],
  ): void {
    if (facing) {
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * facing[0] + ny * facing[1] + nz * facing[2] < 0) {
        this.pos.push(ax, ay, az, cx, cy, cz, bx, by, bz);
        this.col.push(...color, ...color, ...color);
        return;
      }
    }
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.col.push(...color, ...color, ...color);
  }

  /** Quadrilatère a-b-c-d (deux triangles). */
  quad(a: number[], b: number[], c: number[], d: number[], color: RGB, facing?: [number, number, number]): void {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], color, facing);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], color, facing);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals(); // géométrie non indexée → normales de faces = rendu facetté
    g.computeBoundingSphere();
    return g;
  }
}

/** Polygone en coordonnées locales (x, z) : contour extérieur + trous. */
export interface Poly {
  outer: Array<[number, number]>;
  holes: Array<Array<[number, number]>>;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Convertit une géométrie GeoJSON (Polygon / MultiPolygon, lon-lat) en polygones locaux. */
export function geoToPolys(geom: { type: string; coordinates: unknown }, proj: LocalProjection): Poly[] {
  const out: Poly[] = [];
  const polys = geom.type === 'MultiPolygon'
    ? (geom.coordinates as number[][][][])
    : geom.type === 'Polygon' ? [geom.coordinates as number[][][]] : [];
  for (const poly of polys) {
    if (!poly.length) continue;
    const rings = poly.map((ring) => {
      const pts = ring.map(([lon, lat]) => {
        const p = proj.toLocal(lat, lon);
        return [p.x, p.z] as [number, number];
      });
      // le dernier point GeoJSON répète le premier : on le retire
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      return pts;
    });
    const outer = rings[0];
    if (outer.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of outer) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    out.push({ outer, holes: rings.slice(1).filter((r) => r.length >= 3), minX, maxX, minZ, maxZ });
  }
  return out;
}

/** Convertit une géométrie GeoJSON linéaire en polylignes locales (x, y, z) ; y = altitude BD TOPO si présente. */
export function geoToLines(geom: { type: string; coordinates: unknown }, proj: LocalProjection): Array<Array<[number, number, number]>> {
  const lines = geom.type === 'MultiLineString'
    ? (geom.coordinates as number[][][])
    : geom.type === 'LineString' ? [geom.coordinates as number[][]] : [];
  return lines.map((l) => l.map(([lon, lat, h]) => {
    const p = proj.toLocal(lat, lon);
    return [p.x, Number.isFinite(h) ? h : NaN, p.z] as [number, number, number];
  }));
}

function inRing(x: number, z: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPoly(x: number, z: number, p: Poly): boolean {
  if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) return false;
  if (!inRing(x, z, p.outer)) return false;
  for (const h of p.holes) if (inRing(x, z, h)) return false;
  return true;
}

export function polyArea(ring: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

/** Grille d'altitude d'une tuile (rangée 0 = bord nord, colonne 0 = bord ouest). */
export interface HeightGrid {
  x0: number;
  z0: number;
  size: number;
  /** nombre de mailles par côté (la grille a res + 1 points par côté) */
  res: number;
  h: Float32Array;
}

/** Altitude interpolée dans la grille (bornée aux bords de la tuile). */
export function sampleGrid(g: HeightGrid, x: number, z: number): number {
  const n = g.res;
  const fx = Math.min(n, Math.max(0, ((x - g.x0) / g.size) * n));
  const fz = Math.min(n, Math.max(0, ((z - g.z0) / g.size) * n));
  const c = Math.min(n - 1, Math.floor(fx)), r = Math.min(n - 1, Math.floor(fz));
  const tx = fx - c, tz = fz - r;
  const w = n + 1;
  const h00 = g.h[r * w + c], h01 = g.h[r * w + c + 1], h10 = g.h[(r + 1) * w + c], h11 = g.h[(r + 1) * w + c + 1];
  return h00 * (1 - tx) * (1 - tz) + h01 * tx * (1 - tz) + h10 * (1 - tx) * tz + h11 * tx * tz;
}

/** Petit générateur pseudo-aléatoire déterministe (même monde à chaque chargement). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
