import { describe, it, expect } from 'vitest';
import { simulationParams } from '../src/physics/trainerSim';
import { GearBox, cadenceFor, virtualFactor, TRAINER_CIRCUMFERENCE } from '../src/physics/gears';

const G = 9.80665;
/** Modèle de force d'un trainer en mode SIM (masse m). */
const trainerForce = (p: { grade: number; crr: number; cw: number; wind: number }, v: number, m: number) => {
  const th = Math.atan(p.grade);
  return m * G * (Math.sin(th) + p.crr * Math.cos(th)) + p.cw * (v + p.wind) ** 2;
};

describe('vitesses virtuelles', () => {
  it('en manuel, les paramètres sont transmis tels quels', () => {
    const p = simulationParams({ grade: 0.06, crr: 0.004, cw: 0.19, headwind: 2, difficulty: 1, k: 1 });
    expect(p).toEqual({ grade: 0.06, crr: 0.004, cw: 0.19, wind: 2 });
  });

  it('en virtuel, la force du trainer vaut k × la force sur la route à k × sa vitesse', () => {
    const m = 80, cw = 0.19, crr = 0.004;
    for (const [grade, k, vt] of [[0.05, 1.6, 4], [0, 0.7, 9], [0.08, 1.2, 3], [-0.02, 1.4, 7]]) {
      const p = simulationParams({ grade, crr, cw, headwind: 1, difficulty: 1, k });
      const road = trainerForce({ grade, crr, cw, wind: 1 }, k * vt, m);
      expect(trainerForce(p, vt, m)).toBeCloseTo(k * road, 6);
    }
  });

  it('double plateau séquentiel : rapports croissants, sans croisement extrême', () => {
    const box = new GearBox({ chainrings: '50/34', cassette: '11-30 (12 v)', tire: '700x25', sequential: true });
    box.shift(-100);
    expect(box.ring).toBe(34);
    expect(box.cog).toBe(30);
    let prev = box.ratio;
    for (let i = 0; i < 40; i++) {
      box.shift(1);
      expect(box.ratio).toBeGreaterThanOrEqual(prev);
      prev = box.ratio;
    }
    expect(box.ring).toBe(50);
    expect(box.cog).toBe(11);
    expect(box.label).toMatch(/^50×11 · 9,57 m · \d+\/\d+$/);
  });

  it('monoplateau et double non séquentiel : la cassette seule, puis le plateau à part', () => {
    const mono = new GearBox({ chainrings: '42', cassette: '10-44 (12 v)', tire: '700x40', sequential: true });
    mono.shift(-100);
    expect(mono.cog).toBe(44);
    mono.shiftFront(); // sans effet en monoplateau
    expect(mono.ring).toBe(42);
    const dbl = new GearBox({ chainrings: '50/34', cassette: '11-28 (11 v)', tire: '700x25', sequential: false });
    const before = dbl.ring;
    dbl.shiftFront();
    expect(dbl.ring).not.toBe(before);
  });

  it("le facteur k compare les développements virtuel et réel", () => {
    const box = new GearBox({ chainrings: '50/34', cassette: '11-30 (12 v)', tire: '700x25', sequential: false });
    while (box.ring !== 50) box.shiftFront();
    while (box.cog !== 17) box.shift(box.cog > 17 ? 1 : -1);
    // même braquet que le réel (50×17) et même circonférence que le trainer → k = 1
    expect(virtualFactor(box, 50, 17)).toBeCloseTo(2.105 / TRAINER_CIRCUMFERENCE, 6);
    expect(cadenceFor(10, box.development)).toBeCloseTo(96.9, 0);
  });
});

describe('plateaux proposés', () => {
  it('monoplateau de 38 à 50 dents, en plus des doubles', async () => {
    const { CHAINRINGS } = await import('../src/physics/gears');
    const mono = Object.values(CHAINRINGS).filter((r) => r.length === 1).map((r) => r[0]);
    expect(mono).toEqual([38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
    expect(CHAINRINGS['50/34']).toEqual([50, 34]);
    const box = new GearBox({ chainrings: '50', cassette: '11-34 (12 v)', tire: '700x28', sequential: true });
    expect(box.ring).toBe(50);
  });
});
