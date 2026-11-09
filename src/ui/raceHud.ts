/**
 * Affichage spécifique aux sorties en groupe et aux courses : barre d'aspiration,
 * mini-classement avec les écarts, annonces (attaque, échappée, sprint…).
 */
import { t, type I18nKey } from '../i18n';
import { escapeHtml, fmtKm, fmtNum } from './format';
import type { RankEntry, PelotonEvent } from '../ride/ai/peloton';

export interface RaceHudState {
  mode: 'group' | 'race';
  /** coefficient d'aspiration du joueur (1 = aucun abri) */
  draft: number;
  /** watts économisés grâce à l'abri */
  saved: number;
  ranking: RankEntry[];
  /** vitesse du joueur (m/s), pour convertir les écarts en secondes */
  speed: number;
  /** distance restante (course) ou null */
  remaining: number | null;
  /** vent de côté marqué (bordure possible) */
  crosswind: boolean;
  /** prochaine pancarte d'entrée de ville (sprint), ou null */
  sign?: { name: string; dist: number; live: boolean } | null;
}

export class RaceHud {
  readonly el: HTMLElement;
  private draftBar: HTMLElement;
  private draftText: HTMLElement;
  private board: HTMLElement;
  private toast: HTMLElement;
  private toastTimer = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'race-hud';
    this.el.innerHTML = `
      <div class="hud-box draft-box">
        <div class="draft-head"><b>${t('race.draft')}</b><span data-q="dtext"></span></div>
        <div class="draft-bar"><div data-q="dbar"></div></div>
      </div>
      <div class="hud-box board" data-q="board"></div>
      <div class="sign-box" data-q="sign"></div>
      <div class="race-toast" data-q="toast"></div>`;
    parent.appendChild(this.el);
    const q = (k: string) => this.el.querySelector(`[data-q="${k}"]`) as HTMLElement;
    this.draftBar = q('dbar');
    this.draftText = q('dtext');
    this.board = q('board');
    this.toast = q('toast');
    this.signBox = q('sign');
  }

  private signBox: HTMLElement;

  /** Affiche une annonce quelques secondes. */
  announce(e: PelotonEvent): void {
    this.toast.textContent = t(e.key as I18nKey, { name: e.name ?? '' });
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 3500);
  }

  update(s: RaceHudState): void {
    if (s.sign) {
      this.signBox.style.display = '';
      this.signBox.className = `sign-box${s.sign.live ? ' live' : ''}`;
      this.signBox.innerHTML = `<span class="sb-title">${t('race.signSprint')}</span><span class="sb-town">${escapeHtml(s.sign.name)}</span><span class="sb-dist">${Math.max(0, Math.round(s.sign.dist))} m</span>`;
    } else this.signBox.style.display = 'none';
    const gain = Math.max(0, 1 - s.draft);
    this.draftBar.style.width = `${Math.min(100, (gain / 0.48) * 100)}%`;
    this.draftBar.className = gain > 0.25 ? 'strong' : gain > 0.08 ? 'mid' : '';
    this.draftText.textContent = gain > 0.01 ? `−${Math.round(gain * 100)} % · ${fmtNum(s.saved)} W` : t(s.crosswind ? 'race.noShelterWind' : 'race.noShelter');

    const me = s.ranking.findIndex((r) => r.isPlayer);
    const meDist = s.ranking[me]?.dist ?? 0;
    const v = Math.max(3, s.speed);
    const gapText = (r: RankEntry) => {
      if (r.isPlayer) return '';
      const d = r.dist - meDist;
      if (Math.abs(d) < 3) return t('race.with');
      const sec = Math.round(Math.abs(d) / v);
      return `${d > 0 ? '+' : '−'}${sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`}`;
    };
    // le joueur et ses voisins au classement
    const from = Math.max(0, Math.min(me - 3, s.ranking.length - 7));
    const rows = s.ranking.slice(from, from + 7);
    const head = s.mode === 'race'
      ? `${t('race.position', { p: me + 1, n: s.ranking.length })}${s.remaining !== null ? ` · ${fmtKm(Math.max(0, s.remaining), 1)} km` : ''}`
      : t('race.groupTitle');
    this.board.innerHTML = `
      <div class="board-head">${head}</div>
      <ol start="${from + 1}">${rows.map((r) => `
        <li class="${r.isPlayer ? 'me' : ''}"><span class="nm">${escapeHtml(r.name)}</span><span class="gp">${r.finishTime !== null ? '🏁' : gapText(r)}</span></li>`).join('')}
      </ol>`;
  }

  dispose(): void {
    clearTimeout(this.toastTimer);
    this.el.remove();
  }
}
