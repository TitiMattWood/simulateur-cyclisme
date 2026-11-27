/**
 * Équipes du peloton, inspirées des 18 équipes du WorldTour : couleurs de maillot, de cuissard,
 * de casque et de vélo proches des leurs (l'équipe d'inspiration est indiquée en commentaire),
 * mais noms inventés, sans marque ni sponsor. Effectif de coureurs fictifs avec leur spécialité.
 *
 * Les noms sont inventés. Chaque coureur a un type :
 *  - « climber » (grimpeur) : léger, attaque en montée ;
 *  - « rouleur » : costaud sur le plat, mène le peloton ;
 *  - « sprinter » : très grosse puissance sur quelques secondes.
 */
import type { Appearance } from '../render/look';
import type { FrameId, WheelId } from '../physics/equipment';

export type RiderKind = 'climber' | 'rouleur' | 'sprinter';

export interface TeamRider {
  first: string;
  last: string;
  kind: RiderKind;
}

export interface Team {
  id: string;
  name: string;
  /** couleur principale, secondaire, liserés */
  jersey: [string, string, string];
  pattern: Appearance['pattern'];
  shorts: string;
  frame: FrameId;
  frameColor: string;
  frameColor2: string;
  wheels: WheelId;
  helmet: string;
  riders: TeamRider[];
}


const R = (first: string, last: string, kind: RiderKind): TeamRider => ({ first, last, kind });

