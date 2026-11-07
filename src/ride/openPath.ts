/**
 * Chemin du trajet libre.
 *
 * Le cycliste avance sur une suite de tronçons du réseau routier. Le chemin est toujours
 * prévu ~1,5 km à l'avance : à chaque carrefour, le jeu prend par défaut la route la plus
 * droite (en privilégiant la même rue, les routes importantes et le bitume) ; le joueur
 * peut choisir une autre direction avec ← / → avant d'y arriver, ou faire demi-tour.
 *
 * Le chemin est ré-échantillonné tous les 5 m (comme un parcours GPX) ; l'altitude vient
 * du terrain IGN déjà chargé, ce qui place la roue exactement sur la route dessinée.
 */
import { emptySample, speedLimits, SURFACES, type RouteSample } from '../geo/route';
import type { Track } from '../geo/track';
import type { LocalProjection } from '../geo/projection';
import type { RoadEdge, RoadNetwork, RoadNode } from '../world/roads';

const STEP = 5;
/** distance prévue devant le cycliste (m) */
const HORIZON = 1500;
/** historique conservé derrière (m) */
const HISTORY = 800;

interface Step {
  id: number;
  edge: RoadEdge;
  forward: boolean;
  /** abscisses de début et de fin le long du tronçon (sens a→b) */
  from: number;
  to: number;
  /** distance parcourue (globale) au début de l'étape */
  d0: number;
}

export interface TurnOption {
  edge: RoadEdge;
  forward: boolean;
  /** angle de virage en degrés : négatif = à gauche, positif = à droite */
  angle: number;
}

export interface Junction {
  node: RoadNode;
  /** distance globale du carrefour */
  d: number;
  options: TurnOption[];
  selected: number;
  /** identifiant de l'étape qui arrive au carrefour */
  stepId: number;
}

const stepLen = (s: Step) => Math.abs(s.to - s.from);

export class OpenPath implements Track {
  readonly open = true;
  readonly length = Infinity;
  name: string;
  private steps: Step[] = [];
  private nextId = 1;
  /** choix du joueur aux carrefours : id de l'étape d'arrivée → option retenue */
  private choices = new Map<number, { edgeId: string; forward: boolean }>();
  // échantillons
  private bx: number[] = [];
  private bz: number[] = [];
  private bd: number[] = [];
  private be = new Float32Array(0);
  private bg = new Float32Array(0);
  private bdx = new Float32Array(0);
  private bdz = new Float32Array(0);
  private bv = new Float32Array(0);
  private bs = new Uint8Array(0);
  private lastRefresh = 0;
  private dirty = true;

  constructor(
    private readonly net: RoadNetwork,
    readonly proj: LocalProjection,
    private readonly groundAt: (x: number, z: number) => number | null,
    start: { edge: RoadEdge; s: number; forward: boolean },
    name: string,
  ) {
    this.name = name;
    const { edge, s, forward } = start;
    this.steps.push({ id: this.nextId++, edge, forward, from: s, to: forward ? edge.len : 0, d0: 0 });
    this.extend();
    this.rebuild();
  }

  // ---------------------------------------------------------------------------
  // Planification

  private endNode(s: Step): RoadNode | undefined {
    return this.net.nodes.get(s.forward ? s.edge.b : s.edge.a);
  }

