/**
 * Indicateurs d'entraînement calculés à partir des échantillons à 1 Hz.
 */

/**
 * Puissance normalisée (NP) : moyenne glissante sur 30 s, élevée à la puissance 4,
 * moyennée, puis racine 4e. Elle reflète mieux le coût physiologique d'un effort
 * irrégulier que la puissance moyenne.
 */
export function normalizedPower(power: number[]): number {
  if (power.length < 30) return power.length ? power.reduce((a, b) => a + b, 0) / power.length : 0;
  let sum = 0;
  for (let i = 0; i < 30; i++) sum += power[i];
  let acc = Math.pow(sum / 30, 4);
  let count = 1;
  for (let i = 30; i < power.length; i++) {
    sum += power[i] - power[i - 30];
    acc += Math.pow(sum / 30, 4);
    count++;
  }
  return Math.pow(acc / count, 0.25);
}

/** Facteur d'intensité (IF) et Training Stress Score (TSS, 100 = 1 h à la FTP). */
export function trainingLoad(durationS: number, np: number, ftp: number): { if: number; tss: number } {
  if (ftp <= 0 || durationS <= 0) return { if: 0, tss: 0 };
  const intensity = np / ftp;
  return { if: intensity, tss: ((durationS * np * intensity) / (ftp * 3600)) * 100 };
}

/**
 * Calories : le travail mécanique en kJ ≈ les kcal dépensées
 * (rendement musculaire ~24 % × 4,184 kJ/kcal ≈ 1).
 */
export function kcalFromWork(workKj: number): number {
  return workKj / (0.24 * 4.184);
}

/** Points d'expérience : distance, dénivelé et charge d'entraînement. */
export function xpFor(distanceM: number, ascentM: number, tss: number): number {
  return Math.round(distanceM / 100 + ascentM / 10 + tss * 2);
}

/** Niveau atteint pour un total d'XP (chaque niveau demande un peu plus que le précédent). */
export function levelFromXp(xp: number): { level: number; into: number; needed: number } {
  let level = 1;
  let need = 500;
  let rest = xp;
  while (rest >= need) {
    rest -= need;
    level++;
    need = Math.round(need * 1.15);
  }
  return { level, into: rest, needed: need };
}
