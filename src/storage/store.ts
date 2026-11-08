/**
 * Sauvegarde locale : profil, historique des sorties, XP.
 *
 * Les données restent dans le navigateur de l'appareil. Pour changer d'appareil ou de
 * navigateur, on exporte un fichier de sauvegarde (.json) puis on le restaure ailleurs.
 * (Une synchronisation via le NAS est prévue en v2.)
 */
import type { Kit, FrameId, WheelId } from '../physics/equipment';
import { DEFAULT_DRIVETRAIN, type Drivetrain } from '../physics/gears';
import type { RideSummary } from '../ride/recorder';
import type { QualityLevel } from '../config';
import type { Lang } from '../i18n';
import { defaultAppearance, type Appearance } from '../render/look';

export interface Profile {
  name: string;
  weightKg: number;
  heightCm: number;
  ftp: number;
  hrMax: number;
  frame: FrameId;
  wheels: WheelId;
  kit: Kit;
  jerseyColor: string;
  jerseyColor2: string;
  helmetColor: string;
  /** apparence détaillée : cycliste, tenue, vélo (voir render/look.ts) */
  appearance: Appearance;
  lang: Lang;
  quality: QualityLevel;
  /** part de la pente réellement envoyée au trainer (1 = 100 %) */
  trainerDifficulty: number;
  /** changement de vitesse : cassette réelle, ou vitesses virtuelles (pignon unique type Zwift Cog) */
  shifting: 'manual' | 'virtual';
  /** braquet réel monté sur le trainer en mode virtuel */
  chainring: number;
  cogTeeth: number;
  /** transmission simulée en mode virtuel (plateaux, cassette, pneu) */
  drivetrain: Drivetrain;
  /** touches clavier « vitesse + », « vitesse − » et « plateau » (valeur KeyboardEvent.key), pour les manettes via BikeControl */
  keyGearUp: string;
  keyGearDown: string;
  keyFront: string;
  /** vrai une fois le profil rempli au premier lancement */
  configured: boolean;
}

export interface SaveData {
  version: 1;
  profile: Profile;
  history: RideSummary[];
  xp: number;
}

const KEY = 'simcyclo.save.v1';

export function defaultProfile(): Profile {
  return {
    name: '',
    weightKg: 72,
    heightCm: 178,
    ftp: 220,
    hrMax: 185,
    frame: 'climb',
    wheels: 'c40',
    kit: { aeroHelmet: false, highSocks: true, overshoes: false },
    jerseyColor: '#e4572e',
    jerseyColor2: '#1d3557',
    helmetColor: '#f1faee',
    appearance: defaultAppearance(),
    lang: 'fr',
    quality: 'medium',
    trainerDifficulty: 1,
    shifting: 'virtual',
    chainring: 50,
    cogTeeth: 17,
    drivetrain: { ...DEFAULT_DRIVETRAIN },
    keyGearUp: 'PageUp',
    keyGearDown: 'PageDown',
    keyFront: 'f',
    configured: false,
  };
}

function fresh(): SaveData {
  return { version: 1, profile: defaultProfile(), history: [], xp: 0 };
}

/** Complète un objet lu (éventuellement ancien ou incomplet) avec les valeurs par défaut. */
function normalize(raw: unknown): SaveData {
  const base = fresh();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  const rp = (r.profile ?? {}) as Partial<Profile>;
  // Profil créé avant les réglages d'apparence : on reprend ses anciens choix.
  const migrated: Partial<Appearance> = rp.appearance ? {} : {
    ...defaultAppearance(rp.frame ?? 'climb'),
    helmetType: rp.kit?.aeroHelmet ? 'aero' : 'road',
    sockHeight: rp.kit?.highSocks === false ? 'low' : 'high',
  };
  return {
    version: 1,
    profile: {
      ...base.profile,
      ...(r.profile ?? {}),
      kit: { ...base.profile.kit, ...(r.profile?.kit ?? {}) },
      drivetrain: { ...base.profile.drivetrain, ...(r.profile?.drivetrain ?? {}) },
      appearance: { ...base.profile.appearance, ...migrated, ...(rp.appearance ?? {}) },
    },
    history: Array.isArray(r.history) ? r.history : [],
    xp: typeof r.xp === 'number' ? r.xp : 0,
  };
}

export function loadSave(): SaveData {
  try {
    const s = localStorage.getItem(KEY);
    return s ? normalize(JSON.parse(s)) : fresh();
  } catch {
    return fresh();
  }
}

export function writeSave(data: SaveData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Contenu du fichier de sauvegarde à télécharger. */
export function exportBackup(data: SaveData): string {
  return JSON.stringify({ app: 'simulateur-cyclisme', exportedAt: new Date().toISOString(), ...data }, null, 2);
}

/** Lecture d'un fichier de sauvegarde ; lève une erreur si le fichier n'est pas reconnu. */
export function importBackup(text: string): SaveData {
  const parsed = JSON.parse(text) as { app?: string };
  if (parsed.app !== 'simulateur-cyclisme') throw new Error('backup-invalid');
  return normalize(parsed);
}
