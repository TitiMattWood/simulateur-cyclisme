/**
 * Réseau routier pour le trajet libre, construit à la volée à partir des tronçons de
 * route de la BD TOPO (IGN). Les tronçons sont « topologiques » : deux tronçons qui se
 * croisent partagent exactement le même point d'extrémité, qui devient un carrefour.
 * Un pont qui passe au-dessus d'une route n'est pas relié à elle, ce qui est juste.
 */
import type { GeoFeature } from '../geo/ign';
import type { LocalProjection } from '../geo/projection';
import type { SurfaceId } from '../physics/equipment';
import { geoToLines, SegmentIndex } from './geometry';

export interface RoadClass {
  /** largeur par défaut (m) si la BD TOPO ne la donne pas */
  width: number;
  color: string;
  surface: SurfaceId;
  /** praticable à vélo dans le jeu */
  rideable: boolean;
}

/** Classes de route de la BD TOPO (attribut « nature »). */
export const ROAD_CLASSES: Record<string, RoadClass> = {
  'Type autoroutier': { width: 11, color: '#4d5055', surface: 'asphalt', rideable: false },
  'Route à 2 chaussées': { width: 7, color: '#55585d', surface: 'asphalt', rideable: true },
  'Route à 1 chaussée': { width: 5.5, color: '#5b5e63', surface: 'asphalt', rideable: true },
  'Bretelle': { width: 5, color: '#55585d', surface: 'asphalt', rideable: true },
  'Rond-point': { width: 7, color: '#5b5e63', surface: 'asphalt', rideable: true },
  'Piste cyclable': { width: 2.5, color: '#8c5e52', surface: 'asphalt', rideable: true },
  'Route empierrée': { width: 3.5, color: '#a9967a', surface: 'gravel', rideable: true },
  'Chemin': { width: 3, color: '#b9a27c', surface: 'gravel', rideable: true },
  'Sentier': { width: 1.6, color: '#9c845f', surface: 'dirt', rideable: true },
};

/** Propriétés BD TOPO demandées pour les routes (identiques partout → réponses partagées en cache). */
export const ROAD_PROPS = [
  'nature', 'largeur_de_chaussee', 'position_par_rapport_au_sol', 'sens_de_circulation',
  'importance', 'nom_collaboratif_gauche', 'nom_collaboratif_droite', 'urbain',
];

/**
 * Revêtement estimé. La BD TOPO ne décrit pas le revêtement : un « chemin » ou un
 * « sentier » en agglomération est le plus souvent une allée revêtue (pavés, dalles,
 * enrobé) ; hors agglomération, c'est du gravier ou de la terre.
 */
export function surfaceOf(props: Record<string, unknown>): SurfaceId {
  const c = ROAD_CLASSES[String(props.nature)];
  if (!c) return 'asphalt';
  const urban = props.urbain === true || props.urbain === 'true';
  if (c.surface !== 'asphalt' && urban) return 'rough';
  return c.surface;
}

/** Couleur de la chaussée selon le revêtement estimé. */
export function roadColor(props: Record<string, unknown>): string {
  const c = ROAD_CLASSES[String(props.nature)];
  if (!c) return '#5b5e63';
  return surfaceOf(props) === 'rough' ? '#8a8781' : c.color;
}

export function roadWidth(props: Record<string, unknown>): number {
  const c = ROAD_CLASSES[String(props.nature)];
  const w = Number(props.largeur_de_chaussee);
  return w > 0 ? Math.min(w, 14) : c?.width ?? 4;
}

export interface RoadEdge {
  id: string;
  /** clés des carrefours aux deux extrémités */
  a: string;
  b: string;
  pts: Array<[number, number]>;
  /** altitude BD TOPO de chaque point (NaN si inconnue) — sert pour les tabliers de pont */
  zs: number[];
  /** distance cumulée le long de pts */
  cum: number[];
  len: number;
  nature: string;
  surface: SurfaceId;
  width: number;
  name: string;
  /** 1 = route principale … 6 = desserte locale */
  importance: number;
  bridge: boolean;
  /** 1 = sens unique a→b, −1 = sens unique b→a, 0 = double sens */
  oneway: number;
}

export interface RoadNode {
  key: string;
  x: number;
  z: number;
  edges: RoadEdge[];
}

const nodeKey = (x: number, z: number) => `${Math.round(x * 4)}:${Math.round(z * 4)}`;

export class RoadNetwork {
  readonly nodes = new Map<string, RoadNode>();
  readonly edges = new Map<string, RoadEdge>();
  private index = new SegmentIndex<{ edge: RoadEdge; i: number }>(30);

