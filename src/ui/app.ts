/**
 * Interface de l'application : écran d'accueil (choix du parcours, capteurs, profil,
 * historique), écran de chargement, menu pause et bilan de fin de sortie.
 */
import { Engine } from '../render/engine';
import { HomeScene } from '../render/homeScene';
import type { RiderLook } from '../render/riderModel';
import { DeviceManager } from '../devices/manager';
import type { SensorKind } from '../devices/ble';
import { FtmsTrainer } from '../devices/sensors';
import { loadSave, writeSave, exportBackup, importBackup, type SaveData, type Profile } from '../storage/store';
import { parseGpx } from '../geo/gpx';
import { Route } from '../geo/route';
import { RideView } from '../ride/rideView';
import type { RideSummary, Sample } from '../ride/recorder';
import { encodeFit } from '../export/fit';
import { encodeGpx } from '../export/gpx';
import { downloadFile, safeFilename } from '../export/download';
import { levelFromXp } from '../ride/metrics';
import { buildParams } from '../physics/model';
import { CAM_MODES } from '../render/cameras';
import { ROUTES, type RouteEntry, type WorldId } from '../data/routes';
import franceMap from '../data/france-map.json';
import { APP_NAME, QUALITY, type QualityLevel } from '../config';
import { t, setLang, type I18nKey, type Lang } from '../i18n';
import { escapeHtml, fmtKm, fmtNum, fmtTime } from './format';
import type { FrameId, WheelId } from '../physics/equipment';

type Tab = 'ride' | 'devices' | 'profile' | 'history';

interface Selection {
  name: string;
  gpx: string;
  distance: number;
  ascent: number;
  entry?: RouteEntry;
}

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

