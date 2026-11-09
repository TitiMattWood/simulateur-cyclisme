import { describe, it, expect } from 'vitest';
import { draftFactor, apparentYaw, MAX_DRAFT } from '../src/physics/draft';

describe('aspiration', () => {
  it('seul, aucun abri', () => {
    expect(draftFactor([])).toBe(1);
  });

  it('dans la roue : environ −35 %, puis l’abri diminue avec la distance', () => {
    const near = draftFactor([{ dx: 0.5, dy: 0 }]);
    const mid = draftFactor([{ dx: 2, dy: 0 }]);
    const far = draftFactor([{ dx: 6, dy: 0 }]);
    expect(near).toBeGreaterThan(0.6);
    expect(near).toBeLessThan(0.7);
    expect(mid).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(0.95);
  });

  it('décalé d’un mètre sur le côté, l’abri est presque perdu', () => {
    expect(draftFactor([{ dx: 0.6, dy: 1.0 }])).toBeGreaterThan(0.9);
  });

  it('dans un groupe, l’abri se cumule sans dépasser le plafond', () => {
    const pack = draftFactor([
      { dx: 0.6, dy: 0 }, { dx: 0.8, dy: 0.5 }, { dx: 2.4, dy: 0 }, { dx: 2.6, dy: 0.5 }, { dx: 4.4, dy: 0.2 },
    ]);
    expect(pack).toBeLessThan(draftFactor([{ dx: 0.6, dy: 0 }]));
    expect(pack).toBeGreaterThanOrEqual(1 - MAX_DRAFT - 1e-9);
  });

  it('bordure : par vent de gauche, l’abri passe en diagonale à droite', () => {
    const yaw = apparentYaw(10, 0, 6); // vent de côté venant de la gauche
    const behind = draftFactor([{ dx: 1.5, dy: 0 }], yaw);
    // je suis à droite du coureur de devant : il est à ma gauche (dy > 0)
    const diagonal = draftFactor([{ dx: 1.5, dy: 0.3 }], yaw);
    const wrongSide = draftFactor([{ dx: 1.5, dy: -0.3 }], yaw);
    expect(diagonal).toBeLessThan(behind);
    expect(wrongSide).toBeGreaterThan(behind);
  });

  it('le coureur de tête gagne un peu quand on roule dans sa roue', () => {
    expect(draftFactor([{ dx: -0.6, dy: 0 }])).toBeCloseTo(0.97, 5);
  });
});