export const TEAMS: Team[] = [
  {
    // inspiré de UAE Team Emirates : blanc, bas noir, filet rouge ; vélo blanc et noir
    id: 'desert', name: 'Désert Blanc', jersey: ['#f4f4f4', '#111111', '#d62828'], pattern: 'band', shorts: '#111111',
    frame: 'climb', frameColor: '#f2f2f2', frameColor2: '#111111', wheels: 'pro65', helmet: '#ffffff',
    riders: [R('Léo', 'Garnier', 'rouleur'), R('Hugo', 'Roussel', 'climber'), R('Nathan', 'Fontaine', 'sprinter'), R('Inès', 'Girard', 'rouleur'), R('Théo', 'Renaud', 'climber'), R('Jules', 'Picard', 'rouleur')],
  },
  {
    // inspiré de Visma | Lease a Bike : jaune et noir ; vélo aéro noir et jaune
    id: 'essaim', name: 'Essaim Jaune', jersey: ['#ffd400', '#111111', '#ffffff'], pattern: 'band', shorts: '#111111',
    frame: 'aero', frameColor: '#111111', frameColor2: '#ffd400', wheels: 'pro65', helmet: '#ffd400',
    riders: [R('Lucas', 'Dumas', 'climber'), R('Chloé', 'Chevalier', 'sprinter'), R('Arthur', 'Collin', 'rouleur'), R('Manon', 'Royer', 'climber'), R('Romain', 'Bertin', 'rouleur'), R('Louis', 'Guérin', 'rouleur')],
  },
  {
    // inspiré de Soudal Quick-Step : bleu nuit et bleu ciel ; vélo bleu nuit
    id: 'meute', name: 'La Meute Bleue', jersey: ['#203a8f', '#4fa3e0', '#ffffff'], pattern: 'gradient', shorts: '#0b1b3f',
    frame: 'climb', frameColor: '#1c2f6b', frameColor2: '#ffffff', wheels: 'pro55', helmet: '#ffffff',
    riders: [R('Maxime', 'Morel', 'sprinter'), R('Jade', 'Leclerc', 'rouleur'), R('Antoine', 'Carré', 'climber'), R('Camille', 'Brunet', 'rouleur'), R('Bastien', 'Rolland', 'rouleur'), R('Simon', 'Huet', 'climber')],
  },
  {
    // inspiré de INEOS Grenadiers : bleu nuit, bandeau rouge ; vélo bleu nuit
    id: 'grenat', name: 'Grenat Nuit', jersey: ['#0d1b2a', '#c8102e', '#ffffff'], pattern: 'chest', shorts: '#0d1b2a',
    frame: 'climb', frameColor: '#0d1b2a', frameColor2: '#c8102e', wheels: 'pro55', helmet: '#0d1b2a',
    riders: [R('Julie', 'Hamon', 'rouleur'), R('Quentin', 'Aubert', 'climber'), R('Lina', 'Leroux', 'rouleur'), R('Adrien', 'Gauthier', 'rouleur'), R('Paul', 'Faure', 'climber'), R('Elsa', 'Moulin', 'sprinter')],
  },
  {
    // inspiré de Red Bull-BORA-hansgrohe : marine, rouge et jaune ; vélo marine
    id: 'tonnerre', name: 'Bleu Tonnerre', jersey: ['#0b1f4d', '#c8102e', '#f2c500'], pattern: 'split', shorts: '#0b1f4d',
    frame: 'aero', frameColor: '#0b1f4d', frameColor2: '#c8102e', wheels: 'saw58', helmet: '#0b1f4d',
    riders: [R('Victor', 'Masson', 'climber'), R('Sarah', 'Lambert', 'rouleur'), R('Clément', 'Rey', 'rouleur'), R('Mathis', 'Benoît', 'climber'), R('Alice', 'Gaillard', 'sprinter'), R('Florian', 'Charpentier', 'rouleur')],
  },
  {
    // inspiré de Lidl-Trek : marine, écharpe rouge, filet jaune ; vélo rouge
    id: 'trident', name: 'Trident Rouge', jersey: ['#0a2a6b', '#e30613', '#ffd200'], pattern: 'diagonal', shorts: '#0a2a6b',
    frame: 'aero', frameColor: '#c4161c', frameColor2: '#0a2a6b', wheels: 'pro65', helmet: '#0a2a6b',
    riders: [R('Baptiste', 'Arnaud', 'rouleur'), R('Margaux', 'Caron', 'rouleur'), R('Kevin', 'Prévost', 'climber'), R('Thomas', 'Lebrun', 'sprinter'), R('Océane', 'Marty', 'rouleur'), R('Damien', 'Le Gall', 'climber')],
  },
  {
    // inspiré de Alpecin-Deceuninck : noir et bleu ; vélo aéro noir
    id: 'cobalt', name: 'Noir Cobalt', jersey: ['#0b0f1a', '#1f6fd1', '#ffffff'], pattern: 'gradient', shorts: '#0b0f1a',
    frame: 'aero', frameColor: '#111111', frameColor2: '#1f6fd1', wheels: 'mono60', helmet: '#111111',
    riders: [R('Axel', 'Jacquet', 'rouleur'), R('Laura', 'Rivière', 'climber'), R('Yanis', 'Dupré', 'sprinter'), R('Pierre', 'Rossi', 'rouleur'), R('Noémie', 'Navarro', 'climber'), R('Benoît', 'Lindqvist', 'rouleur')],
  },
  {
    // inspiré de EF Education-EasyPost : rose et marine ; vélo rose
    id: 'rose', name: 'Rose Fluo', jersey: ['#ff4fa3', '#1d2a6b', '#ffffff'], pattern: 'shoulders', shorts: '#1d2a6b',
    frame: 'climb', frameColor: '#ff4fa3', frameColor2: '#1d2a6b', wheels: 'pro55', helmet: '#ff4fa3',
    riders: [R('Rémi', 'Schmitt', 'climber'), R('Pauline', 'Jensen', 'sprinter'), R('Dylan', 'Bianchi', 'rouleur'), R('Gaëtan', 'Hughes', 'climber'), R('Anaïs', 'Aranburu', 'rouleur'), R('Loïc', 'Janssens', 'rouleur')],
  },
  {
    // inspiré de Decathlon AG2R La Mondiale : bleu, blanc, cuissard brun ; vélo bleu
    id: 'azurterre', name: 'Azur et Terre', jersey: ['#1e78d2', '#ffffff', '#5a3418'], pattern: 'band', shorts: '#3d2412',
    frame: 'climb', frameColor: '#1e78d2', frameColor2: '#ffffff', wheels: 'clim45', helmet: '#ffffff',
    riders: [R('Valentin', 'Novak', 'sprinter'), R('Émilie', 'Moreno', 'rouleur'), R('Corentin', 'Ortega', 'climber'), R('Matteo', 'Peeters', 'rouleur'), R('Lars', 'Berg', 'rouleur'), R('Tom', 'Greco', 'climber')],
  },
  {
    // inspiré de Groupama-FDJ : bleu, blanc, filet rouge ; vélo aéro bleu
    id: 'tricolore', name: 'Tricolore', jersey: ['#1e3a8a', '#ffffff', '#e11d2e'], pattern: 'shoulders', shorts: '#1e3a8a',
    frame: 'aero', frameColor: '#1e3a8a', frameColor2: '#ffffff', wheels: 'saw58', helmet: '#ffffff',
    riders: [R('Diego', 'Vogel', 'rouleur'), R('Marco', 'Nielsen', 'climber'), R('Jan', 'Conti', 'rouleur'), R('Erik', 'Marino', 'rouleur'), R('Owen', 'Walsh', 'climber'), R('Sofia', 'Clarke', 'sprinter')],
  },
  {
    // inspiré de Bahrain Victorious : rouge et marine, filet orangé ; vélo rouge
    id: 'corail', name: 'Corail Marine', jersey: ['#d0021b', '#0a1f44', '#f5a623'], pattern: 'split', shorts: '#0a1f44',
    frame: 'aero', frameColor: '#d0021b', frameColor2: '#0a1f44', wheels: 'mono60', helmet: '#d0021b',
    riders: [R('Mikel', 'Ferrari', 'climber'), R('Iker', 'Hofmann', 'rouleur'), R('Pablo', 'Murphy', 'rouleur'), R('Jonas', 'Wagner', 'climber'), R('Sander', 'Dvořák', 'sprinter'), R('Wout', 'Bakker', 'rouleur')],
  },
  {
    // inspiré de Movistar : bleu marine, coutures vert citron ; vélo marine
    id: 'citron', name: 'Marine Citron', jersey: ['#0b2a6f', '#0b2a6f', '#b8e636'], pattern: 'solid', shorts: '#0b2a6f',
    frame: 'climb', frameColor: '#0b2a6f', frameColor2: '#b8e636', wheels: 'pro55', helmet: '#0b2a6f',
    riders: [R('Mads', 'Byrne', 'rouleur'), R('Magnus', 'Sørensen', 'rouleur'), R('Tobias', 'Kovac', 'climber'), R('Filippo', 'Mulder', 'sprinter'), R('Giulio', 'Torres', 'rouleur'), R('Andrea', 'Horvat', 'climber')],
  },
  {
    // inspiré de Jayco AlUla : bleu et orange ; vélo aéro bleu
    id: 'austral', name: 'Austral', jersey: ['#003a8c', '#ff7a00', '#ffffff'], pattern: 'split', shorts: '#003a8c',
    frame: 'aero', frameColor: '#003a8c', frameColor2: '#ff7a00', wheels: 'saw58', helmet: '#ffffff',
    riders: [R('Luca', 'Visser', 'rouleur'), R('Nils', 'Herrera', 'climber'), R('Finn', 'Kowalski', 'sprinter'), R('Ethan', 'Molina', 'rouleur'), R('Liam', 'Costa', 'climber'), R('Oscar', 'Kerdraon', 'rouleur')],
  },
  {
    // inspiré de Intermarché-Wanty : blanc, bas bleu, filet jaune ; vélo blanc
    id: 'blancbleu', name: 'Blanc Bleu', jersey: ['#ffffff', '#1d4ed8', '#facc15'], pattern: 'band', shorts: '#1d4ed8',
    frame: 'climb', frameColor: '#ffffff', frameColor2: '#1d4ed8', wheels: 'clim45', helmet: '#ffffff',
    riders: [R('Ben', 'Nowak', 'climber'), R('Jakob', 'Serrano', 'sprinter'), R('Kasper', 'Silva', 'rouleur'), R('Rasmus', 'Tanguy', 'climber'), R('Milan', 'Roux', 'rouleur'), R('Bram', 'Laurent', 'rouleur')],
  },
  {
    // inspiré de Cofidis : rouge, épaules blanches ; vélo rouge
    id: 'rougevif', name: 'Rouge Vif', jersey: ['#d8121b', '#ffffff', '#111111'], pattern: 'shoulders', shorts: '#111111',
    frame: 'climb', frameColor: '#d8121b', frameColor2: '#ffffff', wheels: 'pro55', helmet: '#d8121b',
    riders: [R('Daan', 'Le Bihan', 'sprinter'), R('Luis', 'Morvan', 'rouleur'), R('Raúl', 'Michel', 'climber'), R('Tadeo', 'Garnier', 'rouleur'), R('Adam', 'Roussel', 'rouleur'), R('Ivan', 'Fontaine', 'climber')],
  },
  {
    // inspiré de Picnic PostNL : noir, bandeau blanc, filet orange ; vélo noir
    id: 'minuit', name: 'Orange Minuit', jersey: ['#111111', '#ffffff', '#ff6600'], pattern: 'chest', shorts: '#111111',
    frame: 'aero', frameColor: '#111111', frameColor2: '#ff6600', wheels: 'mono60', helmet: '#111111',
    riders: [R('Pavel', 'Gilles', 'rouleur'), R('Marek', 'Marchand', 'climber'), R('Tomás', 'Barbier', 'rouleur'), R('Aleix', 'Dumas', 'rouleur'), R('Óscar', 'Chevalier', 'climber'), R('Joao', 'Collin', 'sprinter')],
  },
  {
    // inspiré de XDS Astana : turquoise, filet jaune ; vélo turquoise
    id: 'steppe', name: 'Steppe Turquoise', jersey: ['#00a3b4', '#e6f7f8', '#ffd400'], pattern: 'gradient', shorts: '#00303a',
    frame: 'aero', frameColor: '#00a3b4', frameColor2: '#ffd400', wheels: 'pro65', helmet: '#00a3b4',
    riders: [R('Rui', 'Perrin', 'climber'), R('Nuno', 'Lacroix', 'rouleur'), R('Ewen', 'Mercier', 'rouleur'), R('Gwen', 'Morel', 'climber'), R('Yann', 'Leclerc', 'sprinter'), R('Malo', 'Carré', 'rouleur')],
  },
  {
    // inspiré de Lotto : rouge et blanc à bandes ; vélo rouge
    id: 'coq', name: 'Coq Rouge', jersey: ['#e30613', '#ffffff', '#111111'], pattern: 'hoops', shorts: '#111111',
    frame: 'climb', frameColor: '#e30613', frameColor2: '#ffffff', wheels: 'pro55', helmet: '#ffffff',
    riders: [R('Noah', 'Renaud', 'rouleur'), R('Enzo', 'Picard', 'rouleur'), R('Sacha', 'Vasseur', 'climber'), R('Timéo', 'Hamon', 'sprinter'), R('Eliott', 'Aubert', 'rouleur'), R('Gabin', 'Leroux', 'climber')],
  },
];

