import { describe, it, expect } from 'vitest';
import { groundClass } from '../src/world/terrain';
import { sampleTerrain, type HeightGrid } from '../src/world/geometry';

describe('couleur du sol stylisée', () => {
  it('reconnaît les grandes catégories de sol sur l\'orthophoto', () => {
    expect(groundClass(0.45, 0.6, 0.3)).toBe('meadow'); // pré vert clair
    expect(groundClass(0.15, 0.25, 0.12)).toBe('forest'); // sous-bois sombre
    expect(groundClass(0.8, 0.72, 0.5)).toBe('wheat'); // chaume clair
    expect(groundClass(0.55, 0.42, 0.3)).toBe('soil'); // labour brun
    expect(groundClass(0.62, 0.62, 0.64)).toBe('urban'); // enrobé, toits gris
    expect(groundClass(0.74, 0.71, 0.68)).toBe('wheat'); // champ pâle mais « chaud » ≠ ville
  });
});

describe('altitude exacte du terrain dessiné', () => {
  // une maille de 10 m : trois coins à 0 m, le coin (r+1, c+1) à 10 m
  const g: HeightGrid = { x0: 0, z0: 0, size: 10, res: 1, h: new Float32Array([0, 0, 0, 10]) };
  it('suit les deux triangles de la maille, pas une interpolation bilinéaire', () => {
    expect(sampleTerrain(g, 0, 0)).toBeCloseTo(0);
    expect(sampleTerrain(g, 10, 10)).toBeCloseTo(10);
    // au centre, sur la diagonale : moitié de la hauteur (le bilinéaire donnerait 2,5 m)
    expect(sampleTerrain(g, 5, 5)).toBeCloseTo(5);
    expect(sampleTerrain(g, 10, 0)).toBeCloseTo(0);
  });
});
