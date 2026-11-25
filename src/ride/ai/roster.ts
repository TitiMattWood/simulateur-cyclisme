/**
 * Liste des coureurs d'une course (le « roster ») : qui court, pour quelle équipe, avec quelle
 * FTP. Ces fiches sont stables : dans un tour à étapes, on retrouve les mêmes coureurs d'une
 * étape à l'autre, avec leur fatigue.
 *
 * Niveau des adversaires (FTP en % de celle du joueur) :
 *  - Facile   : de 70 à 90 %
 *  - Égalité  : de 90 à 110 %
 *  - Costaud  : de 100 à 120 %
 * Les FTP sont réparties régulièrement sur la plage (tirage « stratifié ») : il y a toujours
 * des coureurs un peu plus faibles et d'autres un peu plus forts, jamais tous identiques.
 */
import { TEAMS, teamById, type RiderKind } from '../../data/teams';

export type Difficulty = 'easy' | 'equal' | 'strong';

export const DIFFICULTY_RANGE: Record<Difficulty, [number, number]> = {
  easy: [0.7, 0.9],
  equal: [0.9, 1.1],
  strong: [1.0, 1.2],
};

export interface RiderRecord {
  id: string;
  firstName: string;
  lastName: string;
  teamId: string;
  kind: RiderKind;
  /** FTP tirée selon la difficulté (W) */
  baseFtp: number;
  /** séquelles des étapes précédentes, de 0 (frais) à 0,15 (très entamé) */
  fatigue: number;
  /** coéquipier du joueur */
  isTeammate: boolean;
  /** graine de l'apparence (teint, cheveux, taille) */
  lookSeed: number;
}

/** Générateur pseudo-aléatoire stable. */
export function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** n FTP réparties sur la plage de la difficulté (une par « tranche », dans un ordre mélangé). */
export function difficultyFtps(n: number, d: Difficulty, playerFtp: number, rnd: () => number): number[] {
  const [lo, hi] = DIFFICULTY_RANGE[d];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.15 + 0.7 * rnd()) / n;
    out.push(Math.round(playerFtp * (lo + (hi - lo) * u)));
  }
  return shuffle(out, rnd);
}

export interface RosterOptions {
  seed: number;
  /** nombre d'adversaires */
  opponents: number;
  difficulty: Difficulty;
  playerFtp: number;
  /** équipe du joueur ('' = maillot personnalisé, sans équipe) */
  playerTeam: string;
  /** nombre de coéquipiers (seulement si le joueur a une équipe) */
  teammates?: number;
}

/** Nom affiché court : « L. Garnier ». */
export function shortName(r: Pick<RiderRecord, 'firstName' | 'lastName'>): string {
  return `${r.firstName[0]}. ${r.lastName}`;
}

export function fullName(r: Pick<RiderRecord, 'firstName' | 'lastName'>): string {
  return `${r.firstName} ${r.lastName}`;
}

export function buildRoster(o: RosterOptions): RiderRecord[] {
  const rnd = rng(o.seed);
  const mates = teamById(o.playerTeam) ? Math.max(0, Math.min(3, o.teammates ?? 0)) : 0;
  const ftps = difficultyFtps(o.opponents + mates, o.difficulty, o.playerFtp, rnd);
  const out: RiderRecord[] = [];
  const record = (teamId: string, idx: number, isTeammate: boolean): RiderRecord => {
    const tr = teamById(teamId)!.riders[idx];
    return {
      id: `${teamId}-${idx}`, firstName: tr.first, lastName: tr.last, teamId, kind: tr.kind,
      baseFtp: ftps[out.length], fatigue: 0, isTeammate, lookSeed: Math.floor(rnd() * 1e6),
    };
  };
  // coéquipiers : dans l'effectif de l'équipe du joueur
  if (mates) {
    const idx = shuffle(TEAMS.find((t) => t.id === o.playerTeam)!.riders.map((_, i) => i), rnd);
    for (let i = 0; i < mates; i++) out.push(record(o.playerTeam, idx[i], true));
  }
  // adversaires : on pioche à tour de rôle dans les autres équipes, pour un peloton varié
  const teams = shuffle(TEAMS.filter((t) => t.id !== o.playerTeam), rnd);
  const picks = teams.map((t) => shuffle(t.riders.map((_, i) => i), rnd));
  for (let i = 0; i < o.opponents; i++) {
    const k = i % teams.length;
    const idx = picks[k][Math.floor(i / teams.length) % picks[k].length];
    out.push(record(teams[k].id, idx, false));
  }
  return out;
}
