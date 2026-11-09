/**
 * Chaussée du parcours : ruban d'asphalte avec lignes de rive et ligne médiane,
 * découpé en tronçons de 400 m chargés autour du cycliste.
 */
import * as THREE from 'three';
import { MeshBuilder, type RGB } from './geometry';
import { hexLinear } from '../render/engine';
import { ROAD_HALF_WIDTH } from './terrain';
import type { Route } from '../geo/route';

const CHUNK = 80; // échantillons de 5 m → 400 m

const ASPHALT = hexLinear('#4f5257');
/** couleur de chaussée selon le revêtement (indices de SURFACES) */
const SURFACE_COLORS = [ASPHALT, hexLinear('#5d5a55'), hexLinear('#b9a27c'), hexLinear('#9c845f')];
const SHOULDER = hexLinear('#6d6a62');
const LINE = hexLinear('#e8e8e2');

export class RouteMesh {
  readonly group = new THREE.Group();
  private chunks = new Map<number, THREE.Mesh>();
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });

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
        mesh.geometry.dispose();
        this.group.remove(mesh);
        this.chunks.delete(c);
      }
    }
  }

  /** Tout reconstruire (par exemple après réception de l'altitude IGN). */
  rebuild(): void {
    for (const mesh of this.chunks.values()) {
      mesh.geometry.dispose();
      this.group.remove(mesh);
    }
    this.chunks.clear();
  }

  private buildChunk(c: number): THREE.Mesh | null {
    const r = this.route;
    const a = c * CHUNK, b = Math.min(r.n - 1, a + CHUNK);
    if (b <= a) return null;
    const mb = new MeshBuilder();
    const up: [number, number, number] = [0, 1, 0];
    const W = ROAD_HALF_WIDTH;
    // Bande [o0, o1] (décalages latéraux en m, gauche négatif) à la hauteur h au-dessus de la route.
    const band = (o0: number, o1: number, lift: number, color: RGB | null, dash = false) => {
      for (let i = a; i < b; i++) {
        if (dash && Math.floor(r.dist[i] / 6) % 2 === 1) continue;
        // les lignes blanches ne sont peintes que sur le bitume
        if (color === LINE && r.surface[i] > 1) continue;
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
    band(-W, W, 0.08, null);
    band(-W + 0.15, -W + 0.3, 0.1, LINE);
    band(W - 0.3, W - 0.15, 0.1, LINE);
    band(-0.07, 0.07, 0.1, LINE, true);
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
    const geo = mb.build();
    if (!geo) return null;
    const m = new THREE.Mesh(geo, this.material);
    m.receiveShadow = true;
    return m;
  }

  dispose(): void {
    this.rebuild();
    this.material.dispose();
  }
}
