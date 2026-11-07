/**
 * Tableau de bord affiché pendant la sortie : puissance, vitesse, cadence, cardio,
 * pente, distance, temps, profil et mini-carte.
 *
 * En trajet libre : mini-carte orientée dans le sens de la marche avec les routes
 * autour, panneau du prochain carrefour (← / → pour choisir, U pour faire demi-tour)
 * et nom de la route.
 */
import type { Route } from '../geo/route';
import type { Track } from '../geo/track';
import type { SurfaceId } from '../physics/equipment';
import type { RoadNetwork } from '../world/roads';
import type { OpenPath } from '../ride/openPath';
import { t, type I18nKey } from '../i18n';
import { escapeHtml, fmtKm, fmtNum, fmtTime, gradeColor, powerZone } from './format';

export interface HudState {
  power: number;
  power3s: number;
  weightKg: number;
  ftp: number;
  speed: number; // m/s
  cadence: number;
  hr: number;
  hrMax: number;
  dist: number;
  elapsed: number;
  ascent: number;
  grade: number;
  ele: number;
  braking: boolean;
  demo: boolean;
  camera: string;
  trainer: string;
  hrSensor: string;
  /** rapport virtuel engagé (vide en changement de vitesse manuel) */
  gear: string;
  surface: SurfaceId;
  /** cap (radians, dans le plan x-z) */
  heading: number;
  x: number;
  z: number;
}

const SURFACE_MAP_COLOR: Record<SurfaceId, string> = {
  asphalt: 'rgba(255,255,255,0.55)', rough: 'rgba(220,220,220,0.5)', gravel: 'rgba(214,186,130,0.75)', dirt: 'rgba(170,135,90,0.75)',
};

export class Hud {
  readonly el: HTMLElement;
  private q: Record<string, HTMLElement> = {};
  private profile: HTMLCanvasElement;
  private map: HTMLCanvasElement;
  private profileBg: ImageData | null = null;
  private mapBg: ImageData | null = null;
  private lastProfile = 0;
  private visible = true;
  private lastTurnKey = '';