/** Identifiant de l'équipe créée par le joueur (« Mon équipe »). */
export const MY_TEAM_ID = 'mine';
let myTeam: Team | null = null;

/** Coéquipiers de l'équipe du joueur (noms inventés). */
const MY_RIDERS: TeamRider[] = [
  R('Alex', 'Martin', 'rouleur'), R('Sam', 'Bernard', 'climber'), R('Charlie', 'Petit', 'sprinter'),
  R('Robin', 'Durand', 'rouleur'), R('Morgan', 'Leroy', 'climber'), R('Lou', 'Moreau', 'rouleur'),
];

/** Couleurs choisies par le joueur pour son équipe (tenue et vélo). */
export interface MyTeamColors {
  name: string;
  jersey: [string, string, string];
  pattern: Team['pattern'];
  shorts: string;
  helmet: string;
  frame: FrameId;
  frameColor: string;
  frameColor2: string;
  wheels: WheelId;
}

/** Construit l'équipe du joueur à partir de ses couleurs. */
export function makeMyTeam(c: MyTeamColors): Team {
  return { id: MY_TEAM_ID, ...c, name: c.name.trim() || 'Mon équipe', riders: MY_RIDERS };
}

/** Déclare (ou retire) l'équipe du joueur : elle devient disponible pour les courses. */
export function setMyTeam(t: Team | null): void {
  myTeam = t;
}

export function teamById(id: string): Team | undefined {
  if (id === MY_TEAM_ID) return myTeam ?? undefined;
  return TEAMS.find((t) => t.id === id);
}
