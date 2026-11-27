import { describe, it, expect } from 'vitest';
import { WHEELS, WHEEL_ORDER, wheelAllowed, wheelEffect, defaultWheelFor } from '../src/physics/equipment';
import { buildParams, crrFor, steadySpeed, airDensity } from '../src/physics/model';
import type { FrameId, WheelId } from '../src/physics/equipment';

const kit = { aeroHelmet: false, highSocks: false, overshoes: false };
const setup = (frame: FrameId, wheels: WheelId) => ({ weightKg: 72, heightCm: 178, frame, wheels, kit });
const kmh = (frame: FrameId, wheels: WheelId, grade = 0, surface: 'asphalt' | 'gravel' = 'asphalt') => {
  const p = buildParams(setup(frame, wheels));
  return steadySpeed(250, { grade, headwind: 0, rho: airDensity(0), crr: crrFor(frame, surface, p.roll), draft: 1 }, p) * 3.6;
};

describe('catalogue des roues', () => {
  it('chaque roue a un poids, une hauteur et une largeur de jante plausibles', () => {
    for (const id of WHEEL_ORDER) {
      const w = WHEELS[id];
      expect(w.grams).toBeGreaterThan(1100);
      expect(w.grams).toBeLessThan(2200);
      expect(w.rimDepth).toBeGreaterThanOrEqual(22);
      expect(w.innerWidth).toBeGreaterThanOrEqual(17);
      expect(w.massDelta).toBeCloseTo((w.grams - 1900) / 1000);
    }
    expect(WHEEL_ORDER.length).toBe(Object.keys(WHEELS).length);
  });

  it('la lenticulaire est réservée au vélo de CLM, le VTT garde ses roues alu', () => {
    expect(wheelAllowed('tt', 'tt80d')).toBe(true);
    expect(wheelAllowed('aero', 'tt80d')).toBe(false);
    expect(wheelAllowed('mtb', 'mono60')).toBe(false);
    for (const f of ['climb', 'aero', 'gravel', 'tt', 'mtb'] as const) expect(wheelAllowed(f, defaultWheelFor(f))).toBe(true);
  });
});

describe('gains marginaux de l’association cadre + roues', () => {
  it('cadre aéro + jantes hautes : gain supplémentaire par rapport à un cadre grimpeur', () => {
    const onAero = wheelEffect('aero', 'pro65'), onClimb = wheelEffect('climb', 'pro65');
    expect(onAero.cdaDelta).toBeLessThan(onClimb.cdaDelta);
    expect(onAero.notes).toContain('integration');
  });

  it('CLM + lenticulaire : le plus rapide sur le plat', () => {
    expect(kmh('tt', 'tt100d')).toBeGreaterThan(kmh('tt', 'mono60'));
    expect(kmh('tt', 'tt80d')).toBeGreaterThan(kmh('tt', 'c40'));
  });

  it('les roues légères gagnent en côte, les très hautes sur le plat', () => {
    expect(kmh('climb', 'clim45', 0.08)).toBeGreaterThan(kmh('climb', 'c88', 0.08));
    expect(kmh('climb', 'c88', 0)).toBeGreaterThan(kmh('climb', 'clim45', 0));
  });

  it('jante gravel large sur un gravel : plus rapide sur les chemins', () => {
    expect(kmh('gravel', 'g54', 0, 'gravel')).toBeGreaterThan(kmh('gravel', 'pro55', 0, 'gravel'));
    expect(wheelEffect('gravel', 'mono60').notes).toContain('gravel-tyre-on-road-rim');
  });

  it('jante étroite ou trop large avec un pneu route : une partie du gain aéro perdue', () => {
    expect(wheelEffect('climb', 'arc62').cdaDelta).toBeGreaterThan(WHEELS.arc62.cdaDelta);
    expect(wheelEffect('climb', 'g54').cdaDelta).toBeGreaterThan(WHEELS.g54.cdaDelta);
  });
});
