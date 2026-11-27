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
export type WheelId =
  | 'alu' | 'alu30' | 'c30' | 'c40' | 'c45' | 'c50' | 'c55' | 'c88'
  | 'clim45' | 'mono60' | 'saw58' | 'pro55' | 'pro65' | 'arc62'
  | 'tt80d' | 'tt100d'
  | 'g54' | 'g30' | 'g25';
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

/** Famille de roues : route, contre-la-montre (roue lenticulaire), gravel (jante large). */
export type WheelKind = 'road' | 'tt' | 'gravel';

export interface Wheelset {
  id: WheelId;
  kind: WheelKind;
  /** différence de masse par rapport aux roues alu de référence (1,9 kg la paire) (kg) */
  massDelta: number;
  /** gain de CdA sur un vélo route en pneus de 28 mm (m², négatif = plus aérodynamique) */
  cdaDelta: number;
  /** hauteur de jante avant en mm (pour l'affichage 3D) */
  rimDepth: number;
  /** hauteur de jante arrière si différente (mm) */
  rimDepthRear?: number;
  /** roue arrière pleine (lenticulaire) */
  rearDisc?: boolean;
  /** largeur interne de la jante (mm) : décide quel pneu « épouse » bien la jante */
  innerWidth: number;
  /** masse de la paire (g), pour l'affichage */
  grams: number;
}

/** Masse de la paire de roues alu de référence (g). */
const REF_GRAMS = 1900;
const wheel = (w: Omit<Wheelset, 'massDelta'>): Wheelset => ({ ...w, massDelta: (w.grams - REF_GRAMS) / 1000 });

/**
 * Catalogue des roues. Les roues génériques (alu, cXX) sont des moyennes du marché ; les
 * suivantes reprennent les caractéristiques publiées de modèles du commerce (poids
 * constructeur, hauteur et largeur de jante). Les noms affichés dans le jeu sont génériques.
 *
 * Gains aérodynamiques : ordres de grandeur des essais en soufflerie publiés (une paire de
 * 50–60 mm fait gagner ~5–7 W à 40 km/h par rapport à une jante basse, une lenticulaire
 * arrière ~5–8 W de plus qu'une roue à rayons de 60 mm). Plausibles, pas exacts au watt près.
 */
