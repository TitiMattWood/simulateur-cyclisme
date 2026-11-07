/**
 * Vitesses virtuelles (pour un home trainer équipé d'un pignon unique, type Zwift Cog).
 *
 * Le vélo n'a plus qu'un seul braquet réel. Le jeu simule 24 braquets : à chaque
 * changement, il ajuste la résistance du trainer pour que l'effort ressenti aux pédales
 * corresponde au braquet choisi (voir trainerSim.ts).
 */

/** Circonférence de roue de référence (m), pneu 700 × 25-28 mm. */
export const WHEEL_CIRCUMFERENCE = 2.105;

/** 24 rapports (tours de roue par tour de pédale), du plus souple au plus dur, ~8,5 % d'écart. */
export const VIRTUAL_GEARS: number[] = Array.from({ length: 24 }, (_, i) => 0.72 * Math.pow(4.73 / 0.72, i / 23));

/** Rapport de départ (≈ 34 × 19, facile pour démarrer). */
export const DEFAULT_GEAR = 10;

/** Braquet réel du vélo sur le trainer (plateau / pignon). */
export function realRatio(chainring: number, cog: number): number {
  return Math.max(0.5, chainring) / Math.max(8, cog);
}

/** Combinaison plateau × pignon classique la plus proche, pour l'affichage (« ≈ 50×17 »). */
export function gearLabel(ratio: number): string {
  let best = '', err = Infinity;
  for (const ring of [34, 50]) {
    for (let cog = 11; cog <= 36; cog++) {
      const e = Math.abs(ring / cog - ratio);
      if (e < err) { err = e; best = `${ring}×${cog}`; }
    }
  }
  return `≈ ${best}`;
}

/** Cadence (tr/min) correspondant à une vitesse (m/s) dans un rapport donné. */
export function cadenceFor(speed: number, ratio: number): number {
  return (speed / (ratio * WHEEL_CIRCUMFERENCE)) * 60;
}
