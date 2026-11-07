/**
 * Projection locale : convertit latitude/longitude en mètres autour d'une origine.
 *
 * Repère 3D utilisé partout dans le jeu (celui de Three.js) :
 *   X = est, Y = haut, Z = sud (donc le nord est vers -Z).
 * Sur quelques dizaines de kilomètres, une projection équirectangulaire
 * centrée sur la zone est largement assez précise pour l'affichage.
 * Les distances « officielles » (compteur, export .fit) sont, elles,
 * calculées sur l'ellipsoïde (voir geodesicDistance).
 */
const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

export class LocalProjection {
  readonly lat0: number;
  readonly lon0: number;
  /** mètres par degré de longitude / latitude à la latitude d'origine */
  readonly kx: number;
  readonly ky: number;

  constructor(lat0: number, lon0: number) {
    this.lat0 = lat0;
    this.lon0 = lon0;
    const p = lat0 * DEG;
    // Formules de longueur d'arc sur l'ellipsoïde WGS84 (précises au mètre près).
    this.ky = 111132.954 - 559.822 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p);
    this.kx = 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p);
  }

  toLocal(lat: number, lon: number): { x: number; z: number } {
    return { x: (lon - this.lon0) * this.kx, z: -(lat - this.lat0) * this.ky };
  }

  toLatLon(x: number, z: number): LatLon {
    return { lat: this.lat0 - z / this.ky, lon: this.lon0 + x / this.kx };
  }
}

/** Distance réelle (m) entre deux points, formule de haversine. */
export function geodesicDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371008.8;
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