export const WHEELS: Record<WheelId, Wheelset> = {
  alu: wheel({ id: 'alu', kind: 'road', grams: 1900, cdaDelta: 0, rimDepth: 22, innerWidth: 19 }),
  // aluminium 30 mm : un peu plus aéro que la jante basse, mais plus lourde
  alu30: wheel({ id: 'alu30', kind: 'road', grams: 2050, cdaDelta: -0.0015, rimDepth: 30, innerWidth: 19 }),
  c30: wheel({ id: 'c30', kind: 'road', grams: 1400, cdaDelta: -0.0025, rimDepth: 30, innerWidth: 21 }),
  c40: wheel({ id: 'c40', kind: 'road', grams: 1450, cdaDelta: -0.004, rimDepth: 40, innerWidth: 21 }),
  c45: wheel({ id: 'c45', kind: 'road', grams: 1480, cdaDelta: -0.0048, rimDepth: 45, innerWidth: 21 }),
  c50: wheel({ id: 'c50', kind: 'road', grams: 1540, cdaDelta: -0.0056, rimDepth: 50, innerWidth: 21 }),
  c55: wheel({ id: 'c55', kind: 'road', grams: 1600, cdaDelta: -0.0065, rimDepth: 55, innerWidth: 21 }),
  c88: wheel({ id: 'c88', kind: 'road', grams: 1950, cdaDelta: -0.009, rimDepth: 88, innerWidth: 21 }),

  // --- route (modèles de référence entre parenthèses)
  // grimpeur 45 mm, jante large sans crochet, la plus légère (Zipp 353 NSW : 1 255 g, 45 mm, 25 mm int.)
  clim45: wheel({ id: 'clim45', kind: 'road', grams: 1255, cdaDelta: -0.0047, rimDepth: 45, innerWidth: 25 }),
  // monobloc carbone (jante, rayons et moyeu d'un seul tenant) (Syncros Capital SL Aero 60 : 590 + 700 g, 23 mm int.)
  mono60: wheel({ id: 'mono60', kind: 'road', grams: 1290, cdaDelta: -0.0068, rimDepth: 60, innerWidth: 23 }),
  // jante « en dents de scie », stable par vent de travers (Zipp 454 NSW : 1 358 g, 53/58 mm, 23 mm int.)
  saw58: wheel({ id: 'saw58', kind: 'road', grams: 1358, cdaDelta: -0.0068, rimDepth: 53, rimDepthRear: 58, innerWidth: 23 }),
  // polyvalente, profils différenciés avant/arrière (ENVE SES 4.5 PRO : 1 295 g, 49/55 mm, 23,5 mm int.)
  pro55: wheel({ id: 'pro55', kind: 'road', grams: 1295, cdaDelta: -0.0063, rimDepth: 49, rimDepthRear: 55, innerWidth: 23.5 }),
  // aéro de course, à la limite de hauteur UCI (65 mm) (ENVE SES 6.7 PRO : 1 495 g, 59/65 mm, 22,5 mm int.)
  pro65: wheel({ id: 'pro65', kind: 'road', grams: 1495, cdaDelta: -0.0075, rimDepth: 59, rimDepthRear: 65, innerWidth: 22.5 }),
  // aéro ancienne génération, jante étroite pensée pour des pneus de 23–25 mm (DT Swiss ARC 1400 DICUT : 1 583 g)
  arc62: wheel({ id: 'arc62', kind: 'road', grams: 1583, cdaDelta: -0.0064, rimDepth: 62, innerWidth: 17 }),

  // --- contre-la-montre : roue avant très haute + lenticulaire arrière
  // (Syncros Capital SL Aero 80 avant 630 g + Capital SL lenticulaire 975 g)
  tt80d: wheel({ id: 'tt80d', kind: 'tt', grams: 1605, cdaDelta: -0.0115, rimDepth: 80, rearDisc: true, innerWidth: 23 }),
  // (ENVE SES 100 PRO avant 815 g + lenticulaire 975 g)
  tt100d: wheel({ id: 'tt100d', kind: 'tt', grams: 1790, cdaDelta: -0.0125, rimDepth: 100, rearDisc: true, innerWidth: 23 }),

  // --- gravel : jantes larges pour pneus de 40 mm
  // aéro gravel très large (Zipp 303 XPLR SW : 1 496 g, 54 mm, 32 mm int.)
  g54: wheel({ id: 'g54', kind: 'gravel', grams: 1496, cdaDelta: -0.0052, rimDepth: 54, innerWidth: 32 }),
  // carbone léger 30 mm (DT Swiss GRC 1100 DICUT : 1 298 g, 24 mm int.)
  g30: wheel({ id: 'g30', kind: 'gravel', grams: 1298, cdaDelta: -0.0026, rimDepth: 30, innerWidth: 24 }),
  // aluminium robuste (DT Swiss GR 1600 SPLINE : 1 659 g, 25 mm, 24 mm int.)
  g25: wheel({ id: 'g25', kind: 'gravel', grams: 1659, cdaDelta: -0.0006, rimDepth: 25, innerWidth: 24 }),
};

/** Ordre d'affichage des roues dans le profil. */
export const WHEEL_ORDER: WheelId[] = [
  'alu', 'alu30', 'c30', 'c40', 'c45', 'c50', 'c55', 'c88',
  'clim45', 'pro55', 'saw58', 'mono60', 'pro65', 'arc62',
  'tt80d', 'tt100d', 'g25', 'g30', 'g54',
];

