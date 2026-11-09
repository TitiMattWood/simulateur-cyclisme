/**
 * « Sprint pancarte » (sortie en groupe) : à l'approche du panneau d'entrée d'une ville ou
 * d'un village, le groupe se dispute la pancarte. Le premier à la passer gagne.
 *
 * Le panneau est placé là où la route entre en agglomération : la BD TOPO indique, tronçon par
 * tronçon, si la route est « en agglomération » (c'est-à-dire entre les panneaux d'entrée et de
 * sortie). On cherche donc, devant le cycliste, le passage campagne → agglomération.
 * Le nom de la commune vient du géocodage inverse de l'IGN.
 */
import type { Track } from '../geo/track';
import type { RoadNetwork } from '../world/roads';

export type SignState = 'ahead' | 'sprint' | 'done';

export interface TownSign {
  /** distance (m) du panneau le long du parcours */
  dist: number;
  name: string;
  state: SignState;
  /** vainqueur (nom) une fois le panneau passé */
  winner: string | null;
  playerWon: boolean;
}

/** Distance (m) à laquelle le sprint est annoncé et lancé. */
export const SPRINT_DISTANCE = 300;
/** XP gagnés par sprint remporté. */
export const SPRINT_XP = 30;

/**
 * Cherche la prochaine entrée d'agglomération entre from et to (m le long du parcours).
 * isUrban(d) : la route est-elle en agglomération à la distance d ? (null = inconnu)
 * Il faut au moins `rural` mètres de campagne avant le panneau, et 2 relevés urbains après.
 */
export function findTownEntry(isUrban: (d: number) => boolean | null, from: number, to: number, step = 20, rural = 250): number | null {
  let ruralRun = 0;
  for (let d = from; d <= to; d += step) {
    const u = isUrban(d);
    if (u === null) { ruralRun = 0; continue; }
    if (!u) { ruralRun += step; continue; }
    if (ruralRun >= rural && isUrban(d + step) === true) return d;
    ruralRun = 0;
  }
  return null;
}

/** Nom de la commune à un point (géocodage inverse IGN), ou null. */
export async function townName(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://data.geopf.fr/geocodage/reverse?${new URLSearchParams({ lon: String(lon), lat: String(lat), index: 'address', limit: '1' })}`;
    const json = (await (await fetch(url)).json()) as { features?: Array<{ properties: { city?: string } }> };
    return json.features?.[0]?.properties.city ?? null;
  } catch {
    return null;
  }
}

export class SignSprints {
  readonly signs: TownSign[] = [];
  private scanT = 0;
  private searching = false;
  /** jusqu'où on a déjà cherché (m) */
  private scannedTo = 0;

  constructor(private readonly track: Track, private readonly net: RoadNetwork) {}

  /** Est-ce en agglomération à la distance d du parcours ? */
  private urbanAt(d: number): boolean | null {
    const s = this.track.sampleAt(d);
    const hit = this.net.nearest(s.x, s.z, 12);
    return hit ? hit.edge.urban : null;
  }

  /** Oublie les panneaux pas encore annoncés (changement de direction au carrefour). */
  forgetAhead(dist: number): void {
    for (let i = this.signs.length - 1; i >= 0; i--) if (this.signs[i].state === 'ahead' && this.signs[i].dist > dist) this.signs.splice(i, 1);
    this.scannedTo = dist;
  }

  /** Prochain panneau pas encore passé. */
  next(dist: number): TownSign | null {
    return this.signs.find((s) => s.state !== 'done' && s.dist > dist - 30) ?? null;
  }

  /** Recherche périodique de la prochaine entrée de ville, jusqu'à 900 m devant. */
  update(dt: number, dist: number): void {
    this.scanT += dt;
    if (this.scanT < 1.5 || this.searching) return;
    this.scanT = 0;
    if (this.next(dist)) return;
    const from = Math.max(dist + SPRINT_DISTANCE + 20, this.scannedTo - 260);
    const to = this.track.open ? dist + 900 : Math.min(this.track.length - 50, dist + 900);
    if (to <= from) return;
    const d = findTownEntry((x) => this.urbanAt(x), from - 260, to);
    this.scannedTo = to;
    if (d === null || d < dist + SPRINT_DISTANCE + 20) return;
    this.searching = true;
    const s = this.track.sampleAt(d);
    townName(s.lat, s.lon).then((name) => {
      this.searching = false;
      if (name) this.signs.push({ dist: d, name, state: 'ahead', winner: null, playerWon: false });
    });
  }
}
