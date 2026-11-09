/**
 * Apparences des coureurs IA : des « équipes » fictives (couleurs, motif de maillot, vélo),
 * et une part de hasard (teint, cheveux, taille) pour que le peloton ne soit pas uniforme.
 */
import { defaultAppearance, HAIR_COLORS, SKIN_TONES, type Appearance, type RiderLook } from '../../render/look';
import type { FrameId, WheelId } from '../../physics/equipment';

interface Team {
  name: string;
  jersey: [string, string, string];
  pattern: Appearance['pattern'];
  shorts: string;
  frame: FrameId;
  frameColor: string;
  frameColor2: string;
  wheels: WheelId;
  helmet: string;
}

/** Équipes imaginaires (aucune vraie marque). */
export const TEAMS: Team[] = [
  { name: 'Azur Vélo', jersey: ['#1d4ed8', '#ffffff', '#facc15'], pattern: 'chest', shorts: '#0b1b3f', frame: 'aero', frameColor: '#0f172a', frameColor2: '#38bdf8', wheels: 'c55', helmet: '#ffffff' },
  { name: 'Rouge Cerise', jersey: ['#dc2626', '#111111', '#ffffff'], pattern: 'diagonal', shorts: '#111111', frame: 'climb', frameColor: '#b91c1c', frameColor2: '#ffffff', wheels: 'c40', helmet: '#111111' },
  { name: 'Vert Prairie', jersey: ['#16a34a', '#bbf7d0', '#052e16'], pattern: 'hoops', shorts: '#052e16', frame: 'climb', frameColor: '#e5e7eb', frameColor2: '#16a34a', wheels: 'c40', helmet: '#16a34a' },
  { name: 'Soleil Couchant', jersey: ['#f97316', '#fde047', '#7c2d12'], pattern: 'gradient', shorts: '#1c1917', frame: 'aero', frameColor: '#f97316', frameColor2: '#1c1917', wheels: 'c88', helmet: '#fde047' },
  { name: 'Nuit Blanche', jersey: ['#111827', '#e5e7eb', '#a855f7'], pattern: 'shoulders', shorts: '#111827', frame: 'aero', frameColor: '#111827', frameColor2: '#a855f7', wheels: 'c55', helmet: '#e5e7eb' },
  { name: 'Grimpeurs Réunis', jersey: ['#ffffff', '#dc2626', '#dc2626'], pattern: 'polka', shorts: '#111111', frame: 'climb', frameColor: '#f5f5f5', frameColor2: '#dc2626', wheels: 'c40', helmet: '#dc2626' },
  { name: 'Lagon', jersey: ['#06b6d4', '#0e7490', '#ecfeff'], pattern: 'checker', shorts: '#083344', frame: 'climb', frameColor: '#0e7490', frameColor2: '#ecfeff', wheels: 'c55', helmet: '#06b6d4' },
  { name: 'Ardoise', jersey: ['#475569', '#f59e0b', '#f8fafc'], pattern: 'solid', shorts: '#1e293b', frame: 'gravel', frameColor: '#334155', frameColor2: '#f59e0b', wheels: 'c40', helmet: '#f59e0b' },
];

export const FIRST_NAMES = ['Léo', 'Hugo', 'Emma', 'Lucas', 'Chloé', 'Nathan', 'Inès', 'Théo', 'Manon', 'Louis', 'Jade', 'Arthur', 'Lina', 'Jules', 'Camille', 'Romain', 'Sarah', 'Maxime', 'Julie', 'Antoine'];

function rand(seed: number): () => number {
  let x = (seed * 2654435761) >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Apparence complète d'un coureur IA, stable pour une graine donnée. */
export function aiLook(seed: number, style: RiderLook['style']): { look: RiderLook; name: string; team: string } {
  const r = rand(seed + 1);
  const team = TEAMS[Math.floor(r() * TEAMS.length)];
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const hair = pick(['short', 'short', 'short', 'long', 'ponytail', 'bald'] as const);
  const look: RiderLook = {
    ...defaultAppearance(team.frame),
    style,
    skin: pick(SKIN_TONES),
    hair,
    hairColor: pick(HAIR_COLORS),
    beard: pick(['none', 'none', 'none', 'stubble', 'full'] as const),
    pattern: team.pattern,
    jerseyColor3: team.jersey[2],
    shortsColor: team.shorts,
    helmetType: pick(['road', 'road', 'aero'] as const),
    glasses: r() > 0.2,
    lens: pick(['dark', 'blue', 'red', 'orange'] as const),
    sockHeight: pick(['mid', 'high'] as const),
    frameColor: team.frameColor,
    frameColor2: team.frameColor2,
    bottles: pick([1, 2] as const),
    computer: true,
    towel: false,
    heightCm: 165 + Math.round(r() * 25),
    weightKg: 58 + Math.round(r() * 22),
    frame: team.frame,
    wheels: team.wheels,
    jerseyColor: team.jersey[0],
    jerseyColor2: team.jersey[1],
    helmetColor: team.helmet,
    overshoes: false,
  };
  return { look, name: pick(FIRST_NAMES), team: team.name };
}
