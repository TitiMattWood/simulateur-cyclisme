import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGpx } from '../src/geo/gpx';
import { Route, processProfile, RouteIndex } from '../src/geo/route';

describe('GPX et parcours', () => {
  it('lit un GPX de démonstration', () => {
    const gpx = parseGpx(readFileSync('public/routes/alpe-huez.gpx', 'utf8'));
    expect(gpx.points.length).toBeGreaterThan(100);
    const r = Route.fromPoints(gpx.name, gpx.points);
    expect(r.length).toBeGreaterThan(12000);
    expect(r.length).toBeLessThan(14500);
    // D+ de l'Alpe d'Huez d'après l'altitude du GPX : environ 1 000 à 1 150 m
    expect(r.totalAscent).toBeGreaterThan(950);
    expect(r.totalAscent).toBeLessThan(1200);
  });

  it('lit les attributs dans le désordre et les itinéraires <rtept>', () => {
    const g = parseGpx(`<gpx><rte><name>Test &amp; co</name><rtept lon="2.1" lat="49.0"/><rtept lat='49.01' lon='2.1'><ele>40</ele></rtept></rte></gpx>`);
    expect(g.name).toBe('Test & co');
    expect(g.points).toEqual([{ lat: 49, lon: 2.1 }, { lat: 49.01, lon: 2.1, ele: 40 }]);
  });

  it('comble le creux d\'un pont et garde une vraie descente', () => {
    const n = 400;
    const dist = Float64Array.from({ length: n }, (_, i) => i * 5);
    // route plate à 50 m, la vallée sous un pont (40 m de large, 15 m plus bas)
    const raw = Float32Array.from({ length: n }, (_, i) => (i >= 200 && i < 208 ? 35 : 50));
    const { ele } = processProfile(dist, raw);
    expect(Math.min(...ele.slice(195, 215))).toBeGreaterThan(48);
    // une descente régulière de 5 % n'est pas modifiée
    const slope = Float32Array.from({ length: n }, (_, i) => 100 - i * 5 * 0.05);
    const s = processProfile(dist, slope);
    expect(s.grade[200]).toBeCloseTo(-0.05, 2);
  });

  it("l'index spatial retrouve le point de route le plus proche", () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ lat: 49, lon: 2 + i * 0.0002 }));
    const r = Route.fromPoints('ligne', pts);
    const idx = new RouteIndex(r);
    const mid = r.sampleAt(r.length / 2);
    const near = idx.nearest(mid.x, mid.z + 3, 10)!;
    expect(near.dist).toBeCloseTo(3, 0);
    expect(Math.abs(near.d - r.length / 2)).toBeLessThan(2);
    expect(idx.nearest(mid.x, mid.z + 50, 10)).toBeNull();
  });
});

describe('catalogue des parcours', () => {
  it('chaque parcours se lit et sa longueur correspond à la description', async () => {
    const { ROUTES } = await import('../src/data/routes');
    for (const r of ROUTES) {
      const gpx = parseGpx(readFileSync(`public/${r.file}`, 'utf8'));
      const route = Route.fromPoints(r.name, gpx.points);
      const km = Number(/· (\d+) km/.exec(r.description)?.[1]);
      expect(Math.abs(route.length / 1000 - km), r.id).toBeLessThan(1.5);
    }
  });
});
