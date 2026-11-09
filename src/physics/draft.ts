/**
 * Aspiration (abri derrière d'autres coureurs).
 *
 * Ordres de grandeur issus des mesures en soufflerie et sur piste (Blocken et al., 2013–2018) :
 *  - dans la roue, à ~0,5 m : environ −35 % de résistance de l'air ;
 *  - à 2 m : environ −20 % ; à 5 m : quelques % seulement ;
 *  - au cœur d'un groupe, l'abri se cumule (jusqu'à −45 / −50 % au fond d'un peloton) ;
 *  - le coureur de tête gagne lui aussi un peu (~3 %) quand quelqu'un roule dans sa roue.
 *
 * Par vent de travers, l'abri ne se trouve plus pile derrière : il se décale en diagonale
 * du côté opposé au vent. C'est la « bordure ».
 */

/** Un coureur voisin, vu depuis celui dont on calcule l'abri. */
export interface Neighbour {
  /** distance longitudinale (m) : > 0 = le voisin est devant */
  dx: number;
  /** écart latéral (m) : > 0 = le voisin est à gauche */
  dy: number;
}

/** Part du vent apparent dont le sillage dérive sur le côté. */
export const WAKE_DRIFT = 0.35;

/** Gain maximal (fraction) cumulé dans un groupe. */
export const MAX_DRAFT = 0.48;

/**
 * Coefficient multiplicateur de la résistance de l'air (1 = aucun abri, 0,65 = −35 %).
 * crossYaw : angle (rad) du vent apparent par rapport à l'axe de la route,
 * positif si le vent vient de la gauche : l'abri se décale vers la droite, c'est-à-dire que le
 * coureur de devant doit se trouver à notre gauche (dy > 0).
 */
export function draftFactor(neighbours: Neighbour[], crossYaw = 0): number {
  let shelter = 1; // produit des parts d'air « restantes »
  let leadBonus = 0;
  const tanYaw = Math.tan(Math.max(-1.2, Math.min(1.2, crossYaw)));
  for (const n of neighbours) {
    if (n.dx > 0.25 && n.dx < 9) {
      // abri longitudinal : décroissance exponentielle avec la distance
      const along = 0.36 * Math.exp(-(n.dx - 0.4) / 2.0);
      // abri latéral : gaussienne centrée sur la diagonale d'abri, plus large quand on s'éloigne
      // le sillage dérive moins vite que le vent apparent (≈ 35 % de la tangente)
      // vent de gauche : on s'abrite à droite du coureur de devant, qui est donc à notre
      // gauche (dy > 0), d'autant plus qu'on est loin derrière lui
      const center = n.dx * tanYaw * WAKE_DRIFT;
      const width = 0.32 + 0.07 * n.dx;
      const lateral = Math.exp(-((n.dy - center) ** 2) / (2 * width * width));
      shelter *= 1 - along * lateral;
    } else if (n.dx < -0.25 && n.dx > -1.5 && Math.abs(n.dy) < 0.5) {
      // quelqu'un dans ma roue : il me « pousse » un peu (moins de dépression derrière moi)
      leadBonus = Math.max(leadBonus, 0.03);
    }
  }
  const gain = Math.min(MAX_DRAFT, 1 - shelter + leadBonus);
  return 1 - gain;
}

/** Angle du vent apparent par rapport à la route (rad), pour un coureur à la vitesse v. */
export function apparentYaw(v: number, headwind: number, crosswind: number): number {
  const along = Math.max(0.5, v + headwind);
  return Math.atan2(crosswind, along);
}
