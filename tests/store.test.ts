import { describe, it, expect } from 'vitest';
import { importBackup } from '../src/storage/store';
import { buildParams } from '../src/physics/model';

describe('sauvegarde : apparence', () => {
  it("reprend le casque aéro et les chaussettes d'un ancien profil", () => {
    const old = { app: 'simulateur-cyclisme', version: 1, profile: { frame: 'mtb', kit: { aeroHelmet: true, highSocks: false, overshoes: false } }, history: [], xp: 0 };
    const p = importBackup(JSON.stringify(old)).profile;
    expect(p.appearance.helmetType).toBe('aero');
    expect(p.appearance.sockHeight).toBe('low');
    expect(p.appearance.frameColor).toBe('#2a6f97');
  });

  it("garde l'apparence d'un profil récent", () => {
    const recent = { app: 'simulateur-cyclisme', version: 1, profile: { appearance: { pattern: 'polka', hair: 'bald' } }, history: [], xp: 0 };
    const p = importBackup(JSON.stringify(recent)).profile;
    expect(p.appearance.pattern).toBe('polka');
    expect(p.appearance.hair).toBe('bald');
    expect(p.appearance.skin).toMatch(/^#/);
  });
});

describe('cadres gravel et CLM', () => {
  const base = { weightKg: 72, heightCm: 178, wheels: 'alu' as const, kit: { aeroHelmet: false, highSocks: false, overshoes: false } };
  it('le CLM est plus aérodynamique que le vélo route, le gravel moins', () => {
    const road = buildParams({ ...base, frame: 'climb' });
    expect(buildParams({ ...base, frame: 'tt' }).cda).toBeLessThan(road.cda * 0.85);
    expect(buildParams({ ...base, frame: 'gravel' }).cda).toBeGreaterThan(road.cda);
  });
});