  constructor(readonly proj: LocalProjection) {}

  /** Ajoute les tronçons d'une tuile (les doublons entre tuiles voisines sont ignorés). */
  ingest(features: GeoFeature[]): number {
    let added = 0;
    for (const f of features) {
      if (this.edges.has(f.id)) continue;
      const p = f.properties;
      const cls = ROAD_CLASSES[String(p.nature)];
      if (!cls?.rideable) continue;
      if (Number(p.position_par_rapport_au_sol ?? 0) < 0) continue; // tunnels
      const lines = geoToLines(f.geometry, this.proj);
      lines.forEach((line, li) => {
        if (line.length < 2) return;
        const pts = line.map(([x, , z]) => [x, z] as [number, number]);
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        const len = cum[cum.length - 1];
        if (len < 0.5) return;
        const sens = String(p.sens_de_circulation ?? '');
        const imp = parseInt(String(p.importance), 10);
        const edge: RoadEdge = {
          id: lines.length > 1 ? `${f.id}#${li}` : f.id,
          a: nodeKey(pts[0][0], pts[0][1]),
          b: nodeKey(pts[pts.length - 1][0], pts[pts.length - 1][1]),
          pts, cum, len,
          zs: line.map(([, h]) => h),
          nature: String(p.nature),
          surface: surfaceOf(p),
          width: roadWidth(p),
          name: String(p.nom_collaboratif_gauche ?? p.nom_collaboratif_droite ?? '').trim(),
          importance: Number.isFinite(imp) ? imp : 6,
          bridge: Number(p.position_par_rapport_au_sol ?? 0) > 0,
          oneway: sens === 'Sens direct' ? 1 : sens === 'Sens inverse' ? -1 : 0,
        };
        if (edge.name === 'null') edge.name = '';
        this.edges.set(edge.id, edge);
        for (const [k, [x, z]] of [[edge.a, pts[0]], [edge.b, pts[pts.length - 1]]] as const) {
          let n = this.nodes.get(k);
          if (!n) this.nodes.set(k, (n = { key: k, x, z, edges: [] }));
          n.edges.push(edge);
        }
        for (let i = 0; i < pts.length - 1; i++) this.index.add(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], { edge, i });
        added++;
      });
    }
    return added;
  }

  /** Tronçon le plus proche d'un point, avec la position s (m) le long du tronçon. */
  nearest(x: number, z: number, maxDist: number): { edge: RoadEdge; s: number; dist: number } | null {
    const hit = this.index.nearest(x, z, maxDist);
    if (!hit) return null;
    const { edge, i } = hit.data;
    const segLen = edge.cum[i + 1] - edge.cum[i];
    return { edge, s: edge.cum[i] + segLen * hit.t, dist: hit.dist };
  }

  /** Position et direction (sens a→b) à la distance s le long d'un tronçon. */
  pointAt(edge: RoadEdge, s: number): { x: number; z: number; dirX: number; dirZ: number } {
    const c = edge.cum;
    const u = Math.max(0, Math.min(edge.len, s));
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (c[mid] <= u) lo = mid; else hi = mid;
    }
    const [ax, az] = edge.pts[lo], [bx, bz] = edge.pts[lo + 1] ?? edge.pts[lo];
    const l = c[lo + 1] - c[lo] || 1;
    const t = (u - c[lo]) / l;
    const dx = bx - ax, dz = bz - az;
    const dl = Math.hypot(dx, dz) || 1;
    return { x: ax + dx * t, z: az + dz * t, dirX: dx / dl, dirZ: dz / dl };
  }

  /** Altitude BD TOPO interpolée à la distance s (NaN si inconnue). */
  zAt(edge: RoadEdge, s: number): number {
    const c = edge.cum;
    const u = Math.max(0, Math.min(edge.len, s));
    let i = 0;
    while (i < c.length - 2 && c[i + 1] < u) i++;
    const t = (u - c[i]) / (c[i + 1] - c[i] || 1);
    return edge.zs[i] + (edge.zs[i + 1] - edge.zs[i]) * t;
  }

  /** Tronçons dans un rayon (pour la mini-carte). */
  *edgesNear(x: number, z: number, radius: number): Generator<RoadEdge> {
    for (const e of this.edges.values()) {
      const p0 = e.pts[0], p1 = e.pts[e.pts.length - 1];
      const m = e.pts[e.pts.length >> 1];
      if (Math.min(Math.hypot(p0[0] - x, p0[1] - z), Math.hypot(p1[0] - x, p1[1] - z), Math.hypot(m[0] - x, m[1] - z)) < radius + e.len / 2) yield e;
    }
  }
}
