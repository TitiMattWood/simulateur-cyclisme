import { describe, it, expect } from 'vitest';
import { simulationParams } from '../src/physics/trainerSim';
import { VIRTUAL_GEARS, gearLabel, cadenceFor, realRatio } from '../src/physics/gears';

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

  it('24 rapports croissants, de ≈ 34×47 à ≈ 52×11', () => {
    expect(VIRTUAL_GEARS).toHaveLength(24);
    for (let i = 1; i < 24; i++) expect(VIRTUAL_GEARS[i]).toBeGreaterThan(VIRTUAL_GEARS[i - 1]);
    expect(VIRTUAL_GEARS[23]).toBeCloseTo(4.73, 2);
    expect(gearLabel(50 / 17)).toBe('≈ 50×17');
    expect(cadenceFor(10, realRatio(50, 17))).toBeCloseTo(96.9, 0);
  });
});
