import { describe, it, expect } from 'vitest';
import { findTownEntry } from '../src/ride/signSprint';

describe('sprint pancarte : repérage de l’entrée de ville', () => {
  it('trouve le passage campagne → agglomération', () => {
    // campagne jusqu'à 600 m, puis ville
    const urban = (d: number) => d >= 600;
    expect(findTownEntry(urban, 0, 1000)).toBe(600);
  });
  it('ignore une ville déjà commencée (pas assez de campagne avant)', () => {
    const urban = (d: number) => d < 100 || d >= 250;
    expect(findTownEntry(urban, 0, 1000)).toBeNull();
  });
  it('ignore un tronçon urbain isolé (un seul relevé)', () => {
    const urban = (d: number) => d === 500;
    expect(findTownEntry(urban, 0, 1000)).toBeNull();
  });
  it('les zones sans route connue interrompent la campagne', () => {
    const urban = (d: number) => (d < 400 ? null : d >= 500);
    expect(findTownEntry(urban, 0, 1000)).toBeNull();
  });
});
