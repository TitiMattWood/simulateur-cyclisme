/**
 * Transmission virtuelle (pour un home trainer équipé d'un pignon unique, type Zwift Cog).
 *
 * Le vélo n'a plus qu'un seul braquet réel sur le trainer. Le jeu simule la transmission
 * de ton choix : simple ou double plateau, cassette, taille de pneu. À chaque changement,
 * il ajuste la résistance du trainer pour que l'effort aux pédales corresponde au
 * développement virtuel (voir trainerSim.ts).
 *
 * Développement = distance parcourue par tour de pédale = (plateau / pignon) × circonférence.
 */

/** Circonférence de roue supposée par les home trainers pour calculer leur vitesse (m). */
export const TRAINER_CIRCUMFERENCE = 2.105;

export type TireId = '700x25' | '700x28' | '700x32' | '700x40' | '29x2.2';

/** Circonférences usuelles (m). */
export const TIRES: Record<TireId, number> = {
  '700x25': 2.105,
  '700x28': 2.136,
  '700x32': 2.155,
  '700x40': 2.2,
  '29x2.2': 2.3,
};

/** Plateaux proposés : deux valeurs = double plateau, une seule = monoplateau. */
export const CHAINRINGS: Record<string, number[]> = {
  '53/39': [53, 39],
  '52/36': [52, 36],
  '50/34': [50, 34],
  '48/35': [48, 35],
  '46/30': [46, 30],
  // monoplateau : de 38 à 50 dents
  ...Object.fromEntries(Array.from({ length: 13 }, (_, i) => [String(38 + i), [38 + i]])),
};

/** Cassettes proposées (dentures usuelles, du plus petit au plus grand pignon). */
export const CASSETTES: Record<string, number[]> = {
  '11-25 (11 v)': [11, 12, 13, 14, 15, 16, 17, 19, 21, 23, 25],
  '11-28 (11 v)': [11, 12, 13, 14, 15, 17, 19, 21, 23, 25, 28],
  '11-30 (12 v)': [11, 12, 13, 14, 15, 16, 17, 19, 21, 24, 27, 30],
  '11-32 (11 v)': [11, 12, 13, 14, 16, 18, 20, 22, 25, 28, 32],
  '11-34 (12 v)': [11, 12, 13, 14, 15, 17, 19, 21, 24, 27, 30, 34],
  '10-33 (12 v)': [10, 11, 12, 13, 14, 15, 17, 19, 21, 24, 28, 33],
  '10-36 (12 v)': [10, 11, 12, 13, 15, 17, 19, 21, 24, 28, 32, 36],
  '10-44 (12 v)': [10, 11, 13, 15, 17, 19, 21, 24, 28, 32, 38, 44],
  '10-52 (12 v)': [10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 52],
};

export interface Drivetrain {
  chainrings: string;
  cassette: string;
  tire: TireId;
  /**
   * Double plateau seulement : vrai = deux boutons suffisent, le jeu passe tout seul
   * d'un plateau à l'autre au bon moment ; faux = touche dédiée pour le dérailleur avant.
   */
  sequential: boolean;
}

export const DEFAULT_DRIVETRAIN: Drivetrain = { chainrings: '50/34', cassette: '11-30 (12 v)', tire: '700x28', sequential: true };

interface Combo {
  front: number;
  rear: number;
  ratio: number;
}

export class GearBox {
  readonly rings: number[];
  readonly cogs: number[];
  readonly circumference: number;
  readonly sequential: boolean;
  /** indice du plateau (0 = grand plateau) */
  front: number;
  /** indice du pignon (0 = plus petit pignon = le plus dur) */
  rear: number;
  private seq: Combo[] = [];

