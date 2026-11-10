/**
 * Matériel et revêtements : chaque choix modifie directement la physique.
 *
 *  - CdA (m²) : surface frontale × coefficient de traînée. C'est ce qui freine le plus
 *    sur le plat : à 40 km/h, ~80 % de l'effort sert à pousser l'air.
 *  - Crr : coefficient de résistance au roulement (pneu + revêtement).
 *  - Masse : pèse surtout en montée.
 *
 * Les valeurs sont des ordres de grandeur issus de mesures publiées (souffleries,
 * tests de roulement). Elles sont plausibles, pas exactes au watt près.
 */

export type FrameId = 'climb' | 'aero' | 'gravel' | 'tt' | 'mtb';
export type WheelId = 'alu' | 'alu30' | 'c30' | 'c40' | 'c45' | 'c50' | 'c55' | 'c88';
export type SurfaceId = 'asphalt' | 'rough' | 'gravel' | 'dirt';

export interface Frame {
  id: FrameId;
  /** masse du vélo complet avec des roues aluminium (kg) */
  mass: number;
  /** multiplicateur du CdA du cycliste (position plus ou moins couchée) */
  cdaFactor: number;
  /** multiplicateur du Crr selon le revêtement (pneus route fins ou crampons VTT) */
  crrFactor: Record<SurfaceId, number>;
}

export const FRAMES: Record<FrameId, Frame> = {
  climb: { id: 'climb', mass: 7.4, cdaFactor: 1.0, crrFactor: { asphalt: 1, rough: 1, gravel: 1, dirt: 1 } },
  aero: { id: 'aero', mass: 8.0, cdaFactor: 0.94, crrFactor: { asphalt: 1, rough: 1.05, gravel: 1.05, dirt: 1.05 } },
  // Gravel : pneus de 40 mm, position un peu plus relevée. Bon compromis hors bitume.
  gravel: { id: 'gravel', mass: 8.9, cdaFactor: 1.05, crrFactor: { asphalt: 1.2, rough: 1.0, gravel: 0.8, dirt: 0.8 } },
  // Contre-la-montre : position allongée sur les prolongateurs (environ −18 % de CdA), vélo plus lourd.
  tt: { id: 'tt', mass: 8.9, cdaFactor: 0.82, crrFactor: { asphalt: 1, rough: 1.05, gravel: 1.1, dirt: 1.1 } },
  // VTT : position droite, pneus à crampons. Plus lent sur route, plus à l'aise hors bitume.
  mtb: { id: 'mtb', mass: 12.5, cdaFactor: 1.22, crrFactor: { asphalt: 2.0, rough: 1.35, gravel: 0.85, dirt: 0.7 } },
};

export interface Wheelset {
  id: WheelId;
  /** différence de masse par rapport aux roues alu (kg) */
  massDelta: number;
  /** gain de CdA (m², négatif = plus aérodynamique) */
  cdaDelta: number;
  /** hauteur de jante en mm (pour l'affichage 3D) */
  rimDepth: number;
}

export const WHEELS: Record<WheelId, Wheelset> = {
  alu: { id: 'alu', massDelta: 0, cdaDelta: 0, rimDepth: 22 },
  // aluminium 30 mm : un peu plus aéro que la jante basse, mais plus lourde
  alu30: { id: 'alu30', massDelta: 0.15, cdaDelta: -0.0015, rimDepth: 30 },
  c30: { id: 'c30', massDelta: -0.5, cdaDelta: -0.0025, rimDepth: 30 },
  c40: { id: 'c40', massDelta: -0.45, cdaDelta: -0.004, rimDepth: 40 },
  c45: { id: 'c45', massDelta: -0.42, cdaDelta: -0.0048, rimDepth: 45 },
  c50: { id: 'c50', massDelta: -0.36, cdaDelta: -0.0056, rimDepth: 50 },
  c55: { id: 'c55', massDelta: -0.3, cdaDelta: -0.0065, rimDepth: 55 },
  c88: { id: 'c88', massDelta: 0.05, cdaDelta: -0.009, rimDepth: 88 },
};

/** Crr de base d'un pneu route de 28 mm sur chaque revêtement. */
export const SURFACE_CRR: Record<SurfaceId, number> = {
  asphalt: 0.0040,
  rough: 0.0065,
  gravel: 0.0095,
  dirt: 0.0130,
};

/** Équipements portés : gains marginaux de CdA (m²). */
export interface Kit {
  aeroHelmet: boolean;
  highSocks: boolean;
  overshoes: boolean;
}

export const KIT_GAINS = {
  aeroHelmet: -0.004,
  highSocks: -0.0015,
  overshoes: -0.002,
};

/**
 * CdA d'un cycliste « mains aux cocottes » estimé à partir de sa taille et de son poids
 * (surface corporelle de Bassett et al., 1999, et Cd ≈ 0,95).
 */
export function riderCdA(heightCm: number, weightKg: number): number {
  const h = heightCm / 100;
  const area = 0.0293 * Math.pow(h, 0.725) * Math.pow(weightKg, 0.425) + 0.0604;
  return 0.95 * area;
}