  /** direction de marche au début (start) ou à la fin (end) d'un tronçon parcouru dans un sens donné */
  private dirOf(edge: RoadEdge, forward: boolean, at: 'start' | 'end'): [number, number] {
    const p = edge.pts;
    const n = p.length;
    let a: [number, number], b: [number, number];
    if (forward) [a, b] = at === 'start' ? [p[0], p[1]] : [p[n - 2], p[n - 1]];
    else [a, b] = at === 'start' ? [p[n - 1], p[n - 2]] : [p[1], p[0]];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  /** Directions possibles en arrivant au bout d'une étape, triées de gauche à droite. */
  options(s: Step): TurnOption[] {
    const node = this.endNode(s);
    if (!node) return [];
    const [ix, iz] = this.dirOf(s.edge, s.forward, 'end');
    const out: TurnOption[] = [];
    for (const e of node.edges) {
      const dirs = e.a === e.b ? [true] : [e.a === node.key];
      for (const forward of dirs) {
        if (e === s.edge && forward !== s.forward) continue; // pas de demi-tour implicite
        const [ox, oz] = this.dirOf(e, forward, 'start');
        const angle = (Math.atan2(ix * oz - iz * ox, ix * ox + iz * oz) * 180) / Math.PI;
        out.push({ edge: e, forward, angle });
      }
    }
    return out.sort((a, b) => a.angle - b.angle);
  }

  /** Choix par défaut : le plus droit, en restant si possible sur la même rue, une route importante et revêtue. */
  private defaultChoice(s: Step, opts: TurnOption[]): number {
    let best = 0, bestScore = Infinity;
    opts.forEach((o, i) => {
      let score = Math.abs(o.angle);
      const wrongWay = (o.edge.oneway === 1 && !o.forward) || (o.edge.oneway === -1 && o.forward);
      if (wrongWay) score += 120;
      if (s.edge.name && o.edge.name === s.edge.name) score -= 25;
      score += (o.edge.importance - s.edge.importance) * 6;
      if (s.edge.surface === 'asphalt' && o.edge.surface !== 'asphalt') score += 40;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return best;
  }

  /** Prolonge le chemin jusqu'à l'horizon. */
  private extend(dist = this.currentDist()): void {
    let guard = 0;
    while (guard++ < 60) {
      const last = this.steps[this.steps.length - 1];
      const end = last.d0 + stepLen(last);
      if (end - dist > HORIZON) break;
      const node = this.endNode(last);
      if (!node) break;
      const opts = this.options(last);
      let next: TurnOption;
      if (!opts.length) {
        // impasse : demi-tour
        next = { edge: last.edge, forward: !last.forward, angle: 180 };
      } else {
        const ch = this.choices.get(last.id);
        const idx = ch ? opts.findIndex((o) => o.edge.id === ch.edgeId && o.forward === ch.forward) : -1;
        next = opts[idx >= 0 ? idx : this.defaultChoice(last, opts)];
      }
      this.steps.push({
        id: this.nextId++, edge: next.edge, forward: next.forward,
        from: next.forward ? 0 : next.edge.len, to: next.forward ? next.edge.len : 0, d0: end,
      });
      this.dirty = true;
    }
  }

  private current = 0;
  private currentDist(): number {
    return this.current;
  }

  /** Étape sur laquelle se trouve la distance d. */
  private stepAt(d: number): number {
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i];
      if (d < s.d0 + stepLen(s)) return i;
    }
    return this.steps.length - 1;
  }

  /** Prochain vrai carrefour (au moins deux directions) devant le cycliste. */
  junction(d: number, within = 300): Junction | null {
    for (let i = this.stepAt(d); i < this.steps.length - 1; i++) {
      const s = this.steps[i];
      const at = s.d0 + stepLen(s);
      if (at - d > within) return null;
      if (at < d) continue;
      const opts = this.options(s);
      if (opts.length < 2) continue;
      const nxt = this.steps[i + 1];
      const selected = opts.findIndex((o) => o.edge === nxt.edge && o.forward === nxt.forward);
      const node = this.endNode(s)!;
      return { node, d: at, options: opts, selected: Math.max(0, selected), stepId: s.id };
    }
    return null;
  }

  /** Change la direction choisie au prochain carrefour (−1 vers la gauche, +1 vers la droite). */
  choose(d: number, delta: number): void {
    const j = this.junction(d);
    if (!j || j.d - d < 2) return;
    const idx = Math.max(0, Math.min(j.options.length - 1, j.selected + delta));
    const o = j.options[idx];
    this.choices.set(j.stepId, { edgeId: o.edge.id, forward: o.forward });
    const k = this.steps.findIndex((s) => s.id === j.stepId);
    this.steps.length = k + 1; // on replanifie après ce carrefour
    this.extend(d);
    this.rebuild();
  }

  /** Demi-tour immédiat. */
  uTurn(d: number): void {
    const i = this.stepAt(d);
    const s = this.steps[i];
    const t = Math.max(0, Math.min(stepLen(s), d - s.d0));
    const u = s.forward ? s.from + t : s.from - t;
    s.to = u;
    this.steps.length = i + 1;
    this.steps.push({
      id: this.nextId++, edge: s.edge, forward: !s.forward,
      from: u, to: s.forward ? 0 : s.edge.len, d0: s.d0 + t,
    });
    this.extend(d);
    this.rebuild();
  }

  /** Tronçon sous le cycliste. */
  edgeAt(d: number): RoadEdge {
    return this.steps[this.stepAt(d)].edge;
  }

  /** À appeler à chaque image : avance, oublie l'historique lointain, prolonge, rafraîchit l'altitude. */
  update(d: number): void {
    this.current = d;
    while (this.steps.length > 1 && this.steps[0].d0 + stepLen(this.steps[0]) < d - HISTORY) {
      this.choices.delete(this.steps[0].id);
      this.steps.shift();
      this.dirty = true;
    }
    this.extend(d);
    const now = performance.now();
    if (this.dirty || now - this.lastRefresh > 700) this.rebuild();
  }

  // ---------------------------------------------------------------------------
  // Échantillonnage

  private rebuild(): void {
    this.dirty = false;
    this.lastRefresh = performance.now();
    const xs: number[] = [], zs: number[] = [], ds: number[] = [], surf: number[] = [], deck: number[] = [];
    for (const s of this.steps) {
      const L = stepLen(s);
      const count = Math.max(1, Math.ceil(L / STEP));
      for (let k = 0; k <= count; k++) {
        if (k === 0 && ds.length) continue; // jonction déjà présente
        const t = Math.min(L, k * STEP);
        const u = s.forward ? s.from + t : s.from - t;
        const p = this.net.pointAt(s.edge, u);
        xs.push(p.x); zs.push(p.z); ds.push(s.d0 + t);
        surf.push(SURFACES.indexOf(s.edge.surface));
        // pont : altitude du tablier BD TOPO (NaN si inconnue → interpolée entre les rives)
        deck.push(s.edge.bridge ? this.net.zAt(s.edge, u) : -Infinity);
      }
    }
    const n = xs.length;
    // Altitude : terrain chargé ; ponts : tablier rectiligne entre les deux rives.
    const raw = new Float32Array(n).fill(NaN);
    for (let i = 0; i < n; i++) raw[i] = deck[i] === -Infinity ? this.groundAt(xs[i], zs[i]) ?? NaN : deck[i];
    fillGaps(raw);
    const ele = gaussian(raw, ds, 8);
    const grade = new Float32Array(n), dx = new Float32Array(n), dz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      const dd = ds[b] - ds[a];
      grade[i] = dd > 0 ? Math.max(-0.3, Math.min(0.3, (ele[b] - ele[a]) / dd)) : 0;
      const vx = xs[b] - xs[a], vz = zs[b] - zs[a];
      const l = Math.hypot(vx, vz) || 1;
      dx[i] = vx / l; dz[i] = vz / l;
    }
    this.bx = xs; this.bz = zs; this.bd = ds;
    this.be = ele; this.bg = grade; this.bdx = dx; this.bdz = dz;
    this.bv = speedLimits(ds, dx, dz);
    this.bs = Uint8Array.from(surf);
  }

