/**
 * Chargement progressif du monde autour du cycliste.
 *
 * Le monde est découpé en tuiles carrées :
 *  - tuiles « proches » (800 m) : relief fin, orthophoto, bâtiments, arbres, routes ;
 *  - tuiles « lointaines » (6,4 km) : relief simplifié pour l'horizon (montagnes, vallées).
 * Les tuiles sont téléchargées par ordre de priorité (les plus proches d'abord),
 * construites une par image pour éviter les saccades, et libérées quand on s'éloigne.
 *
 * Le même chargeur sert aux parcours GPX et au trajet libre : les routes de chaque tuile
 * sont transmises au réseau routier (onRoads) pour que le chemin puisse se prolonger.
 */
import * as THREE from 'three';
import type { QualityPreset } from '../config';
import type { RouteIndex } from '../geo/route';
import type { Track } from '../geo/track';
import { fetchDemGrid, fetchOrtho, fetchWfs, type BBox, type GeoFeature } from '../geo/ign';
import { buildTerrain, flattenUnderRoute, flattenUnderRoads, ROAD_HALF_WIDTH } from './terrain';
import { buildBuildings, buildVegetation, buildRoads } from './features';
import { geoToPolys, geoToLines, sampleGrid, SegmentIndex, type HeightGrid } from './geometry';
import { ROAD_CLASSES, ROAD_PROPS, roadWidth } from './roads';

type Level = 'near' | 'far';

interface TileData {
  grid: HeightGrid;
  ortho: Uint8ClampedArray | null;
  feats?: Record<'bat' | 'veg' | 'water' | 'roads' | 'rails', GeoFeature[]>;
}

interface Tile {
  key: string;
  level: Level;
  i: number;
  j: number;
  state: 'loading' | 'ready' | 'built' | 'failed';
  group?: THREE.Group;
  grid?: HeightGrid;
  data?: TileData;
}

/** Zone où les bâtiments BD TOPO sont remplacés par un monument modélisé. */
export interface Exclusion {
  x: number;
  z: number;
  r: number;
}

export interface StreamerOptions {
  /** reçoit les routes de chaque tuile proche dès leur téléchargement */
  onRoads?: (roads: GeoFeature[]) => void;
  /** appelé après la construction d'une tuile proche (bornes locales) */
  onTileBuilt?: (bounds: { x0: number; z0: number; x1: number; z1: number }) => void;
  exclusions?: Exclusion[];
}

/** Marge (m) autour d'une tuile pour les routes : le replat se raccorde entre tuiles voisines. */
const ROAD_MARGIN = 40;

const terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const featureMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

export class WorldStreamer {
  readonly group = new THREE.Group();
  private tiles = new Map<string, Tile>();
  private inflight = 0;
  private buildQueue: Tile[] = [];
  private lastUpdate = 0;
  private centers: Array<[number, number]> = [];

  /** nombre de tuiles proches prêtes (pour l'écran de chargement) */
  get readyNear(): number {
    let n = 0;
    for (const t of this.tiles.values()) if (t.level === 'near' && (t.state === 'built' || t.state === 'failed')) n++;
    return n;
  }

  constructor(
    private track: Track,
    private readonly index: RouteIndex | null,
    private readonly q: QualityPreset,
    private readonly opts: StreamerOptions = {},
  ) {}

  /** Change le tracé suivi (le trajet libre remplace son point de départ par le vrai chemin). */
  setTrack(track: Track): void {
    this.track = track;
  }

  private size(level: Level): number {
    return level === 'near' ? this.q.nearTile : this.q.farTile;
  }

  private bbox(level: Level, i: number, j: number, margin = 0): BBox {
    const s = this.size(level);
    const nw = this.track.proj.toLatLon(i * s - margin, j * s - margin);
    const se = this.track.proj.toLatLon((i + 1) * s + margin, (j + 1) * s + margin);
    return { minLat: se.lat, maxLat: nw.lat, minLon: nw.lon, maxLon: se.lon };
  }

