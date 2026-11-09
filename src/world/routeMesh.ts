/**
 * Chaussée du parcours : ruban d'asphalte avec lignes de rive et ligne médiane,
 * découpé en tronçons de 400 m chargés autour du cycliste.
 */
import * as THREE from 'three';
import { MeshBuilder, type RGB } from './geometry';
import { hexLinear } from '../render/engine';
import { ROAD_HALF_WIDTH } from './terrain';
import type { Route } from '../geo/route';
import { roadAtlas, roadU, ROAD_PERIOD } from './textures';

const CHUNK = 80; // échantillons de 5 m → 400 m

const ASPHALT = hexLinear('#4f5257');
/** couleur de chaussée selon le revêtement (indices de SURFACES) */
const SURFACE_COLORS = [ASPHALT, hexLinear('#5d5a55'), hexLinear('#b9a27c'), hexLinear('#9c845f')];
const SHOULDER = hexLinear('#6d6a62');

export class RouteMesh {
  readonly group = new THREE.Group();
  private chunks = new Map<number, THREE.Group>();
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  /** chaussée texturée (enrobé, marquage) : même atlas que les rues du monde */
  private asphalt = new THREE.MeshStandardMaterial({ map: roadAtlas(), vertexColors: true, roughness: 0.92, metalness: 0 });

  constructor(private readonly route: Route) {}

  /** Charge les tronçons à moins de `radius` mètres (le long du parcours) de la distance d. */
  update(d: number, radius = 2500): void {
    const r = this.route;
    const first = Math.max(0, Math.floor(r.indexAt(d - radius) / CHUNK));
    const last = Math.floor(r.indexAt(d + radius) / CHUNK);
    for (let c = first; c <= last; c++) {
      if (!this.chunks.has(c)) {
        const mesh = this.buildChunk(c);
        if (mesh) {
          this.chunks.set(c, mesh);
          this.group.add(mesh);
        }
      }
    }
    for (const [c, mesh] of this.chunks) {
      if (c < first - 1 || c > last + 1) {
        disposeGroup(mesh);
        this.group.remove(mesh);
        this.chunks.delete(c);
      }
    }
  }

  /** Tout reconstruire (par exemple après réception de l'altitude IGN). */
  rebuild(): void {
    for (const mesh of this.chunks.values()) {
      disposeGroup(mesh);
      this.group.remove(mesh);
    }
    this.chunks.clear();
  }

  private buildChunk(c: number): THREE.Group | null {
    const r = this.route;
    const a = c * CHUNK, b = Math.min(r.n - 1, a + CHUNK);
    if (b <= a) return null;
    const mb = new MeshBuilder();
    const up: [number, number, number] = [0, 1, 0];
    const W = ROAD_HALF_WIDTH;
    // Bande [o0, o1] (décalages latéraux en m, gauche négatif) à la hauteur h au-dessus de la route.
    const band = (o0: number, o1: number, lift: number, color: RGB | null) => {
      for (let i = a; i < b; i++) {
        const pts = [i, i + 1].map((k) => {
          const nx = -r.dirZ[k], nz = r.dirX[k]; // normale à droite du sens de marche
          const y = r.ele[k] + lift;
          return [
            [r.x[k] + nx * o0, y, r.z[k] + nz * o0],
            [r.x[k] + nx * o1, y, r.z[k] + nz * o1],
          ];
        });
        mb.quad(pts[0][0], pts[0][1], pts[1][1], pts[1][0], color ?? SURFACE_COLORS[r.surface[i]] ?? ASPHALT, up);
      }
    };
    band(-W - 0.6, W + 0.6, 0.05, SHOULDER);
    // chaussée texturée : route de campagne (marquage) sur le bitume, gravier/terre sinon
    const pos: number[] = [], uv: number[] = [], col: number[] = [];
    const gravelBase = hexLinear('#c8b896');
    for (let i = a; i < b; i++) {
      const s = r.surface[i];
      const column = s <= 1 ? 0 : 3;
      const base = SURFACE_COLORS[s] ?? ASPHALT;
      const tint: RGB = column === 3 ? [base[0] / gravelBase[0], base[1] / gravelBase[1], base[2] / gravelBase[2]] : s === 1 ? [0.92, 0.9, 0.88] : [1, 1, 1];
      const P = (k: number, o: number) => [r.x[k] - r.dirZ[k] * o, r.ele[k] + 0.08, r.z[k] + r.dirX[k] * o];
      const v0 = r.dist[i] / ROAD_PERIOD, v1 = r.dist[i + 1] / ROAD_PERIOD;
      const A = P(i, -W), B = P(i, W), C = P(i + 1, W), D = P(i + 1, -W);
      const uA: [number, number] = [roadU(column, 0), v0], uB: [number, number] = [roadU(column, 1), v0];
      const uC: [number, number] = [roadU(column, 1), v1], uD: [number, number] = [roadU(column, 0), v1];
      for (const [p, t] of [[A, uA], [C, uC], [B, uB], [A, uA], [D, uD], [C, uC]] as Array<[number[], [number, number]]>) {
        pos.push(p[0], p[1], p[2]);
        uv.push(t[0], t[1]);
        col.push(tint[0], tint[1], tint[2]);
      }
    }
    // Talus : petites joues verticales qui masquent l'éventuel raccord avec le terrain.
    for (const side of [-1, 1]) {
      for (let i = a; i < b; i++) {
        const q = [i, i + 1].map((k) => {
          const nx = -r.dirZ[k] * side * (W + 0.6), nz = r.dirX[k] * side * (W + 0.6);
          return [r.x[k] + nx, r.ele[k] + 0.05, r.z[k] + nz];
        });
        const lo = q.map((p) => [p[0], p[1] - 1.5, p[2]]);
        mb.quad(q[0], q[1], lo[1], lo[0], SHOULDER, [-r.dirZ[i] * side, 0, r.dirX[i] * side]);
      }
    }
    const out = new THREE.Group();
    const geo = mb.build();
    if (geo) {
      const m = new THREE.Mesh(geo, this.material);
      m.receiveShadow = true;
      out.add(m);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.asphalt);
      m.receiveShadow = true;
      out.add(m);
    }
    return out.children.length ? out : null;
  }

  dispose(): void {
    this.rebuild();
    this.material.dispose();
  }
}

function disposeGroup(g: THREE.Group): void {
  for (const o of g.children) if (o instanceof THREE.Mesh) o.geometry.dispose();
}