  sampleAt(d: number, out: RouteSample = emptySample()): RouteSample {
    const D = this.bd;
    const n = D.length;
    const dd = Math.min(Math.max(d, D[0]), D[n - 1]);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (D[mid] <= dd) lo = mid; else hi = mid;
    }
    const j = Math.min(lo + 1, n - 1);
    const span = D[j] - D[lo] || 1;
    const t = Math.min(1, Math.max(0, (dd - D[lo]) / span));
    const L = (a: ArrayLike<number>) => a[lo] + (a[j] - a[lo]) * t;
    out.x = L(this.bx);
    out.z = L(this.bz);
    out.ele = L(this.be);
    out.grade = L(this.bg);
    let vx = L(this.bdx), vz = L(this.bdz);
    const l = Math.hypot(vx, vz) || 1;
    vx /= l; vz /= l;
    out.dirX = vx;
    out.dirZ = vz;
    const ll = this.proj.toLatLon(out.x, out.z);
    out.lat = ll.lat;
    out.lon = ll.lon;
    out.vmax = Math.min(this.bv[lo], this.bv[j]);
    out.dist = dd;
    out.index = lo;
    out.surface = SURFACES[this.bs[t < 0.5 ? lo : j]];
    return out;
  }

  /** Points du chemin prévu entre deux distances (pour la mini-carte et le profil). */
  window(d0: number, d1: number): Array<{ x: number; z: number; d: number; ele: number; grade: number }> {
    const out = [];
    for (let i = 0; i < this.bd.length; i++) {
      if (this.bd[i] < d0 || this.bd[i] > d1) continue;
      out.push({ x: this.bx[i], z: this.bz[i], d: this.bd[i], ele: this.be[i], grade: this.bg[i] });
    }
    return out;
  }
}

/** Remplace les valeurs inconnues (NaN) par interpolation entre voisins connus. */
function fillGaps(v: Float32Array): void {
  const n = v.length;
  let prev = -1;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(v[i])) continue;
    if (prev < 0) for (let q = 0; q < i; q++) v[q] = v[i];
    else for (let q = prev + 1; q < i; q++) v[q] = v[prev] + ((v[i] - v[prev]) * (q - prev)) / (i - prev);
    prev = i;
  }
  if (prev < 0) v.fill(0);
  else for (let q = prev + 1; q < n; q++) v[q] = v[prev];
}

function gaussian(v: Float32Array, d: number[], sigma: number): Float32Array {
  const n = v.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, w = 0;
    for (let j = Math.max(0, i - 8); j <= Math.min(n - 1, i + 8); j++) {
      const k = Math.exp(-((d[j] - d[i]) ** 2) / (2 * sigma * sigma));
      s += v[j] * k;
      w += k;
    }
    out[i] = s / w;
  }
  return out;
}