/** Les roues sont-elles montables sur ce cadre ? */
export function wheelAllowed(frame: FrameId, id: WheelId): boolean {
  const w = WHEELS[id];
  // VTT : roues de 29 pouces, seules les roues alu génériques sont proposées
  if (frame === 'mtb') return id === 'alu' || id === 'alu30';
  // lenticulaire : réservée au vélo de contre-la-montre (interdite en course en ligne)
  if (w.kind === 'tt') return frame === 'tt';
  return true;
}

/** Roues par défaut quand le choix actuel ne convient pas au cadre. */
export function defaultWheelFor(frame: FrameId): WheelId {
  return frame === 'mtb' ? 'alu' : frame === 'gravel' ? 'g30' : frame === 'tt' ? 'tt80d' : 'c40';
}

/** Effet d'une paire de roues sur un cadre donné (les « gains marginaux » de l'association). */
export interface WheelEffect {
  cdaDelta: number;
  massDelta: number;
  /** multiplicateur du Crr par revêtement */
  roll: Record<SurfaceId, number>;
  /** explications (clés de traduction) de ce qui joue dans l'association */
  notes: WheelNote[];
}

export type WheelNote =
  | 'integration' | 'tt-disc' | 'rim-too-wide' | 'rim-too-narrow'
  | 'gravel-tyre-on-road-rim' | 'gravel-wide-rim' | 'not-allowed';

/**
 * Gains marginaux d'une association cadre + roues :
 *  - pneu et jante doivent « s'épouser » (règle des 105 % : jante au moins aussi large que
 *    le pneu gonflé). Un pneu de 28 mm sur une jante de 17 mm forme une ampoule qui casse
 *    l'écoulement ; sur une jante gravel de 32 mm, il est plus étroit que la jante ;
 *  - un pneu gravel de 40 mm sur une jante route ruine presque tout le gain aéro, et roule
 *    moins bien hors bitume (pression plus haute nécessaire) ;
 *  - un cadre aéro ou CLM est dessiné avec des jantes hautes : l'ensemble gagne un peu plus
 *    que la somme des deux ;
 *  - une jante gravel large permet de baisser la pression : meilleur rendement sur les chemins.
 */
export function wheelEffect(frame: FrameId, id: WheelId): WheelEffect {
  const w = WHEELS[id];
  const notes: WheelNote[] = [];
  let aero = 1, cdaExtra = 0;
  const roll: Record<SurfaceId, number> = { asphalt: 1, rough: 1, gravel: 1, dirt: 1 };
  if (!wheelAllowed(frame, id)) notes.push('not-allowed');
  if (frame === 'gravel' || frame === 'mtb') {
    if (w.kind !== 'gravel' && w.innerWidth < 30) {
      // les jantes route récentes (23 mm int.) acceptent un 40 mm, mais le pneu déborde
      // largement : l'essentiel du gain aéro disparaît ; sur une jante étroite, il roule mal aussi
      aero = w.innerWidth >= 23 ? 0.7 : 0.55;
      if (w.innerWidth < 23) roll.gravel = roll.dirt = 1.05;
      notes.push('gravel-tyre-on-road-rim');
    } else if (w.innerWidth >= 30) {
      roll.gravel = roll.dirt = 0.93;
      roll.rough = 0.97;
      notes.push('gravel-wide-rim');
    } else if (w.kind === 'gravel') {
      roll.gravel = roll.dirt = 0.97;
    }
  } else {
    if (w.innerWidth >= 30) { aero = 0.8; notes.push('rim-too-wide'); }
    else if (w.innerWidth <= 17) { aero = 0.9; notes.push('rim-too-narrow'); }
    const deep = Math.max(w.rimDepth, w.rimDepthRear ?? 0) >= 50;
    if ((frame === 'aero' || frame === 'tt') && deep) { cdaExtra -= 0.0008; notes.push('integration'); }
    if (frame === 'tt' && w.rearDisc) { cdaExtra -= 0.001; notes.push('tt-disc'); }
  }
  return { cdaDelta: w.cdaDelta * aero + cdaExtra, massDelta: w.massDelta, roll, notes };
}

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
