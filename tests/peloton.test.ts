import { describe, it, expect } from 'vitest';
import { Peloton, AiRider, type PelotonEnv, type PlayerState } from '../src/ride/ai/peloton';
import { defaultSetup, type RideSetup } from '../src/ride/setup';
import { buildParams, RiderDynamics, airDensity, crrFor, steadySpeed } from '../src/physics/model';
import { draftFactor } from '../src/physics/draft';

const flat = (finish: number | null = null): PelotonEnv => ({
  road: () => ({ grade: 0, ele: 50, surface: 'asphalt', vmax: Infinity, dirX: 1, dirZ: 0 }),
  rho: (e) => airDensity(e),
  crr: (f, s) => crrFor(f, s),
  wind: { x: 0, z: 0 },
  finish,
});

/** Joueur simulé : puissance constante, avec l'abri calculé par le peloton. */
function ride(setup: Partial<RideSetup>, playerWatts: number, seconds: number, finish: number | null = null) {
  const su = { ...defaultSetup(), ...setup };
  const pel = new Peloton(su, 250, 'smooth', 0, 7);
  const params = buildParams({ weightKg: 72, heightCm: 178, frame: 'climb', wheels: 'alu', kit: { aeroHelmet: false, highSocks: false, overshoes: false } });
  const dyn = new RiderDynamics(params);
  const player: PlayerState = { dist: 0, v: 0, lateral: 0 };
  const env = flat(finish);
  const dt = 0.1;
  for (let t = 0; t < seconds; t += dt) {
    const v = dyn.step(dt, playerWatts, { grade: 0, headwind: 0, rho: airDensity(50), crr: 0.004, draft: pel.playerDraft });
    player.dist += v * dt;
    player.v = v;
    pel.step(dt, player, env);
  }
  return { pel, player };
}

describe('peloton', () => {
  it('en groupe, la tête roule à l’allure demandée et le paquet reste groupé', () => {
    const { pel } = ride({ mode: 'group', riders: 8, pace: 0.65, wait: false, relay: true }, 0, 600);
    const lead = pel.riders.reduce((a, r) => (r.dist > a.dist ? r : a));
    const expected = steadySpeed(0.65 * 250, { grade: 0, headwind: 0, rho: airDensity(50), crr: 0.004, draft: 0.97 }, lead.params);
    expect(lead.dyn.v).toBeGreaterThan(expected * 0.85);
    expect(lead.dyn.v).toBeLessThan(expected * 1.15);
    const ds = pel.riders.map((r) => r.dist);
    expect(Math.max(...ds) - Math.min(...ds)).toBeLessThan(25);
  });

  it('le groupe attend le joueur qui roule moins fort', () => {
    const waiting = ride({ mode: 'group', riders: 6, pace: 0.75, wait: true }, 120, 600);
    const alone = ride({ mode: 'group', riders: 6, pace: 0.75, wait: false }, 120, 600);
    const gap = (r: typeof waiting) => Math.min(...r.pel.riders.map((x) => x.dist)) - r.player.dist;
    expect(gap(waiting)).toBeLessThan(60);
    expect(gap(alone)).toBeGreaterThan(300);
  });

  it('dans la roue du groupe, le joueur est abrité', () => {
    const { pel } = ride({ mode: 'group', riders: 6, pace: 0.6, wait: true }, 150, 300);
    expect(pel.playerDraft).toBeLessThan(1);
  });

  it('la réserve d’énergie se vide au-dessus du seuil et se recharge en dessous', () => {
    const r = new AiRider(0, 'Test', 'Équipe', 'rouleur', 250, ride({ riders: 1 }, 0, 0).pel.riders[0].look, 0);
    for (let i = 0; i < 60; i++) r.spend(400, 1);
    expect(r.energy).toBeLessThan(0.7);
    const low = r.energy;
    for (let i = 0; i < 120; i++) r.spend(150, 1);
    expect(r.energy).toBeGreaterThan(low);
  });

  it('en course, tout le monde arrive et le classement est ordonné', () => {
    const { pel, player } = ride({ mode: 'race', riders: 6, level: 1 }, 230, 900, 5000);
    expect(pel.riders.every((r) => r.finishTime !== null)).toBe(true);
    const rank = pel.ranking({ ...player, name: 'Moi', finishTime: null });
    const times = rank.filter((x) => x.finishTime !== null).map((x) => x.finishTime!);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('l’abri théorique du joueur dans la roue est cohérent', () => {
    expect(draftFactor([{ dx: 1.15, dy: 0 }])).toBeLessThan(0.8);
  });
});