  constructor(
    parent: HTMLElement,
    private readonly track: Track,
    private readonly open: { net: RoadNetwork; path: OpenPath } | null,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud-top">
        <div class="hud-box hud-left">
          <div class="metric"><span data-q="speed">0</span><small>km/h</small></div>
          <div class="metric"><span data-q="cadence">0</span><small>${t('hud.rpm')}</small></div>
          <div class="metric"><span data-q="hr">--</span><small>${t('hud.bpm')}</small></div>
        </div>
        <div class="hud-center">
          <div class="hud-box hud-power">
            <div class="power-main"><span data-q="power">0</span><small>W</small></div>
            <div class="power-sub"><span data-q="wkg">0,0</span> W/kg · 3s <span data-q="p3">0</span> W · Z<span data-q="zone">1</span></div>
            <div class="zone-bar"><div data-q="zonebar"></div></div>
          </div>
          <div class="hud-box hud-turn" data-q="turn"></div>
        </div>
        <div class="hud-box hud-right">
          <div class="metric"><span data-q="dist">0,00</span><small>km${open ? '' : ` / <span data-q="total"></span>`}</small></div>
          <div class="metric"><span data-q="time">0:00</span><small>${t('hud.time')}</small></div>
          <div class="metric"><span data-q="ascent">0</span><small>m D+</small></div>
        </div>
      </div>
      <div class="hud-grade" data-q="gradebox"><span data-q="grade">0,0</span><small>%</small><div class="alt"><span data-q="ele">0</span> m</div></div>
      <canvas class="hud-map" width="180" height="180"></canvas>
      <div class="hud-status">
        <span data-q="trainer"></span><span data-q="hrs"></span><span data-q="gear" class="gear"></span>
        <span data-q="surface" class="surface"></span><span data-q="road" class="road"></span><span data-q="cam"></span>
        <span class="demo" data-q="demo">${t('hud.demo')}</span>
        <span class="braking" data-q="braking">${t('hud.braking')}</span>
      </div>
      <canvas class="hud-profile"></canvas>`;
    parent.appendChild(this.el);
    this.el.querySelectorAll<HTMLElement>('[data-q]').forEach((n) => (this.q[n.dataset.q!] = n));
    this.profile = this.el.querySelector('.hud-profile')!;
    this.map = this.el.querySelector('.hud-map')!;
    if (this.q.total) this.q.total.textContent = fmtKm(track.length, 1);
    this.q.turn.style.display = 'none';
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
  }

  update(s: HudState): void {
    const q = this.q;
    q.speed.textContent = fmtNum(s.speed * 3.6, 1);
    q.cadence.textContent = fmtNum(s.cadence);
    q.hr.textContent = s.hr > 0 ? fmtNum(s.hr) : '--';
    q.hr.style.color = s.hr > 0.9 * s.hrMax ? '#ef4444' : s.hr > 0.8 * s.hrMax ? '#f97316' : '';
    q.power.textContent = fmtNum(s.power);
    q.wkg.textContent = fmtNum(s.power / s.weightKg, 1);
    q.p3.textContent = fmtNum(s.power3s);
    const z = powerZone(s.power3s, s.ftp);
    q.zone.textContent = String(z.zone);
    q.zonebar.style.width = `${Math.min(100, (s.power3s / (s.ftp * 1.5)) * 100)}%`;
    q.zonebar.style.background = z.color;
    q.power.style.color = z.color;
    q.dist.textContent = fmtKm(s.dist);
    q.time.textContent = fmtTime(s.elapsed);
    q.ascent.textContent = fmtNum(s.ascent);
    q.grade.textContent = fmtNum(s.grade * 100, 1);
    q.gradebox.style.borderColor = gradeColor(s.grade);
    q.grade.style.color = gradeColor(s.grade);
    q.ele.textContent = fmtNum(s.ele);
    q.trainer.textContent = s.trainer;
    q.hrs.textContent = s.hrSensor;
    q.cam.textContent = s.camera;
    q.gear.textContent = s.gear;
    q.surface.textContent = s.surface === 'asphalt' ? '' : t(`surface.${s.surface}` as I18nKey);
    q.demo.style.display = s.demo ? '' : 'none';
    q.braking.style.display = s.braking ? '' : 'none';
    if (this.open) {
      q.road.textContent = this.open.path.edgeAt(s.dist).name;
      this.updateTurn(s.dist);
    }

    const now = performance.now();
    if (now - this.lastProfile > 250) {
      this.lastProfile = now;
      if (this.open) {
        this.drawOpenProfile(s.dist);
        this.drawOpenMap(s);
      } else {
        this.drawProfile(s.dist);
        this.drawMap(s.dist);
      }
    }
  }

  /** Panneau du prochain carrefour : flèches des directions possibles, la choisie en surbrillance. */
  private updateTurn(dist: number): void {
    const j = this.open!.path.junction(dist, 250);
    const el = this.q.turn;
    if (!j) {
      el.style.display = 'none';
      this.lastTurnKey = '';
      return;
    }
    el.style.display = '';
    const key = `${j.stepId}:${j.selected}:${Math.round((j.d - dist) / 10)}`;
    if (key === this.lastTurnKey) return;
    this.lastTurnKey = key;
    const sel = j.options[j.selected];
    el.innerHTML = `
      <div class="turn-dist">${t('turn.in', { m: Math.max(0, Math.round((j.d - dist) / 10) * 10) })}</div>
      <div class="turn-arrows">${j.options.map((o, i) => `<span class="arrow ${i === j.selected ? 'sel' : ''}" style="transform:rotate(${Math.round(o.angle)}deg)">↑</span>`).join('')}</div>
      <div class="turn-name">${escapeHtml(sel?.edge.name || t(`nature.${sel?.edge.surface ?? 'asphalt'}` as I18nKey))}</div>
      <div class="turn-keys">${t('turn.keys')}</div>`;
  }

  /** Profil du chemin prévu : 500 m derrière, 1,5 km devant. */
  private drawOpenProfile(dist: number): void {
    const c = this.profile;
    const w = c.clientWidth * devicePixelRatio, h = c.clientHeight * devicePixelRatio;
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    const pts = this.open!.path.window(dist - 500, dist + 1500);
    if (pts.length < 2) return;
    let minE = Infinity, maxE = -Infinity;
    for (const p of pts) { minE = Math.min(minE, p.ele); maxE = Math.max(maxE, p.ele); }
    maxE = Math.max(maxE, minE + 20);
    const X = (d: number) => ((d - (dist - 500)) / 2000) * w;
    const Y = (e: number) => h - 6 - ((e - minE) / (maxE - minE)) * (h - 22);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      ctx.fillStyle = gradeColor(a.grade);
      ctx.globalAlpha = a.d < dist ? 0.4 : 0.85;
      ctx.beginPath();
      ctx.moveTo(X(a.d), h); ctx.lineTo(X(a.d), Y(a.ele)); ctx.lineTo(X(b.d), Y(b.ele)); ctx.lineTo(X(b.d), h);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const j = this.open!.path.junction(dist, 1500);
    if (j) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(X(j.d), 0); ctx.lineTo(X(j.d), h); ctx.stroke();
      ctx.setLineDash([]);
    }
    const cur = this.track.sampleAt(dist);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(X(dist), Y(cur.ele), 5 * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${11 * devicePixelRatio}px system-ui, sans-serif`;
    ctx.fillText(`${Math.round(maxE)} m`, 6, 14 * devicePixelRatio);
    ctx.fillText(t('hud.ahead'), w - 110 * devicePixelRatio, 14 * devicePixelRatio);
  }

