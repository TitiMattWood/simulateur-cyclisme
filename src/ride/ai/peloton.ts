/**
 * Coureurs IA et comportement collectif (sortie en groupe et course).
 *
 * Aucun graphisme ici : uniquement la physique et les décisions, pour pouvoir le tester seul.
 *
 * Chaque IA a sa propre physique (même modèle que le joueur), une FTP et une réserve d'énergie
 * « W′ » : au-dessus de son seuil elle puise dans cette réserve, en dessous elle la recharge.
 * Réserve vide = elle ne peut plus dépasser son seuil (elle « craque »).
 *
 * Le peloton roule en formation (deux files décalées). La tête de groupe impose l'allure ;
 * les autres asservissent leur puissance pour tenir leur place. Avec du vent de côté, la
 * formation se met en éventail (bordure) et ceux qui n'ont plus de place sur la route
 * perdent l'abri.
 */
import { buildParams, powerForSpeed, RiderDynamics, type PhysicsParams, type Conditions } from '../../physics/model';
import type { SurfaceId } from '../../physics/equipment';
import { draftFactor, apparentYaw, WAKE_DRIFT, type Neighbour } from '../../physics/draft';
import type { RiderLook } from '../../render/look';
import type { RideSetup } from '../setup';
import { aiLook } from './looks';

export type AiKind = 'climber' | 'rouleur' | 'sprinter';
export type AiState = 'pack' | 'pull' | 'attack' | 'break' | 'sprint' | 'finished';

/** Ce que le peloton doit savoir de la route à une distance donnée. */
export interface RoadInfo {
  grade: number;
  ele: number;
  surface: SurfaceId;
  /** vitesse conseillée (virages serrés) */
  vmax: number;
  dirX: number;
  dirZ: number;
}

export interface PelotonEnv {
  road(d: number): RoadInfo;
  rho(ele: number): number;
  crr(frame: RiderLook['frame'], surface: SurfaceId): number;
  /** vent dans le repère du monde (m/s), soufflant VERS (x, z) */
  wind: { x: number; z: number };
  /** distance d'arrivée (course) ou null */
  finish: number | null;
}

export interface PlayerState {
  dist: number;
  v: number;
  /** décalage latéral du joueur (m, + = gauche) : 0 = file normale */
  lateral: number;
}

/** Annonce affichée à l'écran (clé de traduction + paramètres). */
export interface PelotonEvent {
  key: 'ev.attack' | 'ev.break' | 'ev.caught' | 'ev.sprint' | 'ev.relay' | 'ev.waiting' | 'ev.dropped' | 'ev.finish'
    | 'ev.signSprint' | 'ev.signWon' | 'ev.signLost';
  name?: string;
}

export interface RankEntry {
  name: string;
  team: string;
  dist: number;
  isPlayer: boolean;
  finishTime: number | null;
}

/** Générateur pseudo-aléatoire stable (mêmes courses pour une même graine). */
function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class AiRider {
  readonly params: PhysicsParams;
  readonly dyn: RiderDynamics;
  readonly wPrime: number;
  wBal: number;
  dist: number;
  lateral = 0;
  targetLateral = 0;
  power = 0;
  draft = 1;
  state: AiState = 'pack';
  stateT = 0;
  finishTime: number | null = null;
  /** sprint pancarte : distance du panneau visé (le coureur sprinte jusqu'à le passer) */
  sprintTarget: number | null = null;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly team: string,
    readonly kind: AiKind,
    readonly ftp: number,
    readonly look: RiderLook,
    dist: number,
  ) {
    this.params = buildParams({
      weightKg: look.weightKg, heightCm: look.heightCm, frame: look.frame, wheels: look.wheels,
      kit: { aeroHelmet: look.helmetType !== 'road', highSocks: look.sockHeight === 'high', overshoes: false },
    });
    this.dyn = new RiderDynamics(this.params);
    this.wPrime = kind === 'sprinter' ? 24000 : kind === 'climber' ? 16000 : 20000;
    this.wBal = this.wPrime;
    this.dist = dist;
  }

  /** Puissance maximale possible maintenant (sprint si la réserve le permet). */
  get maxPower(): number {
    if (this.wBal <= 0) return this.ftp * 0.97;
    const peak = this.kind === 'sprinter' ? 2.6 : this.kind === 'rouleur' ? 1.9 : 1.8;
    return this.ftp * (1 + (peak - 1) * Math.min(1, this.wBal / (this.wPrime * 0.4)));
  }

  /** Fraction de réserve d'énergie restante (0 à 1). */
  get energy(): number {
    return Math.max(0, this.wBal / this.wPrime);
  }

  /** Applique le modèle d'énergie et renvoie la puissance réellement développée. */
  spend(target: number, dt: number): number {
    const p = Math.max(0, Math.min(target, this.maxPower));
    if (p > this.ftp) this.wBal -= (p - this.ftp) * dt;
    else this.wBal = Math.min(this.wPrime, this.wBal + (this.ftp - p) * dt * 0.7);
    this.power = p;
    return p;
  }
}

