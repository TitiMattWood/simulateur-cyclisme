/**
 * Terrain : maillage du relief IGN, coloré d'après l'orthophoto (la vraie couleur du sol
 * vue d'avion) puis stylisé pour garder un rendu low-poly lisible.
 */
import * as THREE from 'three';
import { MeshBuilder, pointInPoly, sampleGrid, type HeightGrid, type Poly, type RGB, type SegmentIndex } from './geometry';
import { srgbToLinear, hexLinear } from '../render/engine';
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

/**
 * Aplanit le terrain sous toutes les routes de la tuile : chaque sommet proche d'une
 * chaussée prend l'altitude de l'axe de la route (relief d'origine), ce qui crée le
 * petit replat de la chaussée dans les pentes. Les ponts ne sont pas dans l'index.
 */
export function flattenUnderRoads(g: HeightGrid, roads: SegmentIndex<{ halfW: number }>): void {
  if (!roads.size) return;
  const w = g.res + 1;
  const step = g.size / g.res;
  const orig: HeightGrid = { ...g, h: Float32Array.from(g.h) };
  const inner = Math.max(1.5, step * 0.7);
  const blend = 10;
  for (let r = 0; r < w; r++) {
    for (let c = 0; c < w; c++) {
      const x = g.x0 + c * step, z = g.z0 + r * step;
      const hit = roads.nearest(x, z, 7 + inner + blend, (d) => d.halfW);
      if (!hit) continue;
      const edge = hit.dist - hit.data.halfW;
      if (edge > inner + blend) continue;
      const k = r * w + c;
      const target = sampleGrid(orig, hit.px, hit.pz) - 0.15;
      const t = edge <= inner ? 1 : 1 - smoothstep(inner, inner + blend, edge);
      g.h[k] += (target - g.h[k]) * t;
    }
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const WATER: RGB = [srgbToLinear(0.24), srgbToLinear(0.55), srgbToLinear(0.8)];

/** Couleur de repli sans orthophoto : herbe, roche selon la pente, neige en altitude. */
function paletteColor(y: number, slope: number, noise: number): RGB {
  let r = 0.43 + noise * 0.05, g = 0.7 + noise * 0.06, b = 0.25;
  if (slope > 0.6) { const t = Math.min(1, (slope - 0.6) * 2); r += (0.55 - r) * t; g += (0.53 - g) * t; b += (0.5 - b) * t; }
  if (y > 2500) { const t = Math.min(1, (y - 2500) / 400); r += (0.95 - r) * t; g += (0.96 - g) * t; b += (0.98 - b) * t; }
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/**
 * Palette « dessin animé » du sol (style low-poly à aplats) : l'orthophoto ne sert plus
 * qu'à reconnaître ce qu'il y a par terre (pré, champ, labour, forêt, ville). Chaque face
 * prend la couleur franche de sa catégorie au lieu de la couleur délavée de la photo.
 */
const GROUND = {
  meadow: ['#6db33f', '#78bd45', '#64a838'],
  lush: ['#4f9a33', '#579f36'],
  forest: ['#3d7d2c', '#447f2f'],
  crop: ['#98bb48', '#a3c04e'],
  wheat: ['#b5c25f', '#bfc768'],
  soil: ['#ab9466', '#b49c6c'],
  urban: ['#cfc8b8', '#c6c0b2'],
  rock: ['#9c9a94', '#a8a59e'],
} as const;
const GROUND_LIN = Object.fromEntries(
  Object.entries(GROUND).map(([k, v]) => [k, v.map((h) => hexLinear(h))]),
) as Record<keyof typeof GROUND, RGB[]>;

/** Catégorie de sol d'après la couleur moyenne de l'orthophoto (composantes sRGB 0–1). */
export function groundClass(r: number, g: number, b: number): keyof typeof GROUND {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max, sat = max > 0 ? (max - min) / max : 0;
  // gris / blanc peu saturé : routes, toits, cours, carrières → ville (ou roche si sombre)
  if (sat < 0.12) {
    // un chaume ou un champ labouré clair reste un peu « chaud » (rouge > bleu) ; le béton,
    // l'enrobé et les toits sont neutres ou bleutés
    if (r - b > 0.035) return v > 0.55 ? 'wheat' : 'soil';
    return v > 0.45 ? 'urban' : 'rock';
  }
  if (g >= r && g >= b) {
    if (v < 0.3) return 'forest';
    if (v < 0.4) return 'lush';
    return 'meadow';
  }
  // dominante rouge/jaune : champs moissonnés (clairs), cultures jaunies, labours (bruns)
  if (v > 0.62 && g > b * 1.25) return 'wheat';
  if (g > r * 0.92) return 'crop';
  return 'soil';
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
      // moyenne 3×3 pixels autour du centre de la face : on lisse le bruit de la photo
      const u0 = Math.floor(((cx - g.x0) / g.size) * px), v0 = Math.floor(((cz - g.z0) / g.size) * px);
      const o = opt.ortho;
      let sr = 0, sg = 0, sb = 0, nPx = 0;
      for (let dv = -1; dv <= 1; dv++) {
        for (let du = -1; du <= 1; du++) {
          const u = Math.min(px - 1, Math.max(0, u0 + du)), v = Math.min(px - 1, Math.max(0, v0 + dv));
          const i = (v * px + u) * 4;
          sr += o[i]; sg += o[i + 1]; sb += o[i + 2]; nPx++;
        }
      }
      const k = 255 * nPx;
      let cls = groundClass(sr / k, sg / k, sb / k);
      if (cls === 'rock' && slope < 0.5 && y < 1800) cls = 'lush'; // ombre portée sur un pré
      if (slope > 0.9 && y > 1200) cls = 'rock';
      const pal = GROUND_LIN[cls];
      const base = pal[seed % pal.length];
      // légère variation par face : les facettes restent visibles comme dans un rendu low-poly
      const f = 0.94 + (((seed * 9301 + 49297) % 233280) / 233280) * 0.12;
      return [base[0] * f, base[1] * f, base[2] * f];
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
