/**
 * Terrain : maillage du relief IGN, coloré d'après l'orthophoto (la vraie couleur du sol
 * vue d'avion) puis stylisé pour garder un rendu low-poly lisible.
 */
import * as THREE from 'three';
import { MeshBuilder, pointInPoly, type HeightGrid, type Poly, type RGB } from './geometry';
import { srgbToLinear } from '../render/engine';
import type { RouteIndex } from '../geo/route';

/** Demi-largeur de la chaussée du parcours (m). */
export const ROAD_HALF_WIDTH = 3;

export interface TerrainOptions {
  ortho: Uint8ClampedArray | null;
  orthoPx: number;
  water: Poly[];
  /** abaissement (m) : les tuiles lointaines passent sous les tuiles détaillées */
  lower: number;
}

/**
 * Aplanit le terrain sous le parcours : la chaussée est posée sur un replat
 * (remblai ou déblai) qui se raccorde en douceur au relief naturel.
 * Les ponts (route > 6 m au-dessus du sol) ne sont pas comblés.
 */
export function flattenUnderRoute(g: HeightGrid, index: RouteIndex): void {
  const w = g.res + 1;
  const step = g.size / g.res;
  // Le replat doit couvrir au moins un sommet de la grille de chaque côté de la route.
  const inner = ROAD_HALF_WIDTH + Math.max(2.5, step * 0.8);
  const outer = inner + 16;
  for (let r = 0; r < w; r++) {
    for (let c = 0; c < w; c++) {
      const x = g.x0 + c * step, z = g.z0 + r * step;
      const near = index.nearest(x, z, outer);
      if (!near) continue;
      const k = r * w + c;
      const target = near.ele - 0.3;
      const diff = target - g.h[k];
      if (diff > 6) continue; // pont : on laisse la vallée en dessous
      const t = near.dist <= inner ? 1 : 1 - smoothstep(inner, outer, near.dist);
      g.h[k] += diff * t;
    }
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const WATER: RGB = [srgbToLinear(0.29), srgbToLinear(0.52), srgbToLinear(0.7)];

/** Couleur de repli sans orthophoto : herbe, roche selon la pente, neige en altitude. */
function paletteColor(y: number, slope: number, noise: number): RGB {
  let r = 0.42 + noise * 0.05, g = 0.6 + noise * 0.06, b = 0.3;
  if (slope > 0.6) { const t = Math.min(1, (slope - 0.6) * 2); r += (0.55 - r) * t; g += (0.53 - g) * t; b += (0.5 - b) * t; }
  if (y > 2500) { const t = Math.min(1, (y - 2500) / 400); r += (0.95 - r) * t; g += (0.96 - g) * t; b += (0.98 - b) * t; }
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** Stylisation de la couleur d'orthophoto : un peu plus saturée et lumineuse. */
function stylize(r: number, g: number, b: number): RGB {
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const sat = 1.3;
  r = l + (r - l) * sat;
  g = l + (g - l) * sat;
  b = l + (b - l) * sat;
  // les ombres des orthophotos sont très sombres : on relève les basses lumières
  const lift = (v: number) => Math.min(1, Math.max(0, 0.06 + v * 1.08));
  return [srgbToLinear(lift(r)), srgbToLinear(lift(g)), srgbToLinear(lift(b))];
}

export function buildTerrain(g: HeightGrid, opt: TerrainOptions): THREE.BufferGeometry | null {
  const mb = new MeshBuilder();
  const n = g.res, w = n + 1;
  const step = g.size / n;
  const H = (r: number, c: number) => g.h[r * w + c] - opt.lower;
  const px = opt.orthoPx;

  const faceColor = (cx: number, cz: number, y: number, slope: number, seed: number): RGB => {
    for (const p of opt.water) if (pointInPoly(cx, cz, p)) return WATER;
    if (opt.ortho) {
      const u = Math.min(px - 1, Math.max(0, Math.floor(((cx - g.x0) / g.size) * px)));
      const v = Math.min(px - 1, Math.max(0, Math.floor(((cz - g.z0) / g.size) * px)));
      const i = (v * px + u) * 4;
      const o = opt.ortho;
      return stylize(o[i] / 255, o[i + 1] / 255, o[i + 2] / 255);
    }
    return paletteColor(y, slope, ((seed * 9301 + 49297) % 233280) / 233280);
  };

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x0 = g.x0 + c * step, x1 = x0 + step;
      const z0 = g.z0 + r * step, z1 = z0 + step;
      const h00 = H(r, c), h01 = H(r, c + 1), h10 = H(r + 1, c), h11 = H(r + 1, c + 1);
      const slope = Math.max(Math.abs(h00 - h11), Math.abs(h01 - h10)) / (step * 1.414);
      // triangle 1 : (r,c) (r+1,c) (r+1,c+1)
      const c1 = faceColor((x0 + x0 + x1) / 3, (z0 + z1 + z1) / 3, (h00 + h10 + h11) / 3, slope, r * 131 + c);
      mb.tri(x0, h00, z0, x0, h10, z1, x1, h11, z1, c1);
      // triangle 2 : (r,c) (r+1,c+1) (r,c+1)
      const c2 = faceColor((x0 + x1 + x1) / 3, (z0 + z1 + z0) / 3, (h00 + h11 + h01) / 3, slope, r * 131 + c + 7);
      mb.tri(x0, h00, z0, x1, h11, z1, x1, h01, z0, c2);
    }
  }
  return mb.build();
}