export class Peloton {
  readonly riders: AiRider[] = [];
  /** ordre de rotation des coureurs « dans le paquet » (indices dans riders) ; 0 = tête */
  private order: number[] = [];
  private relayT = 0;
  private relayPeriod = 60;
  private waiting = false;
  /** ralentissement léger de la tête quand le joueur décroche de quelques mètres (0 à 1) */
  private ease = 0;
  private elapsed = 0;
  private rnd: () => number;
  private pending: PelotonEvent[] = [];
  private decideT = 0;
  /** abri dont bénéficie le joueur (coefficient sur la résistance de l'air) */
  playerDraft = 1;
  /** angle du vent apparent au niveau du joueur (pour l'affichage) */
  yaw = 0;

  constructor(
    readonly setup: RideSetup,
    readonly playerFtp: number,
    style: RiderLook['style'],
    startDist: number,
    seed = 42,
  ) {
    this.rnd = rng(seed);
    const n = Math.max(1, Math.min(10, Math.round(setup.riders)));
    const kinds: AiKind[] = ['rouleur', 'climber', 'sprinter', 'rouleur', 'climber', 'rouleur', 'sprinter', 'climber', 'rouleur', 'rouleur'];
    for (let i = 0; i < n; i++) {
      const kind = kinds[i % kinds.length];
      const { look, name, team } = aiLook(seed * 31 + i * 17 + 3, style);
      // les grimpeurs sont plus légers
      if (kind === 'climber') look.weightKg = Math.min(look.weightKg, 62 + Math.round(this.rnd() * 4));
      if (kind === 'sprinter') look.weightKg = Math.max(look.weightKg, 74);
      let ftp: number;
      if (setup.mode === 'race') {
        const kf = kind === 'rouleur' ? 1.04 : kind === 'climber' ? 0.97 : 0.95;
        ftp = setup.level * playerFtp * kf * (0.95 + this.rnd() * 0.1);
      } else {
        // en groupe, les IA doivent pouvoir tenir l'allure et revenir sur le joueur
        ftp = playerFtp * Math.max(1.2, setup.pace * 1.7);
      }
      // départ en formation devant le joueur
      const d = startDist + 2 + i * 1.15;
      this.riders.push(new AiRider(i, name, team, kind, Math.round(ftp), look, d));
    }
    // le premier de l'ordre est le plus en avant
    this.order = this.riders.map((_, i) => i).sort((a, b) => this.riders[b].dist - this.riders[a].dist);
    this.relayPeriod = 45 + this.rnd() * 45;
  }

  /** Annonces apparues depuis le dernier appel. */
  takeEvents(): PelotonEvent[] {
    const e = this.pending;
    this.pending = [];
    return e;
  }

  private announce(key: PelotonEvent['key'], name?: string): void {
    this.pending.push({ key, name });
  }

  /** Coureurs encore « dans le paquet » (ni échappés, ni arrivés), dans l'ordre de rotation. */
  private packOrder(): AiRider[] {
    return this.order.map((i) => this.riders[i]).filter((r) => r.state === 'pack' || r.state === 'pull' || r.state === 'sprint');
  }

