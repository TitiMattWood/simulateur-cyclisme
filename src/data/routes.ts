/**
 * Parcours de démonstration (tracés calculés avec BRouter sur les données OpenStreetMap).
 * Les cartes complètes en monde ouvert remplaceront ces tracés au lot 2.
 */
export type WorldId = 'valdoise' | 'cotedor' | 'montagne';

export interface RouteEntry {
  id: string;
  world: WorldId;
  name: string;
  file: string;
  /** position du marqueur sur la carte de France */
  lat: number;
  lon: number;
  description: string;
}

export const ROUTES: RouteEntry[] = [
  { id: 'cergy-vaureal', world: 'valdoise', name: 'Cergy – Vauréal – Jouy-le-Moutier', file: 'routes/cergy-vaureal.gpx', lat: 49.035, lon: 2.035, description: 'Place des Colonnes, bords de l\'Oise, Vauréal' },
  { id: 'buttes-parisis', world: 'valdoise', name: 'Buttes du Parisis', file: 'routes/buttes-parisis.gpx', lat: 48.98, lon: 2.24, description: 'Moulin de Sannois, Franconville, Ermont' },
  { id: 'dijon', world: 'cotedor', name: 'Dijon – Longvic – Lac Kir', file: 'routes/dijon.gpx', lat: 47.31, lon: 5.03, description: 'Centre-ville, Longvic, lac Kir' },
  { id: 'tarentaise', world: 'montagne', name: 'Albertville – La Bâthie – Champagny-le-Haut', file: 'routes/tarentaise.gpx', lat: 45.55, lon: 6.57, description: 'Vallée de la Tarentaise puis montée vers la Vanoise' },
  { id: 'alpe-huez', world: 'montagne', name: "Montée de l'Alpe d'Huez", file: 'routes/alpe-huez.gpx', lat: 45.08, lon: 6.05, description: 'Les 21 virages depuis Le Bourg-d\'Oisans' },
];
