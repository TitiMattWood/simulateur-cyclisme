/**
 * Équipes fictives du peloton : maillots inspirés des grandes couleurs du cyclisme pro (aucun
 * nom ni logo réel), matériel, et effectif de coureurs avec leur spécialité.
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
    id: 'azur', name: 'Azur Vélo', jersey: ['#1d4ed8', '#ffffff', '#facc15'], pattern: 'chest', shorts: '#0b1b3f',
    frame: 'aero', frameColor: '#0f172a', frameColor2: '#38bdf8', wheels: 'c55', helmet: '#ffffff',
    riders: [R('Léo', 'Garnier', 'rouleur'), R('Hugo', 'Marchand', 'climber'), R('Nathan', 'Lemoine', 'sprinter'), R('Inès', 'Roussel', 'rouleur'), R('Théo', 'Barbier', 'climber'), R('Jules', 'Perrin', 'rouleur')],
  },
  {
    id: 'cerise', name: 'Rouge Cerise', jersey: ['#dc2626', '#111111', '#ffffff'], pattern: 'diagonal', shorts: '#111111',
    frame: 'climb', frameColor: '#b91c1c', frameColor2: '#ffffff', wheels: 'c40', helmet: '#111111',
    riders: [R('Lucas', 'Fontaine', 'climber'), R('Chloé', 'Dumas', 'rouleur'), R('Arthur', 'Lacroix', 'sprinter'), R('Manon', 'Girard', 'climber'), R('Romain', 'Chevalier', 'rouleur'), R('Louis', 'Mercier', 'rouleur')],
  },
  {
    id: 'prairie', name: 'Vert Prairie', jersey: ['#16a34a', '#bbf7d0', '#052e16'], pattern: 'hoops', shorts: '#052e16',
    frame: 'climb', frameColor: '#e5e7eb', frameColor2: '#16a34a', wheels: 'c40', helmet: '#16a34a',
    riders: [R('Maxime', 'Renaud', 'sprinter'), R('Jade', 'Collin', 'climber'), R('Antoine', 'Morel', 'rouleur'), R('Camille', 'Picard', 'rouleur'), R('Bastien', 'Royer', 'climber'), R('Simon', 'Leclerc', 'rouleur')],
  },
  {
    id: 'couchant', name: 'Soleil Couchant', jersey: ['#f97316', '#fde047', '#7c2d12'], pattern: 'gradient', shorts: '#1c1917',
    frame: 'aero', frameColor: '#f97316', frameColor2: '#1c1917', wheels: 'c88', helmet: '#fde047',
    riders: [R('Julie', 'Vasseur', 'rouleur'), R('Quentin', 'Bertin', 'sprinter'), R('Lina', 'Carré', 'climber'), R('Adrien', 'Hamon', 'rouleur'), R('Paul', 'Guérin', 'rouleur'), R('Elsa', 'Brunet', 'climber')],
  },
  {
    id: 'nuit', name: 'Nuit Blanche', jersey: ['#111827', '#e5e7eb', '#a855f7'], pattern: 'shoulders', shorts: '#111827',
    frame: 'aero', frameColor: '#111827', frameColor2: '#a855f7', wheels: 'c55', helmet: '#e5e7eb',
    riders: [R('Victor', 'Aubert', 'climber'), R('Sarah', 'Noël', 'rouleur'), R('Clément', 'Rolland', 'sprinter'), R('Mathis', 'Leroux', 'rouleur'), R('Alice', 'Masson', 'climber'), R('Florian', 'Huet', 'rouleur')],
  },
  {
    id: 'grimpeurs', name: 'Grimpeurs Réunis', jersey: ['#ffffff', '#dc2626', '#dc2626'], pattern: 'polka', shorts: '#111111',
    frame: 'climb', frameColor: '#f5f5f5', frameColor2: '#dc2626', wheels: 'c40', helmet: '#dc2626',
    riders: [R('Baptiste', 'Gauthier', 'climber'), R('Margaux', 'Lambert', 'climber'), R('Kevin', 'Bonnet', 'rouleur'), R('Thomas', 'Faure', 'climber'), R('Océane', 'Rey', 'rouleur'), R('Damien', 'Arnaud', 'sprinter')],
  },
  {
    id: 'lagon', name: 'Lagon', jersey: ['#06b6d4', '#0e7490', '#ecfeff'], pattern: 'checker', shorts: '#083344',
    frame: 'climb', frameColor: '#0e7490', frameColor2: '#ecfeff', wheels: 'c55', helmet: '#06b6d4',
    riders: [R('Axel', 'Moulin', 'rouleur'), R('Laura', 'Benoît', 'sprinter'), R('Yanis', 'Caron', 'climber'), R('Pierre', 'Blanc', 'rouleur'), R('Noémie', 'Gaillard', 'climber'), R('Benoît', 'Prévost', 'rouleur')],
  },
  {
    id: 'ardoise', name: 'Ardoise', jersey: ['#475569', '#f59e0b', '#f8fafc'], pattern: 'solid', shorts: '#1e293b',
    frame: 'aero', frameColor: '#334155', frameColor2: '#f59e0b', wheels: 'c50', helmet: '#f59e0b',
    riders: [R('Rémi', 'Jacquet', 'rouleur'), R('Pauline', 'Charpentier', 'climber'), R('Dylan', 'Lebrun', 'sprinter'), R('Gaëtan', 'Rivière', 'rouleur'), R('Anaïs', 'Vidal', 'climber'), R('Loïc', 'Marty', 'rouleur')],
  },
  {
    // jaune et noir, à la façon des équipes « abeille » du peloton
    id: 'bourdon', name: 'Bourdon Jaune', jersey: ['#facc15', '#111111', '#111111'], pattern: 'chest', shorts: '#111111',
    frame: 'aero', frameColor: '#111111', frameColor2: '#facc15', wheels: 'c50', helmet: '#facc15',
    riders: [R('Valentin', 'Dupré', 'climber'), R('Émilie', 'Schmitt', 'rouleur'), R('Corentin', 'Le Gall', 'rouleur'), R('Matteo', 'Rossi', 'climber'), R('Lars', 'Jensen', 'rouleur'), R('Tom', 'De Wit', 'sprinter')],
  },
  {
    // blanc, noir et rouge, sobre et élégant
    id: 'sable', name: 'Sable Blanc', jersey: ['#f8fafc', '#111111', '#dc2626'], pattern: 'shoulders', shorts: '#111111',
    frame: 'climb', frameColor: '#f8fafc', frameColor2: '#111111', wheels: 'c45', helmet: '#f8fafc',
    riders: [R('Diego', 'Navarro', 'climber'), R('Marco', 'Bianchi', 'rouleur'), R('Jan', 'Novak', 'sprinter'), R('Erik', 'Lindqvist', 'rouleur'), R('Owen', 'Hughes', 'climber'), R('Sofia', 'Moreno', 'rouleur')],
  },
];

export function teamById(id: string): Team | undefined {
  return TEAMS.find((t) => t.id === id);
}
