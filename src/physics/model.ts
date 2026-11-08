/**
 * Moteur physique : transforme la puissance mesurée par le home trainer en vitesse virtuelle.
 *
 * Bilan des forces le long de la route (modèle de Martin et al., 1998) :
 *
 *   F_moteur  = P × rendement_transmission / v
 *   F_air     = ½ × ρ × CdA × (v + vent_de_face)²     (réduite dans l'aspiration)
 *   F_roul    = Crr × m × g × cos(θ)
 *   F_gravité = m × g × sin(θ)                         (θ = angle de la pente)
 *
 *   (m + inertie des roues) × dv/dt = F_moteur − F_air − F_roul − F_gravité
 *
 * La cadence n'apparaît pas : à puissance égale, la vitesse est la même quelle que
 * soit la cadence. Elle sert à animer les jambes de l'avatar.
 */
import { G } from '../config';
import {
  FRAMES, WHEELS, SURFACE_CRR, KIT_GAINS, riderCdA,
  type FrameId, type WheelId, type SurfaceId, type Kit,
} from './equipment';

export interface RiderSetup {
  weightKg: number;
  heightCm: number;
  frame: FrameId;
  wheels: WheelId;
  kit: Kit;
}

/** Paramètres physiques dérivés du cycliste et de son matériel. */
export interface PhysicsParams {
  /** masse totale cycliste + vélo (kg) */
  mass: number;
  /** masse équivalente de l'inertie de rotation des roues (kg) */
  inertiaMass: number;
  /** CdA hors aspiration (m²) */
  cda: number;
  frame: FrameId;
  /** rendement de la transmission (chaîne, roulements) */
  drivetrain: number;
}

export function buildParams(s: RiderSetup): PhysicsParams {
  const frame = FRAMES[s.frame];
  const wheels = WHEELS[s.wheels];
  let cda = riderCdA(s.heightCm, s.weightKg) * frame.cdaFactor + wheels.cdaDelta;
  if (s.kit.aeroHelmet) cda += KIT_GAINS.aeroHelmet;
  if (s.kit.highSocks) cda += KIT_GAINS.highSocks;
  if (s.kit.overshoes) cda += KIT_GAINS.overshoes;
  const bike = frame.mass + wheels.massDelta;
  return {
    mass: s.weightKg + bike,
    // jantes + pneus ≈ 1,6 kg de masse « tournante » ; plus lourd pour un VTT
    inertiaMass: s.frame === 'mtb' ? 2.4 : s.frame === 'gravel' ? 2.0 : 1.6 + wheels.massDelta * 0.6,
    cda,
    frame: s.frame,
    drivetrain: 0.976,
  };
}

/** Crr effectif pour un cadre et un revêtement. */
export function crrFor(frame: FrameId, surface: SurfaceId): number {
  return SURFACE_CRR[surface] * FRAMES[frame].crrFactor[surface];
}

/** Masse volumique de l'air (kg/m³) selon l'altitude et la température. */
export function airDensity(altitude: number, temperatureC = 15): number {
  const p = 101325 * Math.pow(Math.max(0.3, 1 - 2.25577e-5 * altitude), 5.25588);
  return p / (287.05 * (temperatureC + 273.15));
}

export interface Conditions {
  /** pente (fraction) */
  grade: number;
  /** vent de face (m/s, négatif = vent de dos) */
  headwind: number;
  /** masse volumique de l'air */
  rho: number;
  crr: number;
  /** multiplicateur de CdA dû à l'aspiration (1 = à l'air, 0,6 = bien abrité) */
  draft: number;
}

/** Somme des forces résistantes (N) à la vitesse v. */
export function resistiveForce(v: number, c: Conditions, p: PhysicsParams): number {
  const theta = Math.atan(c.grade);
  const vAir = v + c.headwind;
  const aero = 0.5 * c.rho * p.cda * c.draft * vAir * Math.abs(vAir);
  const roll = c.crr * p.mass * G * Math.cos(theta);
  const grav = p.mass * G * Math.sin(theta);
  return aero + roll + grav;
}

/** Puissance (W) nécessaire pour rouler à vitesse constante v. */
export function powerForSpeed(v: number, c: Conditions, p: PhysicsParams): number {
  return Math.max(0, (resistiveForce(v, c, p) * v) / p.drivetrain);
}

/** Vitesse d'équilibre (m/s) pour une puissance donnée (recherche par dichotomie). */
export function steadySpeed(power: number, c: Conditions, p: PhysicsParams): number {
  let lo = 0, hi = 40;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (powerForSpeed(mid, c, p) > power) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** État dynamique du cycliste virtuel, intégré à chaque image. */
export class RiderDynamics {
  /** vitesse (m/s) */
  v = 0;
  /** vrai si le freinage automatique agit (virage serré) */
  braking = false;

  constructor(public params: PhysicsParams) {}

  /**
   * Avance la simulation de dt secondes.
   * vmax : vitesse maximale conseillée à cet endroit (freinage automatique en virage).
   */
  step(dt: number, power: number, c: Conditions, vmax = Infinity): number {
    const p = this.params;
    const m = p.mass + p.inertiaMass;
    // Sous-pas pour la stabilité numérique.
    const sub = Math.max(1, Math.ceil(dt / 0.02));
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      // Au démarrage, la force motrice est plafonnée (on ne divise pas par une vitesse nulle).
      const drive = (power * p.drivetrain) / Math.max(this.v, 1.2);
      let a = (drive - resistiveForce(this.v, c, p)) / m;
      if (this.v <= 0 && a < 0) a = 0; // à l'arrêt en montée, on ne recule pas
      this.v = Math.max(0, this.v + a * h);
    }
    this.braking = false;
    if (this.v > vmax) {
      this.v = Math.max(vmax, this.v - 4 * dt);
      this.braking = true;
    }
    return this.v;
  }
}