  /** Mini-carte orientée dans le sens de marche : routes alentour, chemin prévu en orange. */
  private drawOpenMap(s: HudState): void {
    const c = this.map;
    const ctx = c.getContext('2d')!;
    const R = 320; // rayon affiché (m)
    const S = (c.width / 2 - 6) / R;
    const cx = c.width / 2, cy = c.height / 2 + 20;
    const dX = Math.cos(s.heading), dZ = Math.sin(s.heading);
    // coordonnées écran : « devant » vers le haut, « droite » vers la droite
    const P = (x: number, z: number): [number, number] => {
      const rx = x - s.x, rz = z - s.z;
      const fwd = rx * dX + rz * dZ;
      const right = rx * -dZ + rz * dX;
      return [cx + right * S, cy - fwd * S];
    };
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const e of this.open!.net.edgesNear(s.x, s.z, R * 1.3)) {
      ctx.strokeStyle = SURFACE_MAP_COLOR[e.surface];
      ctx.lineWidth = e.importance <= 3 ? 4 : e.surface === 'asphalt' ? 2.5 : 1.8;
      ctx.beginPath();
      e.pts.forEach(([x, z], i) => {
        const [u, v] = P(x, z);
        if (i === 0) ctx.moveTo(u, v); else ctx.lineTo(u, v);
      });
      ctx.stroke();
    }
    const plan = this.open!.path.window(s.dist, s.dist + 700);
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 4;
    ctx.beginPath();
    plan.forEach((p, i) => {
      const [u, v] = P(p.x, p.z);
      if (i === 0) ctx.moveTo(u, v); else ctx.lineTo(u, v);
    });
    ctx.stroke();
    // le cycliste
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 6, cy + 6); ctx.lineTo(cx, cy + 2); ctx.lineTo(cx - 6, cy + 6);
    ctx.closePath();
    ctx.fill();
  }

  /** Profil d'altitude du parcours GPX, coloré par la pente, avec la position actuelle. */
  private drawProfile(dist: number): void {
    const c = this.profile;
    const w = c.clientWidth * devicePixelRatio, h = c.clientHeight * devicePixelRatio;
    if (!w || !h) return;
    const ctx = c.getContext('2d')!;
    const r = this.track as Route;
    const minE = r.minEle, maxE = Math.max(r.maxEle, minE + 30);
    const X = (d: number) => (d / r.length) * w;
    const Y = (e: number) => h - 6 - ((e - minE) / (maxE - minE)) * (h - 22);
    if (c.width !== w || c.height !== h || !this.profileBg) {
      c.width = w;
      c.height = h;
      ctx.clearRect(0, 0, w, h);
      const stepPx = 2;
      for (let px = 0; px < w; px += stepPx) {
        const d = (px / w) * r.length;
        const smp = r.sampleAt(d);
        ctx.fillStyle = gradeColor(smp.grade);
        ctx.globalAlpha = 0.85;
        ctx.fillRect(px, Y(smp.ele), stepPx, h - Y(smp.ele));
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `${11 * devicePixelRatio}px system-ui, sans-serif`;
      ctx.fillText(`${Math.round(maxE)} m`, 6, 14 * devicePixelRatio);
      ctx.fillText(`${Math.round(minE)} m`, 6, h - 8);
      this.profileBg = ctx.getImageData(0, 0, w, h);
    }
    ctx.putImageData(this.profileBg, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, X(dist), h);
    const smp = r.sampleAt(dist);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(X(dist), Y(smp.ele), 5 * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Mini-carte du parcours GPX (nord en haut). */
  private drawMap(dist: number): void {
    const c = this.map;
    const ctx = c.getContext('2d')!;
    const r = this.track as Route;
    const { minX, maxX, minZ, maxZ } = r.bbox;
    const span = Math.max(maxX - minX, maxZ - minZ) || 1;
    const pad = 14;
    const S = (c.width - 2 * pad) / span;
    const ox = pad + (c.width - 2 * pad - (maxX - minX) * S) / 2;
    const oz = pad + (c.height - 2 * pad - (maxZ - minZ) * S) / 2;
    const P = (x: number, z: number) => [ox + (x - minX) * S, oz + (z - minZ) * S];
    if (!this.mapBg) {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const step = Math.max(1, Math.floor(r.n / 600));
      for (let i = 0; i < r.n; i += step) {
        const [x, y] = P(r.x[i], r.z[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const [sx, sy] = P(r.x[0], r.z[0]);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(sx - 4, sy - 4, 8, 8);
      this.mapBg = ctx.getImageData(0, 0, c.width, c.height);
    }
    ctx.putImageData(this.mapBg, 0, 0);
    const s = r.sampleAt(dist);
    const [x, y] = P(s.x, s.z);
    ctx.fillStyle = '#f97316';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  dispose(): void {
    this.el.remove();
  }
}
