/**
 * Réglages d'une sortie choisis sur l'accueil : mode (libre, groupe, course), réglages du
 * groupe ou de la course, et vent (pour l'aspiration et la bordure).
 */
export type RideMode = 'free' | 'group' | 'race';
export type WindStrength = 'none' | 'light' | 'strong';
/** direction du vent par rapport à la route au départ */
export type WindDir = 'head' | 'cross' | 'tail';
import type { Difficulty } from './ai/roster';

export interface RideSetup {
  mode: RideMode;
  /** nombre de coureurs IA (1 à 10) */
  riders: number;
  /** allure du groupe en fraction de la FTP du joueur (0,5 à 0,9) */
  pace: number;
  /** le groupe ralentit pour reprendre le joueur s'il décroche */
  wait: boolean;
  /** les coureurs se relaient en tête */
  relay: boolean;
  /** niveau des adversaires en course : facile 70–90 %, égalité 90–110 %, costaud 100–120 % de la FTP du joueur */
  difficulty: Difficulty;
  /** longueur de la course en trajet libre (km) ; sur un parcours GPX, la course va jusqu'au bout */
  raceKm: number;
  wind: WindStrength;
  windDir: WindDir;
  /** sortie en groupe : sprints aux pancartes d'entrée de ville */
  signSprints: boolean;
}

export function defaultSetup(): RideSetup {
  return { mode: 'free', riders: 6, pace: 0.65, wait: true, relay: true, difficulty: 'equal', raceKm: 20, wind: 'none', windDir: 'cross', signSprints: true };
}

/** Vitesse du vent (m/s) selon la force choisie. */
export const WIND_SPEED: Record<WindStrength, number> = { none: 0, light: 3, strong: 6 };
