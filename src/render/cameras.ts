/**
 * Les 5 caméras du jeu :
 *  1. Action cam  : fixée sur la poitrine, grand angle, on voit le guidon et les mains.
 *  2. Cockpit     : vue des yeux du cycliste (1re personne).
 *  3. Poursuite   : derrière le cycliste (3e personne) ; touche B = coup d'œil arrière.
 *  4. Drone       : vue aérienne qui suit avec un léger retard.
 *  5. Réalisation TV : plans automatiques (bord de route, moto, hélicoptère).
 */
import * as THREE from 'three';
import type { Track } from '../geo/track';
import type { RiderModel } from './riderModel';

export type CamMode = 'action' | 'cockpit' | 'chase' | 'drone' | 'tv';
export const CAM_MODES: CamMode[] = ['action', 'cockpit', 'chase', 'drone', 'tv'];

interface TvShot {
  kind: 'roadside' | 'moto' | 'helico';
  pos: THREE.Vector3;
  /** distance sur le parcours où se trouve la caméra */
  d: number;
  side: number;
  t: number;
}

export interface CamContext {
  rider: RiderModel;
  route: Track;
  dist: number;
  groundAt: (x: number, z: number) => number | null;
  /** vrai si un obstacle (bâtiment) coupe la ligne de vue entre deux points */
  blocked: (a: THREE.Vector3, b: THREE.Vector3) => boolean;
}

const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.08, 45000);
  mode: CamMode = 'chase';
  lookBack = false;
  private pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private ready = false;
  private tv: TvShot | null = null;
  private shotCount = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  setMode(m: CamMode): void {
    this.mode = m;
    this.ready = false;
    this.tv = null;
  }

  next(): CamMode {
    const i = CAM_MODES.indexOf(this.mode);
    this.setMode(CAM_MODES[(i + 1) % CAM_MODES.length]);
    return this.mode;
  }

  update(dt: number, ctx: CamContext): void {
    const { rider } = ctx;
    rider.root.updateMatrixWorld(true);
    const body = rider.body;
    const root = rider.root;
    const cam = this.camera;
    rider.setHeadVisible(this.mode !== 'cockpit');
    let fov = 60;
    let desiredPos: THREE.Vector3, desiredTarget: THREE.Vector3;
    let kPos = 8, kTarget = 12;

    switch (this.mode) {
      case 'action':
        desiredPos = body.localToWorld(this.tmp.copy(rider.chest));
        desiredTarget = body.localToWorld(this.tmp2.set(3.5, 0.55, 0));
        fov = 92;
        kPos = kTarget = 40;
        break;
      case 'cockpit':
        desiredPos = body.localToWorld(this.tmp.copy(rider.eye));
        desiredTarget = body.localToWorld(this.tmp2.set(12, 1.0, 0));
        fov = 72;
        kPos = kTarget = 40;
        break;
      case 'drone':
        desiredPos = root.localToWorld(this.tmp.set(-16, 13, 7));
        desiredTarget = root.localToWorld(this.tmp2.set(4, 1, 0));
        fov = 55;
        kPos = 1.6;
        kTarget = 4;
        break;
      case 'tv':
        ({ desiredPos, desiredTarget, fov } = this.tvShot(dt, ctx));
        kPos = kTarget = this.tv?.kind === 'roadside' ? 1000 : 6;
        break;
      case 'chase':
      default:
        if (this.lookBack) {
          desiredPos = root.localToWorld(this.tmp.set(5.5, 1.7, 0.4));
          desiredTarget = root.localToWorld(this.tmp2.set(-2, 1.0, 0));
        } else {
          desiredPos = root.localToWorld(this.tmp.set(-4.6, 2.1, 0));
          desiredTarget = root.localToWorld(this.tmp2.set(2.5, 1.0, 0));
        }
        fov = 60;
        break;
    }
    // La caméra ne descend jamais sous le sol.
    const g = ctx.groundAt(desiredPos.x, desiredPos.z);
    if (g !== null && this.mode !== 'action' && this.mode !== 'cockpit') desiredPos.y = Math.max(desiredPos.y, g + 0.8);

    if (!this.ready) {
      this.pos.copy(desiredPos);
      this.target.copy(desiredTarget);
      this.ready = true;
    } else {
      this.pos.lerp(desiredPos, damp(kPos, dt));
      this.target.lerp(desiredTarget, damp(kTarget, dt));
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.target);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * (this.mode === 'tv' ? 1 : damp(6, dt));
      cam.updateProjectionMatrix();
    }
  }

  /** Réalisation TV : enchaîne des plans comme une retransmission de course. */
  private tvShot(dt: number, ctx: CamContext): { desiredPos: THREE.Vector3; desiredTarget: THREE.Vector3; fov: number } {
    const { route, dist, rider } = ctx;
    const riderPos = rider.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.1, 0));
    const needNew = !this.tv
      || (this.tv.kind === 'roadside' && (dist > this.tv.d + 12 || this.tv.t > 30))
      || (this.tv.kind !== 'roadside' && this.tv.t > 9);
    if (needNew) {
      const seq: TvShot['kind'][] = ['roadside', 'roadside', 'moto', 'roadside', 'helico'];
      let kind = seq[this.shotCount++ % seq.length];
      const side = this.shotCount % 2 ? 1 : -1;
      this.tv = { kind, d: dist, side, t: 0, pos: new THREE.Vector3() };
      if (kind === 'roadside') {
        // Plusieurs essais : on garde le premier emplacement d'où l'on voit la route
        // (pas de bâtiment entre la caméra et le cycliste qui arrive).
        let found = false;
        for (let k = 0; k < 6 && !found; k++) {
          const d = Math.min(route.length, dist + 90 + Math.random() * 130);
          const sd = k % 2 ? -side : side;
          const s = route.sampleAt(d);
          const off = 7 + Math.random() * 9;
          const x = s.x - s.dirZ * off * sd, z = s.z + s.dirX * off * sd;
          const ground = ctx.groundAt(x, z) ?? s.ele;
          const pos = new THREE.Vector3(x, Math.max(ground, s.ele) + 1.6 + Math.random() * 3, z);
          const mid = route.sampleAt((dist + d) / 2);
          const viewA = new THREE.Vector3(mid.x, mid.ele + 1.2, mid.z);
          if (!ctx.blocked(pos, riderPos) && !ctx.blocked(pos, viewA)) {
            this.tv = { kind, d, side: sd, t: 0, pos };
            found = true;
          }
        }
        if (!found) kind = this.tv.kind = 'helico';
      }
      this.ready = false;
    }
    const shot = this.tv!;
    shot.t += dt;
    if (shot.kind === 'roadside') {
      const dd = shot.pos.distanceTo(riderPos);
      const fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(2.4 / dd)), 7, 55);
      return { desiredPos: shot.pos.clone(), desiredTarget: riderPos, fov };
    }
    if (shot.kind === 'moto') {
      const p = rider.root.localToWorld(new THREE.Vector3(7, 1.5, 2.6 * shot.side));
      return { desiredPos: p, desiredTarget: riderPos, fov: 42 };
    }
    const p = rider.root.localToWorld(new THREE.Vector3(-30, 55, 70 * shot.side));
    return { desiredPos: p, desiredTarget: riderPos, fov: 22 };
  }
}
