/**
 * Tableau de bord affiché pendant la sortie : puissance, vitesse, cadence, cardio,
 * pente, distance, temps, profil du parcours et mini-carte.
 */
import type { Route } from '../geo/route';
import { t } from '../i18n';
import { fmtKm, fmtNum, fmtTime, gradeColor, powerZone } from './format';

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
  trainer: string; // état du trainer
  hrSensor: string;
}

export class Hud {
  readonly el: HTMLElement;
  private q: Record<string, HTMLElement> = {};
  private profile: HTMLCanvasElement;
  private map: HTMLCanvasElement;
  private profileBg: ImageData | null = null;
  private mapBg: ImageData | null = null;
  private lastProfile = 0;
  private visible = true;

  constructor(parent: HTMLElement, private readonly route: Route) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud-top">
        <div class="hud-box hud-left">
          <div class="metric"><span data-q="speed">0</span><small>km/h</small></div>
          <div class="metric"><span data-q="cadence">0</span><small>${t('hud.rpm')}</small></div>
          <div class="metric"><span data-q="hr">--</span><small>${t('hud.bpm')}</small></div>
        </div>
        <div class="hud-box hud-power">
          <div class="power-main"><span data-q="power">0</span><small>W</small></div>
          <div class="power-sub"><span data-q="wkg">0,0</span> W/kg · 3s <span data-q="p3">0</span> W · Z<span data-q="zone">1</span></div>
          <div class="zone-bar"><div data-q="zonebar"></div></div>
        </div>
        <div class="hud-box hud-right">
          <div class="metric"><span data-q="dist">0,00</span><small>km / <span data-q="total"></span></small></div>
          <div class="metric"><span data-q="time">0:00</span><small>${t('hud.time')}</small></div>
          <div class="metric"><span data-q="ascent">0</span><small>m D+</small></div>
        </div>
      </div>
      <div class="hud-grade" data-q="gradebox"><span data-q="grade">0,0</span><small>%</small><div class="alt"><span data-q="ele">0</span> m</div></div>
      <canvas class="hud-map" width="180" height="180"></canvas>
      <div class="hud-status">
        <span data-q="trainer"></span><span data-q="hrs"></span><span data-q="cam"></span>
        <span class="demo" data-q="demo">${t('hud.demo')}</span>
        <span class="braking" data-q="braking">${t('hud.braking')}</span>
      </div>
      <canvas class="hud-profile"></canvas>`;
    parent.appendChild(this.el);
    this.el.querySelectorAll<HTMLElement>('[data-q]').forEach((n) => (this.q[n.dataset.q!] = n));
    this.profile = this.el.querySelector('.hud-profile')!;
    this.map = this.el.querySelector('.hud-map')!;
    this.q.total.textContent = fmtKm(route.length, 1);
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
    q.demo.style.display = s.demo ? '' : 'none';
    q.braking.style.display = s.braking ? '' : 'none';

    const now = performance.now();
    if (now - this.lastProfile > 250) {
      this.lastProfile = now;
      this.drawProfile(s.dist);
      this.drawMap(s.dist);
    }
  }

  /** Profil d'altitude du parcours, coloré par la pente, avec la position actuelle. */
  private drawProfile(dist: number): void {
    const c = this.profile;
    const w = c.clientWidth * devicePixelRatio, h = c.clientHeight * devicePixelRatio;
    if (!w || !h) return;
    const ctx = c.getContext('2d')!;
    const r = this.route;
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
    // partie déjà parcourue assombrie
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, X(dist), h);
    const smp = r.sampleAt(dist);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(X(dist), Y(smp.ele), 5 * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Mini-carte du parcours (nord en haut). */
  private drawMap(dist: number): void {
    const c = this.map;
    const ctx = c.getContext('2d')!;
    const r = this.route;
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
