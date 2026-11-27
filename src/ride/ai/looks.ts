/**
 * Apparences des coureurs IA : la tenue et le vélo viennent de leur équipe (src/data/teams.ts),
 * et une part de hasard (teint, cheveux, taille) évite un peloton de clones.
 */
import { defaultAppearance, HAIR_COLORS, SKIN_TONES, type RiderLook } from '../../render/look';
import { TEAMS, type Team } from '../../data/teams';

function rand(seed: number): () => number {
  let x = (seed * 2654435761) >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Apparence complète d'un coureur IA, stable pour une graine donnée.
 * Sans équipe précisée, l'équipe est tirée au hasard (aperçus).
 */
export function aiLook(seed: number, style: RiderLook['style'], team?: Team): { look: RiderLook; team: Team } {
  const r = rand(seed + 1);
  const tm = team ?? TEAMS[Math.floor(r() * TEAMS.length)];
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const hair = pick(['short', 'short', 'short', 'long', 'ponytail', 'bald'] as const);
  const look: RiderLook = {
    ...defaultAppearance(tm.frame),
    style,
    skin: pick(SKIN_TONES),
    hair,
    hairColor: pick(HAIR_COLORS),
    beard: pick(['none', 'none', 'none', 'stubble', 'full'] as const),
    pattern: tm.pattern,
    jerseyColor3: tm.jersey[2],
    shortsColor: tm.shorts,
    helmetType: pick(['road', 'road', 'aero'] as const),
    glasses: r() > 0.2,
    lens: pick(['dark', 'blue', 'red', 'orange'] as const),
    sockHeight: pick(['mid', 'high'] as const),
    frameColor: tm.frameColor,
    frameColor2: tm.frameColor2,
    bottles: pick([1, 2] as const),
    computer: true,
    towel: false,
    heightCm: 165 + Math.round(r() * 25),
    weightKg: 58 + Math.round(r() * 22),
    frame: tm.frame,
    wheels: tm.wheels,
    jerseyColor: tm.jersey[0],
    jerseyColor2: tm.jersey[1],
    helmetColor: tm.helmet,
    overshoes: false,
  };
  return { look, team: tm };
}
