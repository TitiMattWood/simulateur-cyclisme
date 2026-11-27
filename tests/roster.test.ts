import { describe, it, expect } from 'vitest';
import { buildRoster, difficultyFtps, DIFFICULTY_RANGE, rng, type Difficulty } from '../src/ride/ai/roster';
import { Peloton } from '../src/ride/ai/peloton';
import { defaultSetup } from '../src/ride/setup';
import { importBackup } from '../src/storage/store';

describe('difficulté des adversaires', () => {
  it.each(Object.keys(DIFFICULTY_RANGE) as Difficulty[])('FTP de %s dans la plage, bien réparties', (d) => {
    const [lo, hi] = DIFFICULTY_RANGE[d];
    const ftps = difficultyFtps(10, d, 250, rng(3));
    for (const f of ftps) {
      expect(f).toBeGreaterThanOrEqual(Math.floor(250 * lo));
      expect(f).toBeLessThanOrEqual(Math.ceil(250 * hi));
    }
    // un tiers bas et un tiers haut sont représentés
    expect(Math.min(...ftps)).toBeLessThan(250 * (lo + (hi - lo) / 3));
    expect(Math.max(...ftps)).toBeGreaterThan(250 * (hi - (hi - lo) / 3));
  });

  it('en course, le peloton utilise ces FTP', () => {
    const pel = new Peloton({ ...defaultSetup(), mode: 'race', riders: 8, difficulty: 'easy' }, 300, 'smooth', 0, 11);
    for (const r of pel.riders) {
      expect(r.ftp).toBeGreaterThanOrEqual(210);
      expect(r.ftp).toBeLessThanOrEqual(270);
    }
  });

  it('la fatigue réduit la FTP et la réserve de départ', () => {
    const roster = buildRoster({ seed: 5, opponents: 3, difficulty: 'equal', playerFtp: 250, playerTeam: '' });
    roster[0].fatigue = 0.1;
    const pel = new Peloton({ ...defaultSetup(), mode: 'race' }, 250, 'smooth', 0, 5, { roster });
    expect(pel.riders[0].ftp).toBe(Math.round(roster[0].baseFtp * 0.9));
    expect(pel.riders[0].energy).toBeCloseTo(0.8, 5);
    expect(pel.riders[1].energy).toBe(1);
  });
});

describe('roster', () => {
  it('coureurs nommés, sans doublon, adversaires hors de l’équipe du joueur', () => {
    const r = buildRoster({ seed: 9, opponents: 10, difficulty: 'equal', playerFtp: 250, playerTeam: 'tricolore', teammates: 2 });
    expect(r).toHaveLength(12);
    expect(new Set(r.map((x) => x.id)).size).toBe(12);
    expect(r.filter((x) => x.isTeammate).every((x) => x.teamId === 'tricolore')).toBe(true);
    expect(r.filter((x) => !x.isTeammate).some((x) => x.teamId === 'tricolore')).toBe(false);
    expect(r.every((x) => x.firstName && x.lastName)).toBe(true);
  });

  it('même graine, même roster', () => {
    const o = { seed: 4, opponents: 6, difficulty: 'strong' as const, playerFtp: 230, playerTeam: '' };
    expect(buildRoster(o)).toEqual(buildRoster(o));
  });

  it('pas de coéquipier sans équipe', () => {
    expect(buildRoster({ seed: 1, opponents: 4, difficulty: 'equal', playerFtp: 250, playerTeam: '', teammates: 3 })).toHaveLength(4);
  });
});

describe('migration de la sauvegarde', () => {
  it.each([[0.8, 'easy'], [1, 'equal'], [1.15, 'strong']] as const)('ancien niveau %s → %s', (level, d) => {
    const save = importBackup(JSON.stringify({ app: 'simulateur-cyclisme', profile: { rideSetup: { mode: 'race', level } } }));
    expect(save.profile.rideSetup.difficulty).toBe(d);
    expect('level' in save.profile.rideSetup).toBe(false);
    expect(save.profile.teamId).toBe('');
  });
});

describe('équipe créée par le joueur', () => {
  it('ses coéquipiers portent ses couleurs et viennent de « Mon équipe »', async () => {
    const { makeMyTeam, setMyTeam, teamById, MY_TEAM_ID } = await import('../src/data/teams');
    setMyTeam(makeMyTeam({
      name: 'Les Rouleurs du Vexin', jersey: ['#123456', '#ffffff', '#ff0000'], pattern: 'band', shorts: '#000000',
      helmet: '#ffffff', frame: 'aero', frameColor: '#123456', frameColor2: '#ffffff', wheels: 'mono60',
    }));
    expect(teamById(MY_TEAM_ID)?.name).toBe('Les Rouleurs du Vexin');
    const r = buildRoster({ seed: 3, opponents: 8, difficulty: 'equal', playerFtp: 250, playerTeam: MY_TEAM_ID, teammates: 2 });
    expect(r.filter((x) => x.isTeammate).length).toBe(2);
    expect(r.filter((x) => x.isTeammate).every((x) => x.teamId === MY_TEAM_ID)).toBe(true);
    setMyTeam(null);
    expect(teamById(MY_TEAM_ID)).toBeUndefined();
  });
});
