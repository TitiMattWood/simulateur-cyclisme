/**
 * Interface de l'application : écran d'accueil (choix du parcours, capteurs, profil,
 * historique), écran de chargement, menu pause et bilan de fin de sortie.
 */
import { Engine } from '../render/engine';
import { HomeScene } from '../render/homeScene';
import { lookFromProfile, SKIN_TONES, HAIR_COLORS, type RiderLook, type Appearance } from '../render/look';
import { DeviceManager } from '../devices/manager';
import type { SensorKind } from '../devices/ble';
import { FtmsTrainer } from '../devices/sensors';
import { ZwiftClick } from '../devices/zwiftClick';
import { watchForUpdates } from '../version';
import { loadSave, writeSave, exportBackup, importBackup, type SaveData, type Profile } from '../storage/store';
import { parseGpx } from '../geo/gpx';
import { Route } from '../geo/route';
import { RideView, type RideSource } from '../ride/rideView';
import type { RideSummary, Sample } from '../ride/recorder';
import { encodeFit } from '../export/fit';
import { encodeGpx } from '../export/gpx';
import { downloadFile, safeFilename } from '../export/download';
import { levelFromXp } from '../ride/metrics';
import { buildParams, steadySpeed, airDensity, crrFor, type RiderSetup } from '../physics/model';
import { CAM_MODES } from '../render/cameras';
import { ROUTES, type RouteEntry, type WorldId } from '../data/routes';
import { START_POINTS } from '../data/startPoints';
import franceMap from '../data/france-map.json';
import { APP_NAME, QUALITY, type QualityLevel } from '../config';
import { t, setLang, type I18nKey, type Lang } from '../i18n';
import { escapeHtml, fmtKm, fmtNum, fmtTime } from './format';
import type { FrameId, WheelId } from '../physics/equipment';
import { CHAINRINGS, CASSETTES, TIRES, type TireId } from '../physics/gears';
import type { RideMode, RideSetup } from '../ride/setup';
import type { RankEntry } from '../ride/ai/peloton';

type Tab = 'ride' | 'devices' | 'profile' | 'history';

interface Selection {
  name: string;
  gpx: string;
  distance: number;
  ascent: number;
  entry?: RouteEntry;
}

/** Départ du trajet libre choisi (point proposé ou adresse recherchée). */
interface FreeStart {
  name: string;
  lat: number;
  lon: number;
}

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

