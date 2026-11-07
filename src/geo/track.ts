/**
 * Ce que le jeu attend d'un « tracé » : un parcours GPX (Route) ou le chemin du
 * trajet libre (OpenPath), qui s'allonge au fil des carrefours.
 */
import type { LocalProjection } from './projection';
import type { RouteSample } from './route';

export interface Track {
  readonly name: string;
  readonly proj: LocalProjection;
  /** longueur totale (Infinity en trajet libre) */
  readonly length: number;
  /** vrai en trajet libre */
  readonly open: boolean;
  sampleAt(d: number, out?: RouteSample): RouteSample;
}
