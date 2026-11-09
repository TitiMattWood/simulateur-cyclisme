/**
 * Enregistrement de la sortie (1 échantillon par seconde de temps en mouvement)
 * et calcul du bilan final.
 */
import { normalizedPower, trainingLoad, kcalFromWork, xpFor } from './metrics';

export interface Sample {
  /** horodatage (ms depuis 1970) */
  t: number;
  dist: number;
  lat: number;
  lon: number;
  ele: number;
  /** m/s */
  speed: number;
  power: number;
  cadence: number;
  hr: number;
}

export interface RideSummary {
  date: string;
  routeName: string;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  ascent: number;
  avgPower: number;
  maxPower: number;
  np: number;
  avgHr: number;
  maxHr: number;
  avgCadence: number;
  avgSpeed: number;
  maxSpeed: number;
  kcal: number;
  workKj: number;
  tss: number;
  intensity: number;
  xp: number;
  /** sprints pancartes gagnés pendant la sortie */
  sprintWins?: number;
  ftp: number;
}

export class Recorder {
  samples: Sample[] = [];
  readonly startedAt = Date.now();
  private acc = 0;

  /** À appeler à chaque image ; n'enregistre qu'une fois par seconde de temps actif. */
  tick(dt: number, s: Omit<Sample, 't'>): void {
    this.acc += dt;
    if (this.acc < 1) return;
    this.acc -= 1;
    const last = this.samples[this.samples.length - 1];
    const t = last ? last.t + 1000 : this.startedAt;
    this.samples.push({ ...s, t });
  }

  summarize(routeName: string, ftp: number): RideSummary {
    const s = this.samples;
    const n = s.length || 1;
    const sum = (f: (x: Sample) => number) => s.reduce((a, x) => a + f(x), 0);
    const max = (f: (x: Sample) => number) => s.reduce((a, x) => Math.max(a, f(x)), 0);
    const powers = s.map((x) => x.power);
    const np = normalizedPower(powers);
    const movingTime = s.length;
    const load = trainingLoad(movingTime, np, ftp);
    let ascent = 0;
    for (let i = 1; i < s.length; i++) ascent += Math.max(0, s[i].ele - s[i - 1].ele);
    const hrs = s.filter((x) => x.hr > 0);
    const cads = s.filter((x) => x.cadence > 0);
    const workKj = sum((x) => x.power) / 1000;
    const distance = s.length ? s[s.length - 1].dist - s[0].dist : 0;
    return {
      date: new Date(this.startedAt).toISOString(),
      routeName,
      distance,
      movingTime,
      elapsedTime: Math.round((Date.now() - this.startedAt) / 1000),
      ascent,
      avgPower: sum((x) => x.power) / n,
      maxPower: max((x) => x.power),
      np,
      avgHr: hrs.length ? hrs.reduce((a, x) => a + x.hr, 0) / hrs.length : 0,
      maxHr: max((x) => x.hr),
      avgCadence: cads.length ? cads.reduce((a, x) => a + x.cadence, 0) / cads.length : 0,
      avgSpeed: movingTime ? distance / movingTime : 0,
      maxSpeed: max((x) => x.speed),
      kcal: kcalFromWork(workKj),
      workKj,
      tss: load.tss,
      intensity: load.if,
      xp: xpFor(distance, ascent, load.tss),
      ftp,
    };
  }
}
