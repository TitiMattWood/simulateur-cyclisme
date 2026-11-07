import { describe, it, expect } from 'vitest';
import { buildParams, steadySpeed, airDensity, crrFor, RiderDynamics, powerForSpeed } from '../src/physics/model';

const setup = { weightKg: 72, heightCm: 178, frame: 'climb' as const, wheels: 'alu' as const, kit: { aeroHelmet: false, highSocks: false, overshoes: false } };
const flat = (p = buildParams(setup)) => ({ grade: 0, headwind: 0, rho: airDensity(0), crr: crrFor(p.frame, 'asphalt'), draft: 1 });

describe('physique', () => {
  it('250 W sur le plat ≈ 35–38 km/h', () => {
    const p = buildParams(setup);
    const v = steadySpeed(250, flat(p), p) * 3.6;
    expect(v).toBeGreaterThan(34);
    expect(v).toBeLessThan(39);
  });

  it('250 W à 8 % ≈ 11–13 km/h', () => {
    const p = buildParams(setup);
    const v = steadySpeed(250, { ...flat(p), grade: 0.08 }, p) * 3.6;
    expect(v).toBeGreaterThan(11);
    expect(v).toBeLessThan(13.5);
  });

  it('les roues 88 mm sont plus rapides sur le plat, le VTT plus lent', () => {
    const base = buildParams(setup);
    const deep = buildParams({ ...setup, wheels: 'c88' });
    const mtb = buildParams({ ...setup, frame: 'mtb' });
    const vBase = steadySpeed(250, flat(base), base);
    expect(steadySpeed(250, flat(deep), deep)).toBeGreaterThan(vBase);
    expect(steadySpeed(250, flat(mtb), mtb)).toBeLessThan(vBase * 0.92);
  });

  it("l'aspiration réduit la puissance nécessaire d'environ 30 %", () => {
    const p = buildParams(setup);
    const alone = powerForSpeed(11, flat(p), p);
    const drafted = powerForSpeed(11, { ...flat(p), draft: 0.65 }, p);
    expect(drafted / alone).toBeGreaterThan(0.6);
    expect(drafted / alone).toBeLessThan(0.8);
  });

  it("l'air est moins dense en altitude", () => {
    expect(airDensity(2000)).toBeLessThan(airDensity(0) * 0.85);
  });

  it("l'intégration converge vers la vitesse d'équilibre et freine en virage", () => {
    const p = buildParams(setup);
    const dyn = new RiderDynamics(p);
    for (let i = 0; i < 6000; i++) dyn.step(1 / 60, 250, flat(p));
    expect(Math.abs(dyn.v - steadySpeed(250, flat(p), p))).toBeLessThan(0.05);
    dyn.step(1 / 60, 250, flat(p), 5);
    expect(dyn.braking).toBe(true);
  });

  it("démarre à l'arrêt en descente sans pédaler, ne recule pas en montée", () => {
    const p = buildParams(setup);
    const dyn = new RiderDynamics(p);
    dyn.step(1, 0, { ...flat(p), grade: -0.06 });
    expect(dyn.v).toBeGreaterThan(0);
    const up = new RiderDynamics(p);
    up.step(1, 0, { ...flat(p), grade: 0.1 });
    expect(up.v).toBe(0);
  });
});