export class App {
  private save: SaveData;
  private engine: Engine;
  private home: HomeScene;
  private devices = new DeviceManager();
  private ui: HTMLElement;
  private tab: Tab = 'ride';
  private selection: Selection | null = null;
  private ride: RideView | null = null;
  private message = '';

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.ui = ui;
    this.save = loadSave();
    setLang(this.save.profile.lang);
    this.engine = new Engine(canvas, QUALITY[this.save.profile.quality]);
    this.home = new HomeScene(this.look());
    this.engine.setView(this.home);
    this.engine.start();
    this.devices.onChange = () => { if (this.tab === 'devices' && !this.ride) this.renderHome(); };
    if (!this.save.profile.configured) {
      this.tab = 'profile';
      this.message = t('pf.welcome');
    }
    this.renderHome();
  }

  private get profile(): Profile {
    return this.save.profile;
  }

  private look(): RiderLook {
    const p = this.profile;
    return {
      heightCm: p.heightCm, frame: p.frame, wheels: p.wheels, jerseyColor: p.jerseyColor,
      jerseyColor2: p.jerseyColor2, helmetColor: p.helmetColor, highSocks: p.kit.highSocks, aeroHelmet: p.kit.aeroHelmet,
    };
  }

  // -------------------------------------------------------------------------
  // Accueil

  private renderHome(): void {
    const lvl = levelFromXp(this.save.xp);
    const tabs: Tab[] = ['ride', 'devices', 'profile', 'history'];
    this.ui.innerHTML = `
      <div class="home">
        <header class="brand">
          <h1>${APP_NAME}</h1>
          <p>${t('app.tagline')}</p>
          <div class="level">
            <b>${t('hist.level', { n: lvl.level })}</b>
            <div class="xpbar"><div style="width:${(lvl.into / lvl.needed) * 100}%"></div></div>
            <small>${t('hist.xp', { xp: lvl.into, need: lvl.needed })}</small>
          </div>
        </header>
        <aside class="panel">
          <nav class="tabs">${tabs.map((k) => `<button data-tab="${k}" class="${k === this.tab ? 'active' : ''}">${t(`tab.${k}` as I18nKey)}</button>`).join('')}</nav>
          ${this.message ? `<div class="message">${escapeHtml(this.message)}</div>` : ''}
          <div class="tab-body">${this.renderTab()}</div>
        </aside>
        <footer class="credits">${t('credits')}</footer>
      </div>`;
    this.ui.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        this.message = '';
        this.renderHome();
      }),
    );
    this.bindTab();
  }

  private renderTab(): string {
    switch (this.tab) {
      case 'ride': return this.renderRideTab();
      case 'devices': return this.renderDevicesTab();
      case 'profile': return this.renderProfileTab();
      case 'history': return this.renderHistoryTab();
    }
  }

  private bindTab(): void {
    if (this.tab === 'ride') this.bindRideTab();
    if (this.tab === 'devices') this.bindDevicesTab();
    if (this.tab === 'profile') this.bindProfileTab();
  }

  // ----- Onglet « Rouler »

  private renderRideTab(): string {
    const m = franceMap as { width: number; height: number; lat0: number; minx: number; maxy: number; scale: number; departements: Array<{ code: string; nom: string; d: string }> };
    const kx = Math.cos((m.lat0 * Math.PI) / 180);
    const P = (lat: number, lon: number) => [(lon * kx - m.minx) * m.scale, (m.maxy - lat) * m.scale];
    const hot = new Set(['95', '21', '73', '38']);
    const worlds: WorldId[] = ['valdoise', 'cotedor', 'montagne'];
    const sel = this.selection;
    return `
      <svg class="france" viewBox="0 0 ${m.width} ${m.height}" role="img" aria-label="France">
        ${m.departements.map((d) => `<path d="${d.d}" class="${hot.has(d.code) ? 'hot' : ''}"><title>${escapeHtml(d.nom)}</title></path>`).join('')}
        ${ROUTES.map((r) => {
          const [x, y] = P(r.lat, r.lon);
          return `<g class="marker ${sel?.entry?.id === r.id ? 'sel' : ''}" data-route="${r.id}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="13"/><circle r="5" class="dot"/></g>`;
        }).join('')}
      </svg>
      <p class="hint">${t('ride.mapsSoon')}</p>
      ${worlds.map((w) => `
        <h3>${t(`world.${w}` as I18nKey)}</h3>
        <ul class="routes">${ROUTES.filter((r) => r.world === w).map((r) => `
          <li><button data-route="${r.id}" class="${sel?.entry?.id === r.id ? 'sel' : ''}"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.description)}</small></button></li>`).join('')}
        </ul>`).join('')}
      <h3>${t('world.gpx')}</h3>
      <label class="file-btn">${t('ride.import')}<input type="file" accept=".gpx,application/gpx+xml" id="gpx-input" hidden></label>
      <p class="hint">${t('ride.importHint')}</p>
      <div class="selection">
        ${sel ? `
          <h4>${escapeHtml(sel.name)}</h4>
          <div class="stats"><span>${t('ride.distance')} <b>${fmtKm(sel.distance, 1)} km</b></span><span>${t('ride.ascent')} <b>${fmtNum(sel.ascent)} m</b></span></div>
          ${sel.distance > 100000 ? `<p class="warn">${t('ride.tooLong', { km: fmtKm(sel.distance, 0) })}</p>` : ''}
          <button class="primary big" id="start">${t('ride.start')}</button>` : `<p class="hint">${t('ride.choose')}</p>`}
      </div>`;
  }

  private bindRideTab(): void {
    this.ui.querySelectorAll<HTMLElement>('[data-route]').forEach((el) =>
      el.addEventListener('click', () => this.selectDemo(el.dataset.route!)),
    );
    $<HTMLInputElement>(this.ui, '#gpx-input')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      this.selectGpx(text, file.name.replace(/\.gpx$/i, ''));
    });
    $(this.ui, '#start')?.addEventListener('click', () => this.startRide());
  }

  private async selectDemo(id: string): Promise<void> {
    const entry = ROUTES.find((r) => r.id === id);
    if (!entry) return;
    try {
      const text = await (await fetch(entry.file)).text();
      this.selectGpx(text, entry.name, entry);
    } catch (e) {
      this.message = t('load.error', { msg: String(e) });
      this.renderHome();
    }
  }

  private selectGpx(text: string, fallbackName: string, entry?: RouteEntry): void {
    const gpx = parseGpx(text, fallbackName);
    this.message = '';
    if (gpx.points.length < 2) {
      this.message = t('err.gpx');
      this.renderHome();
      return;
    }
    const outside = gpx.points.some((p) => p.lat < 41 || p.lat > 51.3 || p.lon < -5.3 || p.lon > 9.8);
    if (outside) this.message = t('err.outside');
    try {
      const route = Route.fromPoints(entry?.name ?? gpx.name, gpx.points);
      this.selection = { name: entry?.name ?? gpx.name, gpx: text, distance: route.length, ascent: route.totalAscent, entry };
    } catch {
      this.message = t('err.gpx');
    }
    this.renderHome();
  }

  // ----- Onglet « Capteurs »

  private renderDevicesTab(): string {
    const kinds: SensorKind[] = ['trainer', 'hr', 'power', 'cadence'];
    const supported = this.devices.supported;
    return `
      ${supported ? '' : `<p class="warn">${t('dev.unsupported')}</p>`}
      ${!supported && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent) ? `<p class="warn">${t('dev.linux')}</p>` : ''}
      ${this.profile.shifting === 'virtual' && this.devices.sensors.trainer?.status === 'connected' && !this.devices.trainer ? `<p class="warn">${t('dev.virtualNeedsControl')}</p>` : ''}
      <ul class="devices">${kinds.map((k) => {
        const s = this.devices.sensors[k];
        const status = s ? t(`dev.status.${s.status}` as I18nKey) : '';
        const extra = k === 'trainer' && s?.status === 'connected'
          ? ` · ${s instanceof FtmsTrainer && s.controllable ? t('dev.controllable') : t('dev.notControllable')}` : '';
        return `<li>
          <div><b>${t(`dev.${k}` as I18nKey)}</b><small>${s ? `${escapeHtml(s.name)} — ${status}${extra}` : ''}</small></div>
          ${s ? `<button data-disc="${k}">${t('dev.disconnect')}</button>` : `<button class="primary" data-conn="${k}" ${supported ? '' : 'disabled'}>${t('dev.connect')}</button>`}
        </li>`;
      }).join('')}</ul>
      <p class="hint">${t('dev.watchHint')}</p>
      <label class="check"><input type="checkbox" id="demo" ${this.devices.demoForced ? 'checked' : ''}> ${t('dev.demo')}</label>`;
  }

  private bindDevicesTab(): void {
    this.ui.querySelectorAll<HTMLButtonElement>('[data-conn]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await this.devices.connect(b.dataset.conn as SensorKind);
          this.message = '';
        } catch (e) {
          const err = e as Error;
          // NotFoundError = l'utilisateur a fermé la fenêtre de choix : pas une erreur
          if (err.name !== 'NotFoundError') this.message = t('dev.error', { msg: err.message || err.name });
        }
        this.renderHome();
      }),
    );
    this.ui.querySelectorAll<HTMLButtonElement>('[data-disc]').forEach((b) =>
      b.addEventListener('click', () => {
        this.devices.disconnect(b.dataset.disc as SensorKind);
        this.renderHome();
      }),
    );
    $<HTMLInputElement>(this.ui, '#demo')?.addEventListener('change', (e) => {
      this.devices.demoForced = (e.target as HTMLInputElement).checked;
    });
  }

  // ----- Onglet « Profil »

  private renderProfileTab(): string {
    const p = this.profile;
    const params = buildParams({ weightKg: p.weightKg, heightCm: p.heightCm, frame: p.frame, wheels: p.wheels, kit: p.kit });
    const opt = <T extends string>(values: T[], cur: T, label: (v: T) => string) =>
      values.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label(v)}</option>`).join('');
    const num = (id: string, label: I18nKey, v: number, min: number, max: number, step = 1) =>
      `<label>${t(label)}<input type="number" id="${id}" value="${v}" min="${min}" max="${max}" step="${step}"></label>`;
    return `
      <form class="profile" id="profile-form">
        <label>${t('pf.name')}<input type="text" id="pf-name" value="${escapeHtml(p.name)}" maxlength="30"></label>
        <div class="grid2">
          ${num('pf-weight', 'pf.weight', p.weightKg, 30, 200, 0.5)}
          ${num('pf-height', 'pf.height', p.heightCm, 120, 220)}
          ${num('pf-ftp', 'pf.ftp', p.ftp, 50, 600)}
          ${num('pf-hrmax', 'pf.hrmax', p.hrMax, 100, 230)}
        </div>
        <div class="grid2">
          <label>${t('pf.frame')}<select id="pf-frame">${opt<FrameId>(['climb', 'aero', 'mtb'], p.frame, (v) => t(`frame.${v}` as I18nKey))}</select></label>
          <label>${t('pf.wheels')}<select id="pf-wheels">${opt<WheelId>(['alu', 'c40', 'c55', 'c88'], p.wheels, (v) => t(`wheel.${v}` as I18nKey))}</select></label>
        </div>
        <fieldset><legend>${t('pf.kit')}</legend>
          <label class="check"><input type="checkbox" id="pf-aero" ${p.kit.aeroHelmet ? 'checked' : ''}> ${t('pf.aeroHelmet')}</label>
          <label class="check"><input type="checkbox" id="pf-socks" ${p.kit.highSocks ? 'checked' : ''}> ${t('pf.highSocks')}</label>
          <label class="check"><input type="checkbox" id="pf-over" ${p.kit.overshoes ? 'checked' : ''}> ${t('pf.overshoes')}</label>
        </fieldset>
        <p class="hint">${t('pf.physics', { mass: fmtNum(params.mass, 1), cda: fmtNum(params.cda, 3) })}</p>
        <div class="grid3">
          <label>${t('pf.jersey')}<input type="color" id="pf-j1" value="${p.jerseyColor}"></label>
          <label>${t('pf.jersey2')}<input type="color" id="pf-j2" value="${p.jerseyColor2}"></label>
          <label>${t('pf.helmet')}<input type="color" id="pf-hc" value="${p.helmetColor}"></label>
        </div>
        <label>${t('pf.difficulty', { v: Math.round(p.trainerDifficulty * 100) })}<input type="range" id="pf-diff" min="0" max="100" step="5" value="${Math.round(p.trainerDifficulty * 100)}"></label>
        <fieldset><legend>${t('pf.shifting')}</legend>
          <label class="check"><input type="radio" name="pf-shift" value="virtual" ${p.shifting === 'virtual' ? 'checked' : ''}> ${t('pf.shift.virtual')}</label>
          <label class="check"><input type="radio" name="pf-shift" value="manual" ${p.shifting === 'manual' ? 'checked' : ''}> ${t('pf.shift.manual')}</label>
          <div class="grid2">
            ${num('pf-ring', 'pf.chainring', p.chainring, 20, 60)}
            ${num('pf-cog', 'pf.cog', p.cogTeeth, 10, 36)}
          </div>
          <p class="hint">${t('pf.cogHint')}</p>
          <div class="grid2">
            <label>${t('pf.keyUp')}<input type="text" readonly class="keycap" id="pf-kup" value="${escapeHtml(p.keyGearUp)}"></label>
            <label>${t('pf.keyDown')}<input type="text" readonly class="keycap" id="pf-kdown" value="${escapeHtml(p.keyGearDown)}"></label>
          </div>
          <p class="hint">${t('pf.keyHint')}</p>
        </fieldset>
        <div class="grid2">
          <label>${t('pf.quality')}<select id="pf-quality">${opt<QualityLevel>(['low', 'medium', 'high'], p.quality, (v) => t(`q.${v}` as I18nKey))}</select></label>
          <label>${t('pf.lang')}<select id="pf-lang">${opt<Lang>(['fr', 'en'], p.lang, (v) => (v === 'fr' ? 'Français' : 'English'))}</select></label>
        </div>
        <button type="submit" class="primary big">${t('pf.save')}</button>
      </form>
      <h3>${t('pf.backup')}</h3>
      <p class="hint">${t('pf.backupHint')}</p>
      <div class="row">
        <button id="bk-export">${t('pf.export')}</button>
        <label class="file-btn">${t('pf.import')}<input type="file" accept=".json,application/json" id="bk-import" hidden></label>
      </div>`;
  }

  private bindProfileTab(): void {
    const form = $<HTMLFormElement>(this.ui, '#profile-form');
    const val = (id: string) => $<HTMLInputElement>(this.ui, `#${id}`).value;
    const chk = (id: string) => $<HTMLInputElement>(this.ui, `#${id}`).checked;
    const clamp = (v: number, a: number, b: number, d: number) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
    $<HTMLInputElement>(this.ui, '#pf-diff').addEventListener('input', (e) => {
      const lbl = (e.target as HTMLElement).parentElement!;
      lbl.firstChild!.textContent = t('pf.difficulty', { v: (e.target as HTMLInputElement).value });
    });
    // Champs « touche » : on clique dedans puis on appuie sur la touche (ou sur la manette via BikeControl).
    this.ui.querySelectorAll<HTMLInputElement>('.keycap').forEach((inp) =>
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') return;
        e.preventDefault();
        inp.value = e.key;
      }),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = this.profile;
      const lang = val('pf-lang') as Lang;
      const quality = val('pf-quality') as QualityLevel;
      Object.assign(p, {
        name: val('pf-name').trim(),
        weightKg: clamp(parseFloat(val('pf-weight')), 30, 200, p.weightKg),
        heightCm: clamp(parseFloat(val('pf-height')), 120, 220, p.heightCm),
        ftp: clamp(parseFloat(val('pf-ftp')), 50, 600, p.ftp),
        hrMax: clamp(parseFloat(val('pf-hrmax')), 100, 230, p.hrMax),
        frame: val('pf-frame') as FrameId,
        wheels: val('pf-wheels') as WheelId,
        kit: { aeroHelmet: chk('pf-aero'), highSocks: chk('pf-socks'), overshoes: chk('pf-over') },
        jerseyColor: val('pf-j1'),
        jerseyColor2: val('pf-j2'),
        helmetColor: val('pf-hc'),
        trainerDifficulty: clamp(parseFloat(val('pf-diff')) / 100, 0, 1, 1),
        shifting: ($<HTMLInputElement>(this.ui, 'input[name=pf-shift]:checked')?.value ?? 'virtual') as Profile['shifting'],
        chainring: Math.round(clamp(parseFloat(val('pf-ring')), 20, 60, p.chainring)),
        cogTeeth: Math.round(clamp(parseFloat(val('pf-cog')), 10, 36, p.cogTeeth)),
        keyGearUp: val('pf-kup') || 'PageUp',
        keyGearDown: val('pf-kdown') || 'PageDown',
        quality,
        lang,
        configured: true,
      });
      writeSave(this.save);
      setLang(lang);
      this.engine.setQuality(QUALITY[quality]);
      this.home.setLook(this.look());
      this.message = t('pf.saved');
      this.renderHome();
    });
    $(this.ui, '#bk-export').addEventListener('click', () => {
      downloadFile(exportBackup(this.save), safeFilename('MyHomeRide-sauvegarde', new Date(), 'json'), 'application/json');
    });
    $<HTMLInputElement>(this.ui, '#bk-import').addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        this.save = importBackup(await file.text());
        writeSave(this.save);
        setLang(this.profile.lang);
        this.home.setLook(this.look());
        this.message = t('pf.imported');
      } catch {
        this.message = t('pf.importError');
      }
      this.renderHome();
    });
  }

  // ----- Onglet « Historique »

  private renderHistoryTab(): string {
    const h = this.save.history;
    if (!h.length) return `<p class="hint">${t('hist.empty')}</p>`;
    return `<ul class="history">${h.slice(0, 50).map((r) => `
      <li><b>${escapeHtml(r.routeName)}</b>
        <small>${new Date(r.date).toLocaleString()}</small>
        <span>${fmtKm(r.distance, 1)} km · ${fmtTime(r.movingTime)} · ${fmtNum(r.avgPower)} W · ${fmtNum(r.ascent)} m D+ · TSS ${fmtNum(r.tss)} · +${r.xp} XP</span>
      </li>`).join('')}</ul>`;
  }

  // -------------------------------------------------------------------------
  // Sortie

  private async startRide(): Promise<void> {
    const sel = this.selection;
    if (!sel) return;
    const gpx = parseGpx(sel.gpx, sel.name);
    const route = Route.fromPoints(sel.name, gpx.points);
    this.ui.innerHTML = `
      <div class="loading">
        <h2>${escapeHtml(sel.name)}</h2>
        <p>${t('load.title')}</p>
        <div class="progress"><div id="prog"></div></div>
        <small id="prog-step"></small>
      </div>
      <div id="ride-overlay"></div>`;
    const overlay = $(this.ui, '#ride-overlay');
    const ride = new RideView(route, this.profile, this.devices, QUALITY[this.profile.quality], overlay, {
      onPauseMenu: () => this.showPause(),
      onFinish: (summary, samples) => this.showReport(summary, samples),
    });
    this.ride = ride;
    this.engine.setView(ride);
    try {
      await ride.prepare((step, p) => {
        const bar = document.getElementById('prog');
        const label = document.getElementById('prog-step');
        const base = step === 'load.elevation' ? 0 : 0.4;
        if (bar) bar.style.width = `${(base + p * (step === 'load.elevation' ? 0.4 : 0.6)) * 100}%`;
        if (label) label.textContent = t(step);
      });
    } catch (e) {
      this.message = t('load.error', { msg: String(e) });
      this.exitRide();
      return;
    }
    if (this.ride !== ride) return;
    this.ui.querySelector('.loading')?.remove();
    this.addTouchControls(overlay);
  }

  /** Boutons tactiles (iPad, écran tactile) : caméra, puissance en démo, pause. */
  private addTouchControls(overlay: HTMLElement): void {
    const bar = document.createElement('div');
    bar.className = 'touch-bar';
    bar.innerHTML = `
      <button data-act="cam">🎥 ${t('touch.cam')}</button>
      ${this.profile.shifting === 'virtual' ? `<button data-act="gdown" title="${t('touch.gearDown')}">⚙ −</button><button data-act="gup" title="${t('touch.gearUp')}">⚙ +</button>` : ''}
      ${this.devices.hasPowerSource ? '' : `<button data-act="down">− W</button><button data-act="up">+ W</button>`}
      <button data-act="pause">⏸ ${t('touch.pause')}</button>`;
    overlay.appendChild(bar);
    bar.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (!this.ride) return;
      if (act === 'cam') this.ride.rig.next();
      if (act === 'gup') this.ride.shift(1);
      if (act === 'gdown') this.ride.shift(-1);
      if (act === 'up') this.devices.demoPower = Math.min(1500, this.devices.demoPower + 10);
      if (act === 'down') this.devices.demoPower = Math.max(0, this.devices.demoPower - 10);
      if (act === 'pause') { this.ride.pause(); this.showPause(); }
    });
  }

  private showPause(): void {
    const ride = this.ride;
    if (!ride || document.querySelector('.modal')) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="card">
        <h2>${t('pause.title')}</h2>
        <button class="primary big" data-act="resume">${t('pause.resume')}</button>
        <div class="cams">${CAM_MODES.map((m, i) => `<button data-cam="${m}" class="${ride.rig.mode === m ? 'active' : ''}">${i + 1}. ${t(`cam.${m}` as I18nKey)}</button>`).join('')}</div>
        <button data-act="finish">${t('pause.finish')}</button>
        <button data-act="quit" class="danger">${t('pause.quit')}</button>
        <p class="hint">${t('pause.keys')}</p>
      </div>`;
    this.ui.appendChild(modal);
    const close = () => {
      modal.remove();
      window.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        close();
        ride.resume();
      }
    };
    window.addEventListener('keydown', onKey, true);
    modal.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.cam) {
        ride.setCamera(b.dataset.cam as (typeof CAM_MODES)[number]);
        close();
        ride.resume();
      } else if (b.dataset.act === 'resume') {
        close();
        ride.resume();
      } else if (b.dataset.act === 'finish') {
        close();
        ride.finish();
      } else if (b.dataset.act === 'quit') {
        close();
        this.exitRide();
      }
    });
  }

  private showReport(s: RideSummary, samples: Sample[]): void {
    const before = levelFromXp(this.save.xp).level;
    if (samples.length > 10) {
      this.save.history.unshift(s);
      this.save.xp += s.xp;
      writeSave(this.save);
    }
    const after = levelFromXp(this.save.xp).level;
    const rows: Array<[I18nKey, string]> = [
      ['rep.distance', `${fmtKm(s.distance)} km`],
      ['rep.time', fmtTime(s.movingTime)],
      ['rep.ascent', `${fmtNum(s.ascent)} m`],
      ['rep.avgSpeed', `${fmtNum(s.avgSpeed * 3.6, 1)} km/h`],
      ['rep.avgPower', `${fmtNum(s.avgPower)} W`],
      ['rep.np', `${fmtNum(s.np)} W`],
      ['rep.maxPower', `${fmtNum(s.maxPower)} W`],
      ['rep.avgHr', s.avgHr ? `${fmtNum(s.avgHr)} bpm` : '—'],
      ['rep.kcal', `${fmtNum(s.kcal)} kcal`],
      ['rep.tss', fmtNum(s.tss)],
      ['rep.if', fmtNum(s.intensity, 2)],
      ['rep.xp', `+${s.xp}`],
    ];
    document.querySelector('.modal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="card report">
        <h2>${t('rep.title')}</h2>
        <h4>${escapeHtml(s.routeName)}</h4>
        ${after > before ? `<p class="levelup">${t('rep.levelUp', { n: after })}</p>` : ''}
        <dl>${rows.map(([k, v]) => `<div><dt>${t(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <div class="row">
          <button class="primary" data-act="fit">${t('rep.fit')}</button>
          <button data-act="gpx">${t('rep.gpx')}</button>
        </div>
        <p class="hint">${t('rep.hint')}</p>
        <button class="big" data-act="home">${t('rep.home')}</button>
      </div>`;
    this.ui.appendChild(modal);
    const date = new Date(s.date);
    modal.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act === 'fit') downloadFile(encodeFit(samples, s), safeFilename(s.routeName, date, 'fit'), 'application/vnd.ant.fit');
      if (act === 'gpx') downloadFile(encodeGpx(samples, s.routeName, APP_NAME), safeFilename(s.routeName, date, 'gpx'), 'application/gpx+xml');
      if (act === 'home') {
        modal.remove();
        this.exitRide();
      }
    });
  }

  private exitRide(): void {
    this.ride?.dispose();
    this.ride = null;
    this.engine.setView(this.home);
    this.tab = this.message ? this.tab : 'history';
    if (!this.save.history.length) this.tab = 'ride';
    this.renderHome();
  }
}
