/**
 * Réglages globaux de l'application.
 * Le nom est provisoire : il suffit de le changer ici quand tu auras choisi.
 */
export const APP_NAME = 'Simulateur Cyclisme';
export const APP_VERSION = '0.1.0';

/** Points d'accès de la Géoplateforme IGN (données ouvertes, Licence Ouverte Etalab 2.0). */
export const IGN = {
  /** Altitude ponctuelle (RGE ALTI 1 m). */
  alti: 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json',
  altiResource: 'ign_rge_alti_wld',
  /** Service WMS « raster » : grilles d'altitude (BIL 32 bits) et orthophotos. */
  wmsR: 'https://data.geopf.fr/wms-r',
  demLayer: 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES',
  orthoLayer: 'ORTHOIMAGERY.ORTHOPHOTOS',
  /** Service WFS : BD TOPO (bâtiments avec hauteur, routes, végétation, eau, voies ferrées). */
  wfs: 'https://data.geopf.fr/wfs/ows',
} as const;

/** Physique : constantes universelles. */
export const G = 9.80665;

/** Préréglages graphiques : rayon de chargement, finesse du terrain, nombre d'arbres. */
export interface QualityPreset {
  /** Côté d'une tuile « proche » en mètres (terrain détaillé + bâtiments). */
  nearTile: number;
  /** Nombre de mailles par côté pour une tuile proche. */
  nearRes: number;
  /** Rayon (m) dans lequel les tuiles proches sont chargées. */
  nearRadius: number;
  /** Côté d'une tuile « lointaine » (relief simplifié pour l'horizon). */
  farTile: number;
  farRes: number;
  farRadius: number;
  /** Nombre maximal d'arbres par tuile proche. */
  maxTrees: number;
  /** Résolution des orthophotos utilisées pour colorer le sol (pixels par côté). */
  orthoPx: number;
  pixelRatio: number;
  antialias: boolean;
}

export const QUALITY: Record<'low' | 'medium' | 'high', QualityPreset> = {
  low: { nearTile: 800, nearRes: 48, nearRadius: 1100, farTile: 6400, farRes: 40, farRadius: 9000, maxTrees: 900, orthoPx: 48, pixelRatio: 1, antialias: false },
  medium: { nearTile: 800, nearRes: 64, nearRadius: 1500, farTile: 6400, farRes: 56, farRadius: 16000, maxTrees: 1800, orthoPx: 64, pixelRatio: 1.25, antialias: true },
  high: { nearTile: 800, nearRes: 80, nearRadius: 1900, farTile: 6400, farRes: 72, farRadius: 24000, maxTrees: 3200, orthoPx: 96, pixelRatio: 2, antialias: true },
};
export type QualityLevel = keyof typeof QUALITY;
