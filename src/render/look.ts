/**
 * Apparence de l'avatar : cycliste, tenue et vélo.
 *
 * Ces choix sont purement visuels, sauf trois qui touchent aussi la physique et sont
 * recopiés dans le « kit » du profil au moment d'enregistrer :
 *  - casque aéro ou CLM  → gain de CdA du casque aéro ;
 *  - chaussettes hautes  → petit gain de CdA ;
 *  - couvre-chaussures   → petit gain de CdA (déjà dans le kit).
 */
import type { FrameId, WheelId } from '../physics/equipment';

export type JerseyPattern = 'solid' | 'hoops' | 'diagonal' | 'chest' | 'shoulders' | 'checker' | 'polka' | 'gradient';
export type HairStyle = 'short' | 'long' | 'ponytail' | 'bald';
export type Beard = 'none' | 'stubble' | 'full';
export type HelmetType = 'road' | 'aero' | 'tt';
export type LensColor = 'dark' | 'blue' | 'red' | 'orange' | 'clear';
export type SockHeight = 'low' | 'mid' | 'high';
export type Gloves = 'none' | 'mitts' | 'full';
export type Sleeves = 'short' | 'long';
export type Groupset = 'black' | 'silver';
export type TireWall = 'black' | 'tan' | 'blue' | 'red' | 'white' | 'yellow' | 'green';
export type AvatarStyle = 'smooth' | 'facet';
export type RoomId = 'neon' | 'workshop' | 'living' | 'loft';
export type Finish = 'gloss' | 'matte';

export interface Appearance {
  /** style de modélisation de l'avatar et du vélo */
  style: AvatarStyle;
  /** décor de la page d'accueil */
  room: RoomId;
  // ----- Cycliste
  skin: string;
  hair: HairStyle;
  hairColor: string;
  beard: Beard;
  // ----- Tenue
  pattern: JerseyPattern;
  /** liserés, col et bas de manches */
  jerseyColor3: string;
  shortsColor: string;
  sleeves: Sleeves;
  gloves: Gloves;
  helmetType: HelmetType;
  glasses: boolean;
  lens: LensColor;
  shoeColor: string;
  sockColor: string;
  sockHeight: SockHeight;
  // ----- Vélo
  frameColor: string;
  /** couleur des décors du cadre (bandes, logo générique) */
  frameColor2: string;
  /** couleur de la fourche ('' = comme le cadre), par exemple jaune sur le Van Rysel RCR-G */
  forkColor: string;
  finish: Finish;
  groupset: Groupset;
  barTape: string;
  tireWall: TireWall;
  saddleColor: string;
  bottles: 0 | 1 | 2;
  bottleColor: string;
  computer: boolean;
  /** serviette sur le cintre (visible seulement sur le home trainer de l'accueil) */
  towel: boolean;
}

/** Teints proposés, du plus clair au plus foncé. */
export const SKIN_TONES = ['#f6d7c3', '#eac1a2', '#d9a37f', '#bf8460', '#9a6343', '#6e4630', '#4a2f22'];
/** Couleurs de cheveux proposées. */
export const HAIR_COLORS = ['#151210', '#3b2a1e', '#6b4429', '#a87b4f', '#d8b77a', '#9c3d1f', '#9a9a9a', '#e8e6e1'];
export const LENS: Record<LensColor, { color: string; specular: string }> = {
  dark: { color: '#15171a', specular: '#8090a0' },
  blue: { color: '#1b3f8f', specular: '#7fc4ff' },
  red: { color: '#7a1a14', specular: '#ff8c5a' },
  orange: { color: '#b3561a', specular: '#ffd27a' },
  clear: { color: '#c9d6de', specular: '#ffffff' },
};

/** Couleur de cadre par défaut selon le type, pour les profils créés avant ces réglages. */
const FRAME_DEFAULT: Record<FrameId, string> = {
  climb: '#c8102e', aero: '#1b1f24', gravel: '#6b7b4b', tt: '#1b1f24', mtb: '#2a6f97',
};

export function defaultAppearance(frame: FrameId = 'climb'): Appearance {
  return {
    style: 'facet',
    room: 'neon',
    skin: SKIN_TONES[1],
    hair: 'short',
    hairColor: HAIR_COLORS[1],
    beard: 'none',
    pattern: 'chest',
    jerseyColor3: '#ffffff',
    shortsColor: '#16181b',
    sleeves: 'short',
    gloves: 'mitts',
    helmetType: 'road',
    glasses: true,
    lens: 'dark',
    shoeColor: '#f2f2f2',
    sockColor: '#f4f4f4',
    sockHeight: 'high',
    frameColor: FRAME_DEFAULT[frame],
    frameColor2: '#f1f1f1',
    forkColor: '',
    finish: 'gloss',
    groupset: 'black',
    barTape: '#1a1a1a',
    tireWall: 'black',
    saddleColor: '#1a1a1a',
    bottles: 1,
    bottleColor: '#f1f1f1',
    computer: true,
    towel: false,
  };
}

/** Tout ce dont le modèle 3D a besoin pour dessiner l'avatar. */
export interface RiderLook extends Appearance {
  heightCm: number;
  weightKg: number;
  frame: FrameId;
  wheels: WheelId;
  jerseyColor: string;
  jerseyColor2: string;
  helmetColor: string;
  overshoes: boolean;
}

/** Champs du profil utilisés pour l'apparence (sous-ensemble de Profile). */
export interface LookSource {
  heightCm: number;
  weightKg: number;
  frame: FrameId;
  wheels: WheelId;
  jerseyColor: string;
  jerseyColor2: string;
  helmetColor: string;
  kit: { overshoes: boolean };
  appearance: Appearance;
}

export function lookFromProfile(p: LookSource): RiderLook {
  return {
    ...p.appearance,
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    frame: p.frame,
    wheels: p.wheels,
    jerseyColor: p.jerseyColor,
    jerseyColor2: p.jerseyColor2,
    helmetColor: p.helmetColor,
    overshoes: p.kit.overshoes,
  };
}