  /** Conditions physiques d'un coureur à sa position (vent apparent et abri compris). */
  private conditions(dist: number, v: number, frame: RiderLook['frame'], draft: number, env: PelotonEnv): { c: Conditions; road: RoadInfo; yaw: number } {
    const road = env.road(dist);
    const head = -(env.wind.x * road.dirX + env.wind.z * road.dirZ);
    // composante qui souffle vers la droite de la marche (= vent venant de la gauche) ;
    // droite de la marche = (−dirZ, dirX) dans le plan x-z
    const cross = -env.wind.x * road.dirZ + env.wind.z * road.dirX;
    const yaw = apparentYaw(v, head, cross);
    const c: Conditions = { grade: road.grade, headwind: head, rho: env.rho(road.ele), crr: env.crr(frame, road.surface), draft };
    return { c, road, yaw };
  }

  /** Voisins de quelqu'un situé en (dist, lateral), en excluant self. */
  private neighbours(dist: number, lateral: number, self: AiRider | null, player: PlayerState | null): Neighbour[] {
    const out: Neighbour[] = [];
    for (const r of this.riders) {
      if (r === self || r.state === 'finished') continue;
      const dx = r.dist - dist;
      if (dx > -2 && dx < 9) out.push({ dx, dy: r.lateral - lateral });
    }
    if (player) {
      const dx = player.dist - dist;
      if (dx > -2 && dx < 9) out.push({ dx, dy: player.lateral - lateral });
    }
    return out;
  }

  /** Allure de la tête du paquet (W), selon le mode et la pente. */
  private leadPower(leader: AiRider, grade: number, remaining: number | null): number {
    const s = this.setup;
    let base: number;
    if (s.mode === 'group') base = s.pace * this.playerFtp;
    else {
      const avg = this.riders.reduce((a, r) => a + r.ftp, 0) / this.riders.length;
      base = 0.8 * avg;
      // les échappés sont poursuivis
      if (this.riders.some((r) => r.state === 'break' || r.state === 'attack')) base = 0.92 * avg;
      if (remaining !== null && remaining < 2000) base = 0.95 * avg;
    }
    // un vrai groupe : on garde les watts en côte, on récupère en descente
    let k = 1;
    if (grade > 0.02) k = 1.08;
    else if (grade < -0.04) k = 0.25;
    else if (grade < 0) k = 1 + grade * 15;
    return Math.min(base * k, leader.maxPower);
  }

  /**
   * Sprint pancarte : les coureurs qui en ont envie (et de l'énergie) sprintent jusqu'au panneau.
   * Les sprinteurs y vont toujours, les autres une fois sur deux.
   */
  startSignSprint(target: number): void {
    for (const r of this.riders) {
      if (r.state === 'finished' || r.dist > target) continue;
      const keen = r.kind === 'sprinter' ? 1 : r.kind === 'rouleur' ? 0.55 : 0.4;
      if (r.energy > 0.35 && this.rnd() < keen) {
        r.state = 'sprint';
        r.sprintTarget = target;
        r.stateT = 0;
      }
    }
  }

  /** Le joueur a fait demi-tour (trajet libre) : le groupe aussi, et revient vers lui. */
  onPlayerUTurn(playerDist: number): void {
    for (const r of this.riders) {
      const gap = Math.abs(r.dist - playerDist);
      r.dist = playerDist - gap - 4;
      r.state = r.state === 'finished' ? 'finished' : 'pack';
    }
    this.order.sort((a, b) => this.riders[b].dist - this.riders[a].dist);
  }

