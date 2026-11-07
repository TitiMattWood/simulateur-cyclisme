import { describe, it, expect } from 'vitest';
import { LocalProjection } from '../src/geo/projection';
import { RoadNetwork } from '../src/world/roads';
import { OpenPath } from '../src/ride/openPath';
import type { GeoFeature } from '../src/geo/ign';

const proj = new LocalProjection(49, 2);
/** Tronçon BD TOPO fictif entre deux points locaux (x est, z sud) — 1 m ≈ 1 m. */
const road = (id: string, pts: Array<[number, number]>, nature = 'Route à 1 chaussée', extra: Record<string, unknown> = {}): GeoFeature => ({
  id,
  geometry: { type: 'LineString', coordinates: pts.map(([x, z]) => { const ll = proj.toLatLon(x, z); return [ll.lon, ll.lat]; }) },
  properties: { nature, position_par_rapport_au_sol: '0', sens_de_circulation: 'Double sens', importance: '4', nom_collaboratif_gauche: id, ...extra },
});

/** Croix : ouest → centre (0,0) → est ; nord et sud partent du centre. Au bout de l'est, une impasse. */
function cross(): RoadNetwork {
  const net = new RoadNetwork(proj);
  net.ingest([
    road('ouest', [[-400, 0], [0, 0]]),
    road('est', [[0, 0], [400, 0]]),
    road('nord', [[0, 0], [0, -400]]),
    road('sud', [[0, 0], [0, 400]], 'Chemin', { urbain: false }),
    road('autoroute', [[0, 0], [300, 300]], 'Type autoroutier'),
  ]);
  return net;
}

describe('trajet libre', () => {
  it('relie les tronçons en carrefours et ignore les autoroutes', () => {
    const net = cross();
    expect(net.edges.size).toBe(4);
    const center = [...net.nodes.values()].find((n) => n.edges.length === 4);
    expect(center).toBeDefined();
  });

  it('va tout droit par défaut, tourne à droite sur demande, fait demi-tour', () => {
    const net = cross();
    const west = net.edges.get('ouest')!;
    const path = new OpenPath(net, proj, () => 50, { edge: west, s: 0, forward: true }, 'test');
    path.update(0);
    const j = path.junction(0, 500)!;
    expect(j).not.toBeNull();
    expect(j.options.map((o) => o.edge.id)).toEqual(['nord', 'est', 'sud']); // gauche → droite
    expect(j.options[j.selected].edge.id).toBe('est'); // tout droit
    // après le carrefour on est vers l'est
    expect(path.sampleAt(500).x).toBeGreaterThan(50);
    // trop loin du carrefour (400 m) : le choix n'est pas encore possible
    path.choose(0, 1);
    expect(path.sampleAt(500).x).toBeGreaterThan(50);
    // à 250 m du carrefour : choix à droite, vers le sud (chemin de gravier)
    path.update(150);
    path.choose(150, 1);
    const after = path.sampleAt(500);
    expect(after.z).toBeGreaterThan(50);
    expect(after.surface).toBe('gravel');
    // demi-tour à 200 m : on revient vers l'ouest
    path.update(200);
    path.uTurn(200);
    const back = path.sampleAt(250);
    expect(back.x).toBeLessThan(-200);
    expect(back.dirX).toBeLessThan(-0.9);
  });

  it("au bout d'une impasse, le chemin fait demi-tour tout seul", () => {
    const net = new RoadNetwork(proj);
    net.ingest([road('seule', [[0, 0], [200, 0]])]);
    const path = new OpenPath(net, proj, () => 0, { edge: net.edges.get('seule')!, s: 0, forward: true }, 'impasse');
    path.update(0);
    expect(path.sampleAt(300).x).toBeCloseTo(100, 0);
  });

  it("l'altitude suit le terrain et la pente est calculée", () => {
    const net = cross();
    const ground = (x: number) => 100 + x * 0.05; // 5 % vers l'est
    const path = new OpenPath(net, proj, (x) => ground(x), { edge: net.edges.get('ouest')!, s: 100, forward: true }, 'pente');
    path.update(0);
    expect(path.sampleAt(100).grade).toBeCloseTo(0.05, 2);
  });
});

describe('revêtement estimé', () => {
  it('chemin en ville = allée revêtue, hors agglomération = gravier', async () => {
    const { surfaceOf } = await import('../src/world/roads');
    expect(surfaceOf({ nature: 'Chemin', urbain: true })).toBe('rough');
    expect(surfaceOf({ nature: 'Chemin', urbain: false })).toBe('gravel');
    expect(surfaceOf({ nature: 'Sentier', urbain: false })).toBe('dirt');
    expect(surfaceOf({ nature: 'Route à 1 chaussée', urbain: false })).toBe('asphalt');
  });
});