  /** Tuiles nécessaires autour des points d'intérêt (position + point situé plus loin sur le tracé). */
  private wanted(level: Level, radius: number): Map<string, { i: number; j: number; d: number }> {
    const s = this.size(level);
    const out = new Map<string, { i: number; j: number; d: number }>();
    for (const [cx, cz] of this.centers) {
      const i0 = Math.floor((cx - radius) / s), i1 = Math.floor((cx + radius) / s);
      const j0 = Math.floor((cz - radius) / s), j1 = Math.floor((cz + radius) / s);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const dx = Math.max(i * s - cx, 0, cx - (i + 1) * s);
          const dz = Math.max(j * s - cz, 0, cz - (j + 1) * s);
          const d = Math.hypot(dx, dz);
          if (d > radius) continue;
          const key = `${level}:${i}:${j}`;
          const prev = out.get(key);
          if (!prev || prev.d > d) out.set(key, { i, j, d });
        }
      }
    }
    return out;
  }

  /** À appeler à chaque image avec la position du cycliste et sa distance sur le tracé. */
  update(x: number, z: number, dist: number, force = false): void {
    const t = this.buildQueue.shift();
    if (t) this.build(t);

    const now = performance.now();
    if (!force && now - this.lastUpdate < 400) return;
    this.lastUpdate = now;
    const ahead = this.track.sampleAt(dist + this.q.nearTile);
    this.centers = [[x, z], [ahead.x, ahead.z]];

    const near = this.wanted('near', this.q.nearRadius);
    const far = this.wanted('far', this.q.farRadius);
    for (const [key, tile] of this.tiles) {
      const keep = tile.level === 'near' ? near.has(key) || this.distTo(tile) < this.q.nearRadius * 1.5
        : far.has(key) || this.distTo(tile) < this.q.farRadius * 1.3;
      if (!keep && tile.state !== 'loading') this.dispose(tile);
    }
    const todo = [
      ...[...near].filter(([k]) => !this.tiles.has(k)).map(([k, v]) => ({ k, ...v, level: 'near' as Level, prio: v.d })),
      ...[...far].filter(([k]) => !this.tiles.has(k)).map(([k, v]) => ({ k, ...v, level: 'far' as Level, prio: v.d + 3000 })),
    ].sort((a, b) => a.prio - b.prio);
    for (const w of todo) {
      if (this.inflight >= 4) break;
      this.load({ key: w.k, level: w.level, i: w.i, j: w.j, state: 'loading' });
    }
  }

  private distTo(t: Tile): number {
    const s = this.size(t.level);
    let best = Infinity;
    for (const [cx, cz] of this.centers) {
      const dx = Math.max(t.i * s - cx, 0, cx - (t.i + 1) * s);
      const dz = Math.max(t.j * s - cz, 0, cz - (t.j + 1) * s);
      best = Math.min(best, Math.hypot(dx, dz));
    }
    return best;
  }

  private async load(tile: Tile): Promise<void> {
    this.tiles.set(tile.key, tile);
    this.inflight++;
    const b = this.bbox(tile.level, tile.i, tile.j);
    const res = tile.level === 'near' ? this.q.nearRes : this.q.farRes;
    const opx = tile.level === 'near' ? this.q.orthoPx : Math.round(this.q.orthoPx * 0.75);
    try {
      const safe = (p: Promise<GeoFeature[]>) => p.catch(() => [] as GeoFeature[]);
      const [h, ortho, feats] = await Promise.all([
        fetchDemGrid(b, res + 1, res + 1),
        fetchOrtho(b, opx, opx),
        tile.level === 'near'
          ? Promise.all([
              safe(fetchWfs('batiment', b, ['hauteur', 'nombre_d_etages', 'usage_1', 'nature'])),
              safe(fetchWfs('zone_de_vegetation', b, ['nature'])),
              safe(fetchWfs('surface_hydrographique', b, ['nature'])),
              safe(fetchWfs('troncon_de_route', this.bbox('near', tile.i, tile.j, ROAD_MARGIN), ROAD_PROPS)),
              safe(fetchWfs('troncon_de_voie_ferree', b, ['nature', 'position_par_rapport_au_sol'])),
            ]).then(([bat, veg, water, roads, rails]) => ({ bat, veg, water, roads, rails }))
          : Promise.resolve(undefined),
      ]);
      const s = this.size(tile.level);
      tile.data = { grid: { x0: tile.i * s, z0: tile.j * s, size: s, res, h }, ortho, feats };
      tile.state = 'ready';
      if (feats) this.opts.onRoads?.(feats.roads);
      if (this.tiles.get(tile.key) === tile) {
        if (tile.level === 'near') this.buildQueue.unshift(tile); else this.buildQueue.push(tile);
      }
    } catch {
      tile.state = 'failed';
      setTimeout(() => { if (this.tiles.get(tile.key) === tile) this.tiles.delete(tile.key); }, 8000);
    } finally {
      this.inflight--;
    }
  }

  /** Index des chaussées de la tuile (hors ponts et tunnels) avec leur demi-largeur. */
  private roadIndex(roads: GeoFeature[]): SegmentIndex<{ halfW: number }> {
    const idx = new SegmentIndex<{ halfW: number }>(25);
    const proj = this.track.proj;
    for (const f of roads) {
      const p = f.properties;
      if (!ROAD_CLASSES[String(p.nature)]) continue;
      if (Number(p.position_par_rapport_au_sol ?? 0) !== 0) continue;
      const halfW = roadWidth(p) / 2;
      for (const line of geoToLines(f.geometry, proj)) {
        for (let i = 0; i < line.length - 1; i++) idx.add(line[i][0], line[i][2], line[i + 1][0], line[i + 1][2], { halfW });
      }
    }
    return idx;
  }

  private build(tile: Tile): void {
    if (!tile.data || this.tiles.get(tile.key) !== tile) return;
    const { grid, ortho, feats } = tile.data;
    const s = grid.size;
    const bounds = { x0: grid.x0, z0: grid.z0, x1: grid.x0 + s, z1: grid.z0 + s };
    const group = new THREE.Group();
    const proj = this.track.proj;
    let roads: SegmentIndex<{ halfW: number }> | null = null;
    if (feats) {
      roads = this.roadIndex(feats.roads);
      flattenUnderRoads(grid, roads);
    }
    if (tile.level === 'near' && this.index) flattenUnderRoute(grid, this.index);
    const water = feats ? feats.water.flatMap((f) => geoToPolys(f.geometry, proj)) : [];
    const terrain = buildTerrain(grid, {
      ortho, orthoPx: tile.level === 'near' ? this.q.orthoPx : Math.round(this.q.orthoPx * 0.75),
      water, lower: tile.level === 'far' ? 4 : 0,
    });
    if (terrain) group.add(new THREE.Mesh(terrain, terrainMaterial));
    if (feats) {
      const ex = this.opts.exclusions ?? [];
      const bat = ex.length ? feats.bat.filter((f) => !this.excluded(f, ex)) : feats.bat;
      const bld = buildBuildings(bat, proj, grid, bounds);
      if (bld) {
        const mesh = new THREE.Mesh(bld, featureMaterial);
        mesh.userData.kind = 'buildings';
        group.add(mesh);
      }
      const onRoute = this.index ? (x: number, z: number) => !!this.index!.nearest(x, z, ROAD_HALF_WIDTH + 1.5) : null;
      const rd = buildRoads(feats.roads, feats.rails, proj, grid, bounds, onRoute);
      if (rd) group.add(new THREE.Mesh(rd, featureMaterial));
      const ri = roads;
      const avoid = (x: number, z: number) => {
        const hit = ri?.nearest(x, z, 10, (d) => d.halfW);
        if (hit && hit.dist < hit.data.halfW + 2.5) return true;
        return !!this.index?.nearest(x, z, ROAD_HALF_WIDTH + 4);
      };
      const veg = buildVegetation(feats.veg, proj, grid, bounds, avoid, this.q.maxTrees, tile.i * 7919 + tile.j * 104729);
      if (veg) group.add(veg);
    }
    tile.group = group;
    tile.grid = grid;
    tile.data = undefined;
    tile.state = 'built';
    this.group.add(group);
    if (tile.level === 'near') this.opts.onTileBuilt?.(bounds);
  }

  private excluded(f: GeoFeature, ex: Exclusion[]): boolean {
    const polys = geoToPolys(f.geometry, this.track.proj);
    if (!polys.length) return false;
    const ring = polys[0].outer;
    let x = 0, z = 0;
    for (const [px, pz] of ring) { x += px; z += pz; }
    x /= ring.length; z /= ring.length;
    return ex.some((e) => Math.hypot(x - e.x, z - e.z) < e.r);
  }

  private dispose(tile: Tile): void {
    if (tile.group) {
      tile.group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
        else if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      this.group.remove(tile.group);
    }
    this.tiles.delete(tile.key);
    this.buildQueue = this.buildQueue.filter((t) => t !== tile);
  }

  /** Altitude du sol à une position (tuile proche aplanie de préférence). */
  groundAt(x: number, z: number): number | null {
    const s = this.q.nearTile;
    const t = this.tiles.get(`near:${Math.floor(x / s)}:${Math.floor(z / s)}`);
    if (t?.grid) return sampleGrid(t.grid, x, z);
    const sf = this.q.farTile;
    const f = this.tiles.get(`far:${Math.floor(x / sf)}:${Math.floor(z / sf)}`);
    if (f?.grid) return sampleGrid(f.grid, x, z) - 4;
    return null;
  }

  /** Vrai si une tuile proche construite couvre ce point. */
  hasNear(x: number, z: number): boolean {
    const s = this.q.nearTile;
    return !!this.tiles.get(`near:${Math.floor(x / s)}:${Math.floor(z / s)}`)?.grid;
  }

  /** Vrai si un bâtiment se trouve entre deux points (placement des caméras TV). */
  blocked(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1) return false;
    const ray = new THREE.Raycaster(a, dir.normalize(), 0, len);
    const meshes: THREE.Object3D[] = [];
    for (const t of this.tiles.values()) {
      t.group?.children.forEach((c) => { if (c.userData.kind === 'buildings') meshes.push(c); });
    }
    return ray.intersectObjects(meshes, false).length > 0;
  }

  disposeAll(): void {
    for (const t of [...this.tiles.values()]) this.dispose(t);
  }
}