  /** Avance la simulation de dt secondes. */
  step(dt: number, player: PlayerState, env: PelotonEnv): void {
    this.elapsed += dt;
    const race = this.setup.mode === 'race';
    const pack = this.packOrder();
    const leader = pack[0] ?? null;

    // ----- Le joueur mène-t-il le paquet ?
    const playerLeads = !!leader && player.dist > leader.dist + 1.0;
    const refDist = playerLeads ? player.dist : leader?.dist ?? player.dist;
    const refV = playerLeads ? player.v : leader?.dyn.v ?? player.v;

    // ----- Attente du joueur (sortie en groupe)
    if (this.setup.mode === 'group' && this.setup.wait && pack.length) {
      const tail = Math.min(...pack.map((r) => r.dist));
      const gap = tail - player.dist;
      if (!this.waiting && gap > 30) {
        this.waiting = true;
        this.announce('ev.waiting');
      } else if (this.waiting && gap < 8) this.waiting = false;
      // sortie club : dès que le joueur lâche quelques mètres, la tête lève un peu le pied
      const want = gap > 3 ? Math.min(1, (gap - 3) / 10) : 0;
      this.ease += (want - this.ease) * Math.min(1, dt * 0.5);
    } else {
      this.waiting = false;
      this.ease = 0;
    }

    // ----- Relais en tête
    if ((this.setup.relay || race) && pack.length > 1 && !playerLeads) {
      this.relayT += dt;
      if (this.relayT > this.relayPeriod) {
        this.relayT = 0;
        this.relayPeriod = 45 + this.rnd() * 45;
        const i = this.order.indexOf(leader!.id);
        if (i >= 0) {
          this.order.splice(i, 1);
          this.order.push(leader!.id);
          leader!.state = 'pull';
          leader!.stateT = 0;
          if (!race) this.announce('ev.relay', leader!.name);
        }
      }
    }

    // ----- Décisions de course (une fois par seconde)
    const remaining = env.finish !== null ? env.finish - player.dist : null;
    this.decideT += dt;
    if (race && this.decideT >= 1) {
      this.decideT = 0;
      this.raceDecisions(env, pack);
    }

    // ----- Vent apparent et formation (éventail par vent de côté)
    const pc = this.conditions(player.dist, Math.max(player.v, 5), 'climb', 1, env);
    this.yaw = pc.yaw;
    const echelon = Math.abs(this.yaw) > 0.12;
    const slots = this.packOrder();
    const offset = playerLeads ? 1 : 0;
    slots.forEach((r, k) => {
      const slot = k + offset;
      if (r.state === 'pull') {
        // relayeur qui se décale et se laisse glisser à l'arrière
        r.targetLateral = 0.95;
      } else if (echelon) {
        // Éventail : la tête roule côté vent, chacun se décale d'un cran côté abri ;
        // quand la route est pleine, les derniers se retrouvent « dans la bordure » sans abri.
        const side = this.yaw > 0 ? -1 : 1;
        const step = 1.15 * Math.tan(Math.min(1.1, Math.abs(this.yaw))) * WAKE_DRIFT;
        const start = side < 0 ? 2.4 : -0.3;
        r.targetLateral = Math.max(-0.3, Math.min(2.6, start + side * slot * step));
      } else {
        r.targetLateral = slot % 2 === 0 ? 0 : 0.55;
      }
    });

    // ----- Physique de chaque IA
    for (const r of this.riders) {
      r.stateT += dt;
      // évite de se superposer au joueur
      if (Math.abs(r.dist - player.dist) < 1.7 && Math.abs(r.targetLateral - player.lateral) < 0.45) r.targetLateral = player.lateral + 0.7;
      r.lateral += (r.targetLateral - r.lateral) * Math.min(1, dt * 1.5);
      const neigh = this.neighbours(r.dist, r.lateral, r, player);
      const { c, road, yaw } = this.conditions(r.dist, Math.max(r.dyn.v, 5), r.look.frame, 1, env);
      r.draft = draftFactor(neigh, yaw);
      c.draft = r.draft;

      let target: number;
      const slot = slots.indexOf(r);
      if (r.state === 'finished') target = r.ftp * 0.35;
      else if (r.state === 'attack') target = r.ftp * 1.3;
      else if (r.state === 'break') target = r.ftp * 1.02;
      else if (r.state === 'sprint') target = r.maxPower;
      else if (slot === 0 && !playerLeads && this.waiting) {
        // on attend : la tête roule un peu moins vite que le joueur pour qu'il revienne
        target = powerForSpeed(Math.max(2.5, player.v * 0.8), c, r.params);
      } else if (slot === 0 && !playerLeads) target = this.leadPower(r, road.grade, remaining) * (1 - 0.3 * this.ease);
      else {
        // tenir sa place : puissance pour rouler à la vitesse de référence, corrigée par l'écart
        const k = slot + offset;
        const dTarget = refDist - k * 1.15;
        const err = dTarget - r.dist;
        target = powerForSpeed(refV, c, r.params) + 32 * err + 70 * (refV - r.dyn.v);
        if (r.state === 'pull' && err > -1.5 && r.stateT > 3) r.state = 'pack';
      }
      const p = r.spend(target, dt);
      const v = r.dyn.step(dt, p, c, road.vmax);
      r.dist += v * dt;
      // sprint pancarte terminé : on se relève et on reprend sa place
      if (r.sprintTarget !== null && r.dist > r.sprintTarget + 25) {
        r.sprintTarget = null;
        if (r.state === 'sprint') r.state = 'pack';
      }
      if (env.finish !== null && r.finishTime === null && r.dist >= env.finish) {
        r.finishTime = this.elapsed;
        r.state = 'finished';
      }
    }
    // l'ordre de rotation suit les positions réelles en tête (dépassements)
    this.order.sort((a, b) => this.slotKey(b) - this.slotKey(a));

    // ----- Abri du joueur
    this.playerDraft = draftFactor(this.neighbours(player.dist, player.lateral, null, null), this.yaw);
  }