export class App {
  private save: SaveData;
  private engine: Engine;
  private home: HomeScene;
  private devices = new DeviceManager();
  /** manette Zwift Click en Bluetooth direct (expérimental) */
  private click = new ZwiftClick();
  private ui: HTMLElement;
  private tab: Tab = 'ride';
  private selection: Selection | null = null;
  private freeStart: FreeStart | null = null;
  private searchResults: FreeStart[] = [];
  private ride: RideView | null = null;
  private message = '';
  /** sections du profil dépliées */
  private pfOpen = new Set<string>(['rider', 'kit', 'bike']);
  /** une nouvelle version est en ligne */
  private updateReady = false;
  /** vrai pendant l'animation d'entrée dans la TV */
  private entering = false;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.ui = ui;
    this.save = loadSave();
    setLang(this.save.profile.lang);
    this.engine = new Engine(canvas, QUALITY[this.save.profile.quality]);
    this.home = new HomeScene(this.look(), this.engine.environment());
    this.home.attachControls(canvas);
    // Nouvelle version en ligne : bandeau « Recharger » (affiché sur l'accueil, jamais en pleine sortie)
    watchForUpdates(() => {
      this.updateReady = true;
      if (!this.ride) this.showUpdateBanner();
    });
    // TV de l'accueil : vraies mesures du trainer et du cardio, 4 fois par seconde
    window.setInterval(() => {
      if (this.ride) return;
      const l = this.devices.liveReal();
      const p = this.profile;
      const params = buildParams({ weightKg: p.weightKg, heightCm: p.heightCm, frame: p.frame, wheels: p.wheels, kit: p.kit });
      const kmh = l.trainer && l.power ? steadySpeed(l.power, { grade: 0, headwind: 0, rho: airDensity(0), crr: crrFor(p.frame, 'asphalt'), draft: 1 }, params) * 3.6 : 0;
      this.home.setLive({ ...l, kmh });
    }, 250);
    this.engine.setView(this.home);
    this.engine.start();
    this.devices.onChange = () => { if (this.tab === 'devices' && !this.ride) this.renderHome(); };
    this.click.onStatus = () => { if (this.tab === 'devices' && !this.ride) this.renderHome(); };
    // boutons + / − de la manette : vitesse virtuelle plus dure / plus souple
    this.click.onShift = (dir) => this.ride?.shift(dir);
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
    return lookFromProfile(this.profile);
  }

  // -------------------------------------------------------------------------
  // Accueil

  private renderHome(): void {
    const lvl = levelFromXp(this.save.xp);
    const tabs: Tab[] = ['ride', 'profile', 'devices', 'history'];
    const ready = this.tab === 'ride' ? this.ctaTarget() : null;
    this.ui.innerHTML = `
      <div class="home">
        <header class="topbar">
          <div class="logo">MyHomeRide<span>by Titi</span></div>
          <nav class="tabs">${tabs.map((k) => `<button data-tab="${k}" class="${k === this.tab ? 'active' : ''}">${t(`tab.${k}` as I18nKey)}</button>`).join('')}</nav>
          <div class="level">
            <span class="lvl-badge">${lvl.level}</span>
            <div><b>${escapeHtml(this.profile.name || t('hist.level', { n: lvl.level }))}</b>
              <div class="xpbar"><div style="width:${(lvl.into / lvl.needed) * 100}%"></div></div>
              <small>${t('hist.xp', { xp: lvl.into, need: lvl.needed })}</small></div>
          </div>
        </header>
        <aside class="panel">
          ${this.message ? `<div class="message">${escapeHtml(this.message)}</div>` : ''}
          <div class="tab-body">${this.renderTab()}</div>
        </aside>
        ${this.tab === 'ride' ? `
          <div class="cta">
            <div class="cta-info">${ready ? `<b>${escapeHtml(ready.title)}</b><small>${escapeHtml(ready.sub)}</small>` : `<small>${t('ride.choose')}</small>`}</div>
            <button class="go" id="go" ${ready ? '' : 'disabled'}>${t('ride.go')} ▶</button>
          </div>` : ''}
        <div class="home-hint">${t('home.hint')}</div>
        <footer class="credits">${t('credits')}</footer>
      </div>`;
    this.ui.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        // on quitte le profil sans enregistrer : l'avatar reprend l'apparence enregistrée
        if (this.tab === 'profile') this.home.setLook(this.look());
        this.tab = b.dataset.tab as Tab;
        this.message = '';
        this.renderHome();
      }),
    );
    $(this.ui, '#go')?.addEventListener('click', () => this.go());
    this.bindTab();
    this.home.setFocus(this.tab === 'profile' ? 'rider' : 'room');
  }

  /** Ce que lancera le bouton « C'est parti » : un parcours choisi, ou un départ en trajet libre. */
  private ctaTarget(): { title: string; sub: string } | null {
    const mode = t(`mode.${this.setup.mode}` as I18nKey);
    if (this.selection) {
      return { title: this.selection.name, sub: `${mode} · ${fmtKm(this.selection.distance, 1)} km · ${fmtNum(this.selection.ascent)} m D+` };
    }
    if (this.freeStart) return { title: this.freeStart.name, sub: `${mode} · ${t('free.title')}` };
    return null;
  }

  private go(): void {
    const sel = this.selection;
    if (sel) {
      const gpx = parseGpx(sel.gpx, sel.name);
      this.startRide({ kind: 'gpx', route: Route.fromPoints(sel.name, gpx.points) });
    } else if (this.freeStart) {
      this.startRide({ kind: 'open', ...this.freeStart });
    }
  }

  private get setup(): RideSetup {
    return this.profile.rideSetup;
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
    const su = this.setup;
    const modes: Array<{ id: RideMode | 'workout'; icon: string }> = [
      { id: 'free', icon: '🚴' }, { id: 'group', icon: '👥' }, { id: 'race', icon: '🏁' }, { id: 'workout', icon: '📈' },
    ];
    const opt = <T extends string | number>(values: readonly T[], cur: T, label: (v: T) => string) =>
      values.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${escapeHtml(label(v))}</option>`).join('');
    const wind = `
      <div class="grid2">
        <label>${t('setup.wind')}<select id="su-wind">${opt(['none', 'light', 'strong'] as const, su.wind, (v) => t(`wind.${v}` as I18nKey))}</select></label>
        <label>${t('setup.windDir')}<select id="su-winddir" ${su.wind === 'none' ? 'disabled' : ''}>${opt(['head', 'cross', 'tail'] as const, su.windDir, (v) => t(`windDir.${v}` as I18nKey))}</select></label>
      </div>`;
    const settings = su.mode === 'group' ? `
      <div class="mode-settings">
        <label>${t('setup.riders', { n: su.riders })}<input type="range" id="su-riders" min="1" max="10" value="${su.riders}"></label>
        <label>${t('setup.pace', { p: Math.round(su.pace * 100), w: Math.round(su.pace * this.profile.ftp) })}<input type="range" id="su-pace" min="50" max="90" step="5" value="${Math.round(su.pace * 100)}"></label>
        <label class="check"><input type="checkbox" id="su-wait" ${su.wait ? 'checked' : ''}> ${t('setup.wait')}</label>
        <label class="check"><input type="checkbox" id="su-relay" ${su.relay ? 'checked' : ''}> ${t('setup.relay')}</label>
        <label class="check"><input type="checkbox" id="su-signs" ${su.signSprints ? 'checked' : ''}> ${t('setup.signSprints')}</label>
        ${wind}
      </div>` : su.mode === 'race' ? `
      <div class="mode-settings">
        <div class="seg">${([0.8, 1, 1.15] as const).map((l) => `<button data-level="${l}" class="${su.level === l ? 'sel' : ''}">${t(`level.${l === 0.8 ? 'easy' : l === 1 ? 'mid' : 'hard'}` as I18nKey)}<small>${Math.round(l * 100)} % FTP</small></button>`).join('')}</div>
        <label>${t('setup.rivals', { n: su.riders })}<input type="range" id="su-riders" min="1" max="10" value="${su.riders}"></label>
        <label>${t('setup.raceKm')}<select id="su-km">${opt([5, 10, 20, 30, 40] as const, su.raceKm as 5, (v) => `${v} km`)}</select></label>
        <p class="hint">${t('setup.raceHint')}</p>
        ${wind}
      </div>` : `<div class="mode-settings">${wind}</div>`;
    return `
      <h2 class="panel-title">${t('ride.what')}</h2>
      <div class="tiles">${modes.map((md) => `
        <button class="tile ${su.mode === md.id ? 'sel' : ''}" data-mode="${md.id}" ${md.id === 'workout' ? 'disabled' : ''}>
          <span class="ico">${md.icon}</span><b>${t(`mode.${md.id}` as I18nKey)}</b><small>${t(`mode.${md.id}.sub` as I18nKey)}</small>
        </button>`).join('')}
      </div>
      ${settings}
      <h3>${t('ride.where')}</h3>
      <svg class="france" viewBox="0 0 ${m.width} ${m.height}" role="img" aria-label="France">
        ${m.departements.map((d) => `<path d="${d.d}" class="${hot.has(d.code) ? 'hot' : ''}"><title>${escapeHtml(d.nom)}</title></path>`).join('')}
        ${ROUTES.map((r) => {
          const [x, y] = P(r.lat, r.lon);
          return `<g class="marker ${sel?.entry?.id === r.id ? 'sel' : ''}" data-route="${r.id}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="13"/><circle r="5" class="dot"/></g>`;
        }).join('')}
      </svg>
      <details class="pf-sec" ${this.freeStart || !sel ? 'open' : ''}><summary>${t('free.title')}</summary><div class="pf-body">
        <p class="hint">${t('free.hint')}</p>
        ${[...worlds, 'paris' as const].map((w) => `<div class="starts"><b>${t(`world.${w}` as I18nKey)}</b>${START_POINTS.filter((s) => s.world === w).map((s) => `<button data-start="${s.id}" class="chip ${this.freeStart?.name === s.name ? 'sel' : ''}">${escapeHtml(s.name)}</button>`).join('')}</div>`).join('')}
        <form class="search" id="free-search"><input type="search" id="free-q" placeholder="${t('free.search')}" autocomplete="off"><button type="submit">${t('free.go')}</button></form>
        ${this.searchResults.length ? `<div class="starts">${this.searchResults.map((r, i) => `<button data-res="${i}" class="chip ${this.freeStart?.name === r.name ? 'sel' : ''}">${escapeHtml(r.name)}</button>`).join('')}</div>` : ''}
      </div></details>
      <details class="pf-sec" ${sel ? 'open' : ''}><summary>${t('ride.routes')}</summary><div class="pf-body">
        ${worlds.map((w) => `
          <h4 class="sub">${t(`world.${w}` as I18nKey)}</h4>
          <ul class="routes">${ROUTES.filter((r) => r.world === w).map((r) => `
            <li><button data-route="${r.id}" class="${sel?.entry?.id === r.id ? 'sel' : ''}"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.description)}</small></button></li>`).join('')}
          </ul>`).join('')}
        <h4 class="sub">${t('world.gpx')}</h4>
        <label class="file-btn">${t('ride.import')}<input type="file" accept=".gpx,application/gpx+xml" id="gpx-input" hidden></label>
        <p class="hint">${t('ride.importHint')}</p>
        ${sel && sel.distance > 100000 ? `<p class="warn">${t('ride.tooLong', { km: fmtKm(sel.distance, 0) })}</p>` : ''}
      </div></details>`;
  }

  private bindRideTab(): void {
    this.ui.querySelectorAll<HTMLElement>('[data-start]').forEach((el) =>
      el.addEventListener('click', () => {
        const s = START_POINTS.find((p) => p.id === el.dataset.start);
        if (s) this.freeStart = { name: s.name, lat: s.lat, lon: s.lon };
        this.selection = null;
        this.renderHome();
      }),
    );
    this.ui.querySelectorAll<HTMLElement>('[data-res]').forEach((el) =>
      el.addEventListener('click', () => {
        this.freeStart = this.searchResults[Number(el.dataset.res)] ?? null;
        this.selection = null;
        this.renderHome();
      }),
    );
    $<HTMLFormElement>(this.ui, '#free-search')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = $<HTMLInputElement>(this.ui, '#free-q').value.trim();
      if (q.length < 3) return;
      this.searchResults = await searchPlaces(q).catch(() => []);
      this.message = this.searchResults.length ? '' : t('free.notFound');
      this.renderHome();
    });
    // modes et réglages de la sortie (enregistrés avec le profil)
    const saveSetup = (patch: Partial<RideSetup>, rerender = true) => {
      Object.assign(this.setup, patch);
      writeSave(this.save);
      if (rerender) this.renderHome();
    };
    this.ui.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) =>
      el.addEventListener('click', () => saveSetup({ mode: el.dataset.mode as RideMode })),
    );
    this.ui.querySelectorAll<HTMLElement>('[data-level]').forEach((el) =>
      el.addEventListener('click', () => saveSetup({ level: Number(el.dataset.level) as RideSetup['level'] })),
    );
    const range = (id: string, apply: (v: number) => Partial<RideSetup>) => {
      const el = $<HTMLInputElement>(this.ui, `#${id}`);
      el?.addEventListener('input', () => {
        saveSetup(apply(Number(el.value)), false);
        const lbl = el.parentElement!.firstChild!;
        lbl.textContent = id === 'su-pace'
          ? t('setup.pace', { p: el.value, w: Math.round((Number(el.value) / 100) * this.profile.ftp) })
          : t(this.setup.mode === 'race' ? 'setup.rivals' : 'setup.riders', { n: el.value });
      });
    };
    range('su-riders', (v) => ({ riders: v }));
    range('su-pace', (v) => ({ pace: v / 100 }));
    $<HTMLInputElement>(this.ui, '#su-wait')?.addEventListener('change', (e) => saveSetup({ wait: (e.target as HTMLInputElement).checked }, false));
    $<HTMLInputElement>(this.ui, '#su-relay')?.addEventListener('change', (e) => saveSetup({ relay: (e.target as HTMLInputElement).checked }, false));
    $<HTMLInputElement>(this.ui, '#su-signs')?.addEventListener('change', (e) => saveSetup({ signSprints: (e.target as HTMLInputElement).checked }, false));
    $<HTMLSelectElement>(this.ui, '#su-km')?.addEventListener('change', (e) => saveSetup({ raceKm: Number((e.target as HTMLSelectElement).value) }, false));
    $<HTMLSelectElement>(this.ui, '#su-wind')?.addEventListener('change', (e) => saveSetup({ wind: (e.target as HTMLSelectElement).value as RideSetup['wind'] }));
    $<HTMLSelectElement>(this.ui, '#su-winddir')?.addEventListener('change', (e) => saveSetup({ windDir: (e.target as HTMLSelectElement).value as RideSetup['windDir'] }, false));
    this.ui.querySelectorAll<HTMLElement>('[data-route]').forEach((el) =>
      el.addEventListener('click', () => this.selectDemo(el.dataset.route!)),
    );
    $<HTMLInputElement>(this.ui, '#gpx-input')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      this.selectGpx(text, file.name.replace(/\.gpx$/i, ''));
    });
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
      }).join('')}
      <li class="click-row">
        <div><b>${t('dev.click')}</b><small>${this.click.name ? `${escapeHtml(this.click.name)} — ` : ''}${t(`click.${this.click.status}` as I18nKey)}</small></div>
        ${this.click.status === 'connected'
          ? `<button id="click-disc">${t('dev.disconnect')}</button>`
          : `<button class="primary" id="click-conn" ${supported ? '' : 'disabled'}>${t('dev.connect')}</button>`}
      </li></ul>
      <p class="hint">${t('dev.clickHint')}</p>
      <p class="hint">${t('dev.watchHint')}</p>
      <label class="check"><input type="checkbox" id="demo" ${this.devices.demoForced ? 'checked' : ''}> ${t('dev.demo')}</label>`;
  }

  private bindDevicesTab(): void {
    $(this.ui, '#click-conn')?.addEventListener('click', async () => {
      try {
        await this.click.connect();
        this.message = '';
      } catch (e) {
        const err = e as Error;
        if (err.name !== 'NotFoundError') this.message = t('dev.error', { msg: err.message || err.name });
      }
      this.renderHome();
    });
    $(this.ui, '#click-disc')?.addEventListener('click', () => {
      this.click.disconnect();
      this.renderHome();
    });
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
    const a = p.appearance;
    const params = buildParams({ weightKg: p.weightKg, heightCm: p.heightCm, frame: p.frame, wheels: p.wheels, kit: p.kit });
    const opt = <T extends string | number>(values: readonly T[], cur: T, label: (v: T) => string) =>
      values.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${escapeHtml(label(v))}</option>`).join('');
    const sel = <T extends string | number>(id: string, label: I18nKey, values: readonly T[], cur: T, lbl: (v: T) => string) =>
      `<label>${t(label)}<select id="${id}">${opt(values, cur, lbl)}</select></label>`;
    const num = (id: string, label: I18nKey, v: number, min: number, max: number, step = 1) =>
      `<label>${t(label)}<input type="number" id="${id}" value="${v}" min="${min}" max="${max}" step="${step}"></label>`;
    const color = (id: string, label: I18nKey, v: string) => `<label>${t(label)}<input type="color" id="${id}" value="${v}"></label>`;
    const check = (id: string, label: I18nKey, v: boolean) => `<label class="check"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}> ${t(label)}</label>`;
    const swatches = (name: string, label: I18nKey, values: string[], cur: string) => `
      <div class="swatches"><span>${t(label)}</span><div>${values.map((c) =>
        `<label class="swatch" style="--c:${c}"><input type="radio" name="${name}" value="${c}" ${c === cur ? 'checked' : ''}></label>`).join('')}</div></div>`;
    const tr = (prefix: string) => (v: string | number) => t(`${prefix}.${v}` as I18nKey);
    const section = (id: string, label: I18nKey, body: string) =>
      `<details class="pf-sec" data-sec="${id}" ${this.pfOpen.has(id) ? 'open' : ''}><summary>${t(label)}</summary><div class="pf-body">${body}</div></details>`;

    const rider = `
      <label>${t('pf.name')}<input type="text" id="pf-name" value="${escapeHtml(p.name)}" maxlength="30"></label>
      <div class="grid2">
        ${num('pf-weight', 'pf.weight', p.weightKg, 30, 200, 0.5)}
        ${num('pf-height', 'pf.height', p.heightCm, 120, 220)}
        ${num('pf-ftp', 'pf.ftp', p.ftp, 50, 600)}
        ${num('pf-hrmax', 'pf.hrmax', p.hrMax, 100, 230)}
      </div>
      ${swatches('pf-skin', 'pf.skin', SKIN_TONES, a.skin)}
      <div class="grid2">
        ${sel('pf-hair', 'pf.hair', ['short', 'long', 'ponytail', 'bald'] as const, a.hair, tr('hair'))}
        ${sel('pf-beard', 'pf.beard', ['none', 'stubble', 'full'] as const, a.beard, tr('beard'))}
      </div>
      ${swatches('pf-haircolor', 'pf.hairColor', HAIR_COLORS, a.hairColor)}`;

    const kit = `
      ${sel('pf-pattern', 'pf.pattern', ['solid', 'hoops', 'diagonal', 'chest', 'shoulders', 'checker', 'polka', 'gradient'] as const, a.pattern, tr('pat'))}
      <div class="grid3">
        ${color('pf-j1', 'pf.jersey', p.jerseyColor)}
        ${color('pf-j2', 'pf.jersey2', p.jerseyColor2)}
        ${color('pf-j3', 'pf.jersey3', a.jerseyColor3)}
      </div>
      <div class="grid3">
        ${color('pf-shorts', 'pf.shorts', a.shortsColor)}
        ${sel('pf-sleeves', 'pf.sleeves', ['short', 'long'] as const, a.sleeves, tr('sleeves'))}
        ${sel('pf-gloves', 'pf.gloves', ['none', 'mitts', 'full'] as const, a.gloves, tr('gloves'))}
      </div>
      <div class="grid2">
        ${sel('pf-helmet', 'pf.helmetType', ['road', 'aero', 'tt'] as const, a.helmetType, tr('helmet'))}
        ${color('pf-hc', 'pf.helmetColor', p.helmetColor)}
      </div>
      <div class="grid2">
        ${check('pf-glasses', 'pf.glasses', a.glasses)}
        ${sel('pf-lens', 'pf.lens', ['dark', 'blue', 'red', 'orange', 'clear'] as const, a.lens, tr('lens'))}
      </div>
      <div class="grid3">
        ${color('pf-shoes', 'pf.shoes', a.shoeColor)}
        ${sel('pf-sockh', 'pf.socks', ['low', 'mid', 'high'] as const, a.sockHeight, tr('socks'))}
        ${color('pf-sockc', 'pf.sockColor', a.sockColor)}
      </div>
      ${check('pf-over', 'pf.overshoes', p.kit.overshoes)}`;

    const bike = `
      <div class="grid2">
        ${sel('pf-frame', 'pf.frame', ['climb', 'aero', 'gravel', 'tt', 'mtb'] as const, p.frame, tr('frame'))}
        ${sel('pf-wheels', 'pf.wheels', ['alu', 'alu30', 'c30', 'c40', 'c45', 'c50', 'c55', 'c88'] as const, p.wheels, tr('wheel'))}
      </div>
      <div class="grid3">
        ${color('pf-fc', 'pf.frameColor', a.frameColor)}
        ${color('pf-fc2', 'pf.frameColor2', a.frameColor2)}
        ${sel('pf-finish', 'pf.finish', ['gloss', 'matte'] as const, a.finish, tr('finish'))}
      </div>
      <div class="grid2">
        ${check('pf-forkon', 'pf.forkColor', !!a.forkColor)}
        ${color('pf-fork', 'pf.forkColorPick', a.forkColor || a.frameColor2)}
      </div>
      <div class="grid3">
        ${sel('pf-group', 'pf.groupset', ['black', 'silver'] as const, a.groupset, tr('group'))}
        ${color('pf-tape', 'pf.barTape', a.barTape)}
        ${color('pf-saddle', 'pf.saddle', a.saddleColor)}
      </div>
      <div class="grid3">
        ${sel('pf-tirewall', 'pf.tireWall', ['black', 'tan', 'blue', 'red', 'white', 'yellow', 'green'] as const, a.tireWall, tr('tire'))}
        ${sel('pf-bottles', 'pf.bottles', [0, 1, 2] as const, a.bottles, (v) => String(v))}
        ${color('pf-bottlec', 'pf.bottleColor', a.bottleColor)}
      </div>
      ${check('pf-computer', 'pf.computer', a.computer)}
      ${check('pf-towel', 'pf.towel', a.towel)}`;

    const drive = `
      <label>${t('pf.difficulty', { v: Math.round(p.trainerDifficulty * 100) })}<input type="range" id="pf-diff" min="0" max="100" step="5" value="${Math.round(p.trainerDifficulty * 100)}"></label>
      <fieldset><legend>${t('pf.shifting')}</legend>
        <label class="check"><input type="radio" name="pf-shift" value="virtual" ${p.shifting === 'virtual' ? 'checked' : ''}> ${t('pf.shift.virtual')}</label>
        <label class="check"><input type="radio" name="pf-shift" value="manual" ${p.shifting === 'manual' ? 'checked' : ''}> ${t('pf.shift.manual')}</label>
        <h4 class="sub">${t('pf.realSetup')}</h4>
        <div class="grid2">
          ${num('pf-ring', 'pf.chainring', p.chainring, 20, 60)}
          ${num('pf-cog', 'pf.cog', p.cogTeeth, 10, 36)}
        </div>
        <p class="hint">${t('pf.cogHint')}</p>
        <h4 class="sub">${t('pf.virtualSetup')}</h4>
        <div class="grid3">
          <label>${t('pf.rings')}<select id="pf-rings">${Object.keys(CHAINRINGS).map((k) => `<option value="${k}" ${k === p.drivetrain.chainrings ? 'selected' : ''}>${CHAINRINGS[k].length > 1 ? `${k} (${t('pf.double')})` : `${k} (${t('pf.single')})`}</option>`).join('')}</select></label>
          <label>${t('pf.cassette')}<select id="pf-cassette">${Object.keys(CASSETTES).map((k) => `<option value="${k}" ${k === p.drivetrain.cassette ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
          <label>${t('pf.tire')}<select id="pf-tire">${(Object.keys(TIRES) as TireId[]).map((k) => `<option value="${k}" ${k === p.drivetrain.tire ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        </div>
        <label class="check"><input type="checkbox" id="pf-seq" ${p.drivetrain.sequential ? 'checked' : ''}> ${t('pf.sequential')}</label>
        <div class="grid3">
          <label>${t('pf.keyUp')}<input type="text" readonly class="keycap" id="pf-kup" value="${escapeHtml(p.keyGearUp)}"></label>
          <label>${t('pf.keyDown')}<input type="text" readonly class="keycap" id="pf-kdown" value="${escapeHtml(p.keyGearDown)}"></label>
          <label>${t('pf.keyFront')}<input type="text" readonly class="keycap" id="pf-kfront" value="${escapeHtml(p.keyFront)}"></label>
        </div>
        <p class="hint">${t('pf.keyHint')}</p>
      </fieldset>`;

    const display = `
      <div class="grid2">
        ${sel('pf-room', 'pf.room', ['neon', 'workshop', 'living', 'loft'] as const, a.room, tr('room'))}
        ${sel('pf-style', 'pf.style', ['smooth', 'facet'] as const, a.style, tr('style'))}
      </div>
      <div class="grid2">
        ${check('pf-neonon', 'pf.neonOn', a.neonOn)}
        ${color('pf-neon', 'pf.neonColor', a.neonColor)}
      </div>
      <div class="grid2">
        ${sel('pf-quality', 'pf.quality', ['low', 'medium', 'high'] as const, p.quality, tr('q'))}
        ${sel('pf-lang', 'pf.lang', ['fr', 'en'] as const, p.lang, (v) => (v === 'fr' ? 'Français' : 'English'))}
      </div>`;

    return `
      <form class="profile" id="profile-form">
        ${section('rider', 'pf.sec.rider', rider)}
        ${section('kit', 'pf.sec.kit', kit)}
        ${section('bike', 'pf.sec.bike', bike)}
        ${section('effect', 'effect.title', `
          <p class="hint" id="pf-physics">${t('pf.physics', { mass: fmtNum(params.mass, 1), cda: fmtNum(params.cda, 3) })}</p>
          <div class="effect" id="pf-effect">${roadEffectHtml(p)}</div>`)}
        ${section('drive', 'pf.sec.drive', drive)}
        ${section('display', 'pf.sec.display', display)}
        <p class="hint preview-note" id="pf-dirty" hidden>${t('pf.preview')}</p>
        <button type="submit" class="primary big">${t('pf.save')}</button>
      </form>
      <h3>${t('pf.backup')}</h3>
      <p class="hint">${t('pf.backupHint')}</p>
      <div class="row">
        <button id="bk-export">${t('pf.export')}</button>
        <label class="file-btn">${t('pf.import')}<input type="file" accept=".json,application/json" id="bk-import" hidden></label>
      </div>`;
  }

  /** Lit le formulaire du profil et renvoie le profil qui en résulte (sans l'enregistrer). */
  private readProfileForm(): Profile {
    const p = this.profile;
    const val = (id: string) => $<HTMLInputElement>(this.ui, `#${id}`).value;
    const chk = (id: string) => $<HTMLInputElement>(this.ui, `#${id}`).checked;
    const radio = (name: string, d: string) => $<HTMLInputElement>(this.ui, `input[name=${name}]:checked`)?.value ?? d;
    const clamp = (v: number, a: number, b: number, d: number) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
    const appearance: Appearance = {
      ...p.appearance,
      skin: radio('pf-skin', p.appearance.skin),
      hair: val('pf-hair') as Appearance['hair'],
      hairColor: radio('pf-haircolor', p.appearance.hairColor),
      beard: val('pf-beard') as Appearance['beard'],
      pattern: val('pf-pattern') as Appearance['pattern'],
      jerseyColor3: val('pf-j3'),
      shortsColor: val('pf-shorts'),
      sleeves: val('pf-sleeves') as Appearance['sleeves'],
      gloves: val('pf-gloves') as Appearance['gloves'],
      helmetType: val('pf-helmet') as Appearance['helmetType'],
      glasses: chk('pf-glasses'),
      lens: val('pf-lens') as Appearance['lens'],
      shoeColor: val('pf-shoes'),
      sockColor: val('pf-sockc'),
      sockHeight: val('pf-sockh') as Appearance['sockHeight'],
      frameColor: val('pf-fc'),
      frameColor2: val('pf-fc2'),
      finish: val('pf-finish') as Appearance['finish'],
      groupset: val('pf-group') as Appearance['groupset'],
      barTape: val('pf-tape'),
      tireWall: val('pf-tirewall') as Appearance['tireWall'],
      saddleColor: val('pf-saddle'),
      bottles: Number(val('pf-bottles')) as Appearance['bottles'],
      bottleColor: val('pf-bottlec'),
      computer: chk('pf-computer'),
      towel: chk('pf-towel'),
      forkColor: chk('pf-forkon') ? val('pf-fork') : '',
      room: val('pf-room') as Appearance['room'],
      style: val('pf-style') as Appearance['style'],
      neonOn: chk('pf-neonon'),
      neonColor: val('pf-neon'),
    };
    return {
      ...p,
      name: val('pf-name').trim(),
      weightKg: clamp(parseFloat(val('pf-weight')), 30, 200, p.weightKg),
      heightCm: clamp(parseFloat(val('pf-height')), 120, 220, p.heightCm),
      ftp: clamp(parseFloat(val('pf-ftp')), 50, 600, p.ftp),
      hrMax: clamp(parseFloat(val('pf-hrmax')), 100, 230, p.hrMax),
      frame: val('pf-frame') as FrameId,
      wheels: val('pf-wheels') as WheelId,
      // le casque aéro/CLM et les chaussettes hautes comptent aussi dans la physique
      kit: { aeroHelmet: appearance.helmetType !== 'road', highSocks: appearance.sockHeight === 'high', overshoes: chk('pf-over') },
      jerseyColor: val('pf-j1'),
      jerseyColor2: val('pf-j2'),
      helmetColor: val('pf-hc'),
      appearance,
      trainerDifficulty: clamp(parseFloat(val('pf-diff')) / 100, 0, 1, 1),
      shifting: radio('pf-shift', 'virtual') as Profile['shifting'],
      chainring: Math.round(clamp(parseFloat(val('pf-ring')), 20, 60, p.chainring)),
      cogTeeth: Math.round(clamp(parseFloat(val('pf-cog')), 10, 36, p.cogTeeth)),
      keyGearUp: val('pf-kup') || 'PageUp',
      keyGearDown: val('pf-kdown') || 'PageDown',
      keyFront: val('pf-kfront') || 'f',
      drivetrain: { chainrings: val('pf-rings'), cassette: val('pf-cassette'), tire: val('pf-tire') as TireId, sequential: chk('pf-seq') },
      quality: val('pf-quality') as QualityLevel,
      lang: val('pf-lang') as Lang,
    };
  }

  private bindProfileTab(): void {
    const form = $<HTMLFormElement>(this.ui, '#profile-form');
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
    // Sections repliables : on se souvient de celles qui sont ouvertes.
    this.ui.querySelectorAll<HTMLDetailsElement>('details.pf-sec').forEach((d) =>
      d.addEventListener('toggle', () => {
        if (d.open) this.pfOpen.add(d.dataset.sec!);
        else this.pfOpen.delete(d.dataset.sec!);
      }),
    );
    // Aperçu en direct : chaque modification redessine l'avatar (au plus une fois par image).
    let pending = 0;
    const preview = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        const draft = this.readProfileForm();
        this.home.setLook(lookFromProfile(draft));
        const params = buildParams({ weightKg: draft.weightKg, heightCm: draft.heightCm, frame: draft.frame, wheels: draft.wheels, kit: draft.kit });
        $(this.ui, '#pf-physics').textContent = t('pf.physics', { mass: fmtNum(params.mass, 1), cda: fmtNum(params.cda, 3) });
        $(this.ui, '#pf-effect').innerHTML = roadEffectHtml(draft);
        $(this.ui, '#pf-dirty').hidden = false;
      });
    };
    form.addEventListener('input', preview);
    form.addEventListener('change', preview);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const next = this.readProfileForm();
      Object.assign(this.save.profile, next, { configured: true });
      writeSave(this.save);
      setLang(next.lang);
      this.engine.setQuality(QUALITY[next.quality]);
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

  /**
   * Animation « on entre dans la TV » avant la sortie : la caméra passe au-dessus de l'épaule
   * du cycliste et plonge dans l'écran, qui s'illumine, puis le chargement commence.
   */
  private async playEnterTv(): Promise<HTMLElement | null> {
    if (this.ride || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
    this.entering = true;
    this.ui.querySelector('.home')?.classList.add('leaving');
    const flash = document.createElement('div');
    flash.className = 'tv-flash';
    document.body.appendChild(flash);
    await this.home.enterTv((p) => {
      flash.style.opacity = String(Math.max(0, (p - 0.72) / 0.28));
    });
    this.entering = false;
    return flash;
  }

  private async startRide(source: RideSource): Promise<void> {
    if (this.entering) return;
    const flash = await this.playEnterTv();
    const title = source.kind === 'gpx' ? source.route.name : source.name;
    this.ui.innerHTML = `
      <div class="loading">
        <h2>${escapeHtml(title)}</h2>
        <p>${t('load.title')}</p>
        <div class="progress"><div id="prog"></div></div>
        <small id="prog-step"></small>
      </div>
      <div id="ride-overlay"></div>`;
    if (flash) {
      requestAnimationFrame(() => flash.classList.add('out'));
      setTimeout(() => flash.remove(), 800);
    }
    const overlay = $(this.ui, '#ride-overlay');
    const ride = new RideView(source, this.profile, this.devices, QUALITY[this.profile.quality], overlay, {
      onPauseMenu: () => this.showPause(),
      onFinish: (summary, samples, ranking) => this.showReport(summary, samples, ranking),
    }, this.setup);
    ride.scene.environment = this.engine.environment();
    ride.scene.environmentIntensity = 0.45;
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
      ${this.profile.shifting === 'virtual' && CHAINRINGS[this.profile.drivetrain.chainrings]?.length > 1 && !this.profile.drivetrain.sequential ? `<button data-act="gfront">⚙ ${t('touch.front')}</button>` : ''}
      ${this.devices.hasPowerSource ? '' : `<button data-act="down">− W</button><button data-act="up">+ W</button>`}
      ${this.ride?.isOpen ? `<button data-act="left">◀</button><button data-act="uturn">↩ ${t('touch.uturn')}</button><button data-act="right">▶</button>` : ''}
      <button data-act="pause">⏸ ${t('touch.pause')}</button>`;
    overlay.appendChild(bar);
    bar.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (!this.ride) return;
      if (act === 'cam') this.ride.rig.next();
      if (act === 'gup') this.ride.shift(1);
      if (act === 'gdown') this.ride.shift(-1);
      if (act === 'gfront') this.ride.shiftFront();
      if (act === 'left') this.ride.turn(-1);
      if (act === 'right') this.ride.turn(1);
      if (act === 'uturn') this.ride.uTurn();
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

  private showReport(s: RideSummary, samples: Sample[], ranking: RankEntry[] = []): void {
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
      ...(s.sprintWins ? [['rep.sprints', String(s.sprintWins)] as [I18nKey, string]] : []),
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
        ${ranking.length && this.setup.mode === 'race' ? `
          <h4>${t('rep.podium')}</h4>
          <ol class="podium">${ranking.map((r, i) => `<li class="${r.isPlayer ? 'me' : ''}"><b>${i + 1}. ${escapeHtml(r.name)}</b><span>${escapeHtml(r.team)}${r.finishTime !== null ? ` · ${fmtTime(r.finishTime)}` : ''}</span></li>`).join('')}</ol>` : ''}
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

  /** Bandeau « Nouvelle version disponible ». Ta sauvegarde est conservée au rechargement. */
  private showUpdateBanner(): void {
    if (document.querySelector('.update-banner')) return;
    const b = document.createElement('div');
    b.className = 'update-banner';
    b.innerHTML = `<span>✨ ${t('upd.text')}</span><button class="primary">${t('upd.reload')}</button><button class="ghost" aria-label="${t('upd.later')}">✕</button>`;
    b.querySelector('.primary')!.addEventListener('click', () => location.reload());
    b.querySelector('.ghost')!.addEventListener('click', () => b.remove());
    document.body.appendChild(b);
  }

  private exitRide(): void {
    this.ride?.dispose();
    this.ride = null;
    this.engine.setView(this.home);
    this.home.exitTv();
    this.tab = this.message ? this.tab : 'history';
    if (!this.save.history.length) this.tab = 'ride';
    this.renderHome();
    if (this.updateReady) this.showUpdateBanner();
  }
}

/**
 * « Effet sur la route » : vitesse gagnée ou perdue à 250 W pour chaque choix de matériel,
 * sur le plat et dans une côte à 8 %, par rapport à un vélo route en alu sans accessoire aéro.
 */
function roadEffectHtml(p: Profile): string {
  const base: RiderSetup = { weightKg: p.weightKg, heightCm: p.heightCm, frame: 'climb', wheels: 'alu', kit: { aeroHelmet: false, highSocks: false, overshoes: false } };
  const speed = (su: RiderSetup, grade: number) =>
    steadySpeed(250, { grade, headwind: 0, rho: airDensity(0), crr: crrFor(su.frame, 'asphalt'), draft: 1 }, buildParams(su)) * 3.6;
  const rows: Array<[I18nKey, RiderSetup]> = [
    ['effect.frame', { ...base, frame: p.frame }],
    ['effect.wheels', { ...base, wheels: p.wheels }],
    ['effect.helmet', { ...base, kit: { ...base.kit, aeroHelmet: p.kit.aeroHelmet } }],
    ['effect.socks', { ...base, kit: { ...base.kit, highSocks: p.kit.highSocks } }],
    ['effect.overshoes', { ...base, kit: { ...base.kit, overshoes: p.kit.overshoes } }],
    ['effect.total', { ...base, frame: p.frame, wheels: p.wheels, kit: p.kit }],
  ];
  const f0 = speed(base, 0), c0 = speed(base, 0.08);
  const cell = (d: number) => {
    const v = Math.abs(d) < 0.005 ? '0,00' : `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d), 2)}`;
    return `<td class="${d > 0.005 ? 'pos' : d < -0.005 ? 'neg' : ''}">${v}</td>`;
  };
  return `
    <table><thead><tr><th></th><th>${t('effect.flat')}</th><th>${t('effect.climb')}</th></tr></thead><tbody>
      ${rows.map(([k, su]) => `<tr class="${k === 'effect.total' ? 'total' : ''}"><th>${t(k)}</th>${cell(speed(su, 0) - f0)}${cell(speed(su, 0.08) - c0)}</tr>`).join('')}
    </tbody></table>
    <small>${t('effect.hint')} (km/h)</small>`;
}

/** Recherche d'une adresse ou d'un lieu en France (service de géocodage de l'IGN). */
async function searchPlaces(q: string): Promise<FreeStart[]> {
  const url = `https://data.geopf.fr/geocodage/search?${new URLSearchParams({ q, limit: '6' })}`;
  const res = await fetch(url);
  const json = (await res.json()) as { features?: Array<{ geometry: { coordinates: [number, number] }; properties: { label?: string } }> };
  return (json.features ?? []).map((f) => ({ name: f.properties.label ?? q, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}