  constructor(dt: Drivetrain) {
    this.rings = (CHAINRINGS[dt.chainrings] ?? CHAINRINGS['50/34']).slice().sort((a, b) => b - a);
    this.cogs = (CASSETTES[dt.cassette] ?? CASSETTES['11-30 (12 v)']).slice().sort((a, b) => a - b);
    this.circumference = TIRES[dt.tire] ?? TIRES['700x28'];
    this.sequential = dt.sequential && this.rings.length > 1;
    // Mode séquentiel : tous les rapports utiles, du plus souple au plus dur, sans les
    // croisements de chaîne extrêmes ni les doublons trop proches.
    const all: Combo[] = [];
    this.rings.forEach((ring, f) => this.cogs.forEach((cog, r) => {
      const n = this.cogs.length;
      const cross = this.rings.length > 1 && ((f === 0 && r >= n - 2) || (f === this.rings.length - 1 && r <= 1));
      if (!cross) all.push({ front: f, rear: r, ratio: ring / cog });
    }));
    all.sort((a, b) => a.ratio - b.ratio);
    for (const c of all) {
      const last = this.seq[this.seq.length - 1];
      if (!last || c.ratio / last.ratio > 1.03) this.seq.push(c);
    }
    // Départ sur un rapport souple : petit plateau (ou plateau unique), pignon aux deux tiers.
    this.front = this.rings.length - 1;
    this.rear = Math.round((this.cogs.length - 1) * 0.65);
    if (this.sequential) this.snapToSequence();
  }

  get ring(): number {
    return this.rings[this.front];
  }

  get cog(): number {
    return this.cogs[this.rear];
  }

  /** rapport plateau / pignon */
  get ratio(): number {
    return this.ring / this.cog;
  }

  /** développement (m par tour de pédale) */
  get development(): number {
    return this.ratio * this.circumference;
  }

  /** +1 = plus dur, −1 = plus souple. En séquentiel, parcourt tous les rapports. */
  shift(delta: number): void {
    if (this.sequential) {
      const i = this.seqIndex();
      const c = this.seq[Math.max(0, Math.min(this.seq.length - 1, i + delta))];
      this.front = c.front;
      this.rear = c.rear;
    } else {
      this.rear = Math.max(0, Math.min(this.cogs.length - 1, this.rear - delta));
    }
  }

  /** Dérailleur avant : passe sur l'autre plateau (double plateau, mode non séquentiel). */
  shiftFront(): void {
    if (this.rings.length < 2) return;
    this.front = this.front === 0 ? this.rings.length - 1 : 0;
    if (this.sequential) this.snapToSequence();
  }

  /** Texte affiché : « 50×17 · 6,28 m », plus la position dans la séquence. */
  get label(): string {
    const dev = this.development.toFixed(2).replace('.', ',');
    const pos = this.sequential
      ? `${this.seqIndex() + 1}/${this.seq.length}`
      : `${this.rings.length > 1 ? (this.front === 0 ? 'G' : 'P') + ' · ' : ''}${this.cogs.length - this.rear}/${this.cogs.length}`;
    return `${this.ring}×${this.cog} · ${dev} m · ${pos}`;
  }

  private seqIndex(): number {
    let best = 0, err = Infinity;
    this.seq.forEach((c, i) => {
      const e = Math.abs(Math.log(c.ratio / this.ratio));
      if (e < err) { err = e; best = i; }
    });
    return best;
  }

  private snapToSequence(): void {
    const c = this.seq[this.seqIndex()];
    this.front = c.front;
    this.rear = c.rear;
  }
}

/** Braquet réel du vélo sur le trainer (plateau / pignon). */
export function realRatio(chainring: number, cog: number): number {
  return Math.max(10, chainring) / Math.max(8, cog);
}

/**
 * Rapport k entre le développement virtuel et le développement réel sur le trainer :
 * c'est lui qui pilote la conversion des paramètres SIM.
 */
export function virtualFactor(box: GearBox, chainring: number, cog: number): number {
  return box.development / (realRatio(chainring, cog) * TRAINER_CIRCUMFERENCE);
}

/** Cadence (tr/min) correspondant à une vitesse (m/s) pour un développement donné (m). */
export function cadenceFor(speed: number, development: number): number {
  return (speed / development) * 60;
}