  /**
   * Position latérale idéale pour le joueur (placement automatique, comme dans les jeux de
   * vélo en ligne) : dans l'abri du coureur qui le précède, décalé selon le vent de côté.
   */
  bestLateralFor(player: PlayerState): number {
    let best: AiRider | null = null;
    for (const r of this.riders) {
      const dx = r.dist - player.dist;
      if (dx > 0.3 && dx < 6 && (!best || dx < best.dist - player.dist)) best = r;
    }
    if (!best) return player.lateral;
    const dx = best.dist - player.dist;
    const shift = -dx * Math.tan(Math.max(-1.1, Math.min(1.1, this.yaw))) * WAKE_DRIFT;
    return Math.max(-0.3, Math.min(2.6, best.lateral + shift));
  }

  /** Clé de tri : on garde l'ordre de rotation sauf pour les relayeurs qui reculent. */
  private slotKey(i: number): number {
    const r = this.riders[i];
    return r.state === 'pull' ? r.dist - 1000 : r.dist;
  }

  /** Attaques, échappées, poursuite et sprint. */
  private raceDecisions(env: PelotonEnv, pack: AiRider[]): void {
    for (const r of this.riders) {
      if (r.state === 'finished') continue;
      const ahead = env.road(r.dist + 150);
      const climbing = ahead.grade > 0.04;
      const toGo = env.finish !== null ? env.finish - r.dist : Infinity;
      // sprint final
      if (toGo < (r.kind === 'sprinter' ? 330 : 250) && r.state !== 'sprint') {
        if (r.state === 'pack' && r.kind === 'sprinter') this.announce('ev.sprint', r.name);
        r.state = 'sprint';
        continue;
      }
      if (r.state === 'attack' && r.stateT > 20 + this.rnd() * 25) {
        const packFront = Math.max(...pack.filter((p) => p !== r).map((p) => p.dist), -Infinity);
        if (r.dist - packFront > 20) {
          r.state = 'break';
          this.announce('ev.break', r.name);
        } else {
          r.state = 'pack';
        }
        r.stateT = 0;
      } else if (r.state === 'break' && r.energy < 0.2) {
        r.state = 'pack';
        r.stateT = 0;
        this.announce('ev.caught', r.name);
      } else if (r.state === 'pack' && toGo > 1500) {
        const p = climbing
          ? (r.kind === 'climber' ? 0.06 : 0.015) * (r.energy > 0.6 ? 1 : 0)
          : (r.kind === 'rouleur' && this.elapsed > 90 ? 0.004 : 0.001) * (r.energy > 0.75 ? 1 : 0);
        const someoneAway = this.riders.filter((x) => x.state === 'attack' || x.state === 'break').length;
        if (someoneAway < 2 && this.rnd() < p) {
          r.state = 'attack';
          r.stateT = 0;
          r.targetLateral = 1.0;
          this.announce('ev.attack', r.name);
        }
      }
      if (r.state === 'pack' && r.energy <= 0.02 && r.stateT > 5) {
        r.stateT = 0;
        this.announce('ev.dropped', r.name);
      }
    }
  }

  /** Classement en direct (les arrivés d'abord, par temps ; puis par distance). */
  ranking(player: PlayerState & { name: string; finishTime: number | null }): RankEntry[] {
    const all: RankEntry[] = this.riders.map((r) => ({ name: r.name, team: r.team, dist: r.dist, isPlayer: false, finishTime: r.finishTime }));
    all.push({ name: player.name, team: '', dist: player.dist, isPlayer: true, finishTime: player.finishTime });
    return all.sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.dist - a.dist;
    });
  }
}
