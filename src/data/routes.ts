/**
 * Parcours disponibles (tracés calculés avec BRouter sur les données OpenStreetMap,
 * puis nettoyés par scripts/make-route.py). Les cartes complètes en monde ouvert
 * compléteront ces tracés au lot 2.
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
  { id: 'vexin', world: 'valdoise', name: 'Boucle du Vexin', file: 'routes/vexin.gpx', lat: 49.09, lon: 1.93, description: 'Cergy-le-Haut, Courdimanche, Seraincourt, Avernes, Commeny, Santeuil, Frémécourt, Ableiges · 57 km' },
  { id: 'montsoult', world: 'valdoise', name: 'Boucle de Montsoult', file: 'routes/montsoult.gpx', lat: 49.07, lon: 2.22, description: "Cergy Village, Pontoise, Méry-sur-Oise, Villiers-Adam, Chauvry, Montsoult, L'Isle-Adam, Auvers-sur-Oise · 54 km" },
  { id: 'parisis-loop', world: 'valdoise', name: 'Boucle Franconville – Ermont – Sannois', file: 'routes/parisis-loop.gpx', lat: 48.99, lon: 2.17, description: 'Cergy Village, Conflans, Herblay, Franconville, Ermont, moulin de Sannois, Cormeilles, La Frette · 52 km' },
  { id: 'cergy-vaureal', world: 'valdoise', name: 'Cergy – Vauréal – Jouy-le-Moutier', file: 'routes/cergy-vaureal.gpx', lat: 49.035, lon: 2.035, description: "Place des Colonnes, bords de l'Oise, Vauréal · 12 km" },
  { id: 'buttes-parisis', world: 'valdoise', name: 'Buttes du Parisis', file: 'routes/buttes-parisis.gpx', lat: 48.98, lon: 2.24, description: 'Moulin de Sannois, Franconville, Ermont · 9 km' },
  { id: 'dijon', world: 'cotedor', name: 'Dijon – Longvic – Lac Kir', file: 'routes/dijon.gpx', lat: 47.31, lon: 5.03, description: 'Centre-ville, Longvic, lac Kir · 19 km' },
  { id: 'tarentaise', world: 'montagne', name: 'Albertville – La Bâthie – Champagny-le-Haut', file: 'routes/tarentaise.gpx', lat: 45.55, lon: 6.57, description: 'Vallée de la Tarentaise puis montée vers la Vanoise · 50 km' },
  { id: 'alpe-huez', world: 'montagne', name: "Montée de l'Alpe d'Huez", file: 'routes/alpe-huez.gpx', lat: 45.08, lon: 6.05, description: "Les 21 virages, du Bourg-d'Oisans à l'avenue du Rif Nel · 14 km" },
];
