/** Points de départ proposés pour le trajet libre, par monde. */
import type { WorldId } from './routes';

export type StartGroup = WorldId | 'paris';

export interface StartPoint {
  id: string;
  world: StartGroup;
  name: string;
  lat: number;
  lon: number;
}

export const START_POINTS: StartPoint[] = [
  { id: 'cergy-axe', world: 'valdoise', name: 'Cergy – Axe Majeur (tour Belvédère)', lat: 49.0458, lon: 2.0352 },
  { id: 'cergy-village', world: 'valdoise', name: 'Cergy Village', lat: 49.0334, lon: 2.0617 },
  { id: 'cergy-le-haut', world: 'valdoise', name: 'Cergy-le-Haut (gare)', lat: 49.0486, lon: 2.0122 },
  { id: 'vaureal', world: 'valdoise', name: 'Vauréal', lat: 49.0293, lon: 2.0254 },
  { id: 'franconville', world: 'valdoise', name: 'Franconville', lat: 48.9889, lon: 2.2275 },
  { id: 'ermont', world: 'valdoise', name: 'Ermont', lat: 48.99, lon: 2.258 },
  { id: 'sannois', world: 'valdoise', name: 'Sannois – moulin', lat: 48.9692, lon: 2.2436 },
  { id: 'montsoult', world: 'valdoise', name: 'Montsoult', lat: 49.0725, lon: 2.3008 },
  { id: 'marines', world: 'valdoise', name: 'Marines (Vexin)', lat: 49.1496, lon: 1.9847 },
  { id: 'dijon-liberation', world: 'cotedor', name: 'Dijon – place de la Libération', lat: 47.3211, lon: 5.0413 },
  { id: 'longvic', world: 'cotedor', name: 'Longvic', lat: 47.2862, lon: 5.0529 },
  { id: 'lac-kir', world: 'cotedor', name: 'Dijon – lac Kir', lat: 47.3277, lon: 4.9972 },
  { id: 'paris-eiffel', world: 'paris', name: 'Paris – Champ-de-Mars (tour Eiffel)', lat: 48.8556, lon: 2.2986 },
  { id: 'paris-notredame', world: 'paris', name: 'Paris – Notre-Dame', lat: 48.8532, lon: 2.3482 },
  { id: 'paris-arc', world: 'paris', name: 'Paris – Champs-Élysées', lat: 48.8698, lon: 2.3076 },
  { id: 'paris-montmartre', world: 'paris', name: 'Paris – Montmartre', lat: 48.8846, lon: 2.3404 },
  { id: 'albertville', world: 'montagne', name: 'Albertville', lat: 45.671, lon: 6.3968 },
  { id: 'bourg-oisans', world: 'montagne', name: "Le Bourg-d'Oisans (pied de l'Alpe d'Huez)", lat: 45.0556, lon: 6.0306 },
];
