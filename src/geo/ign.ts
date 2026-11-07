/**
 * Accès aux données ouvertes de l'IGN (Géoplateforme) :
 *  - altitude du parcours (RGE ALTI, précision métrique, LiDAR HD là où il existe) ;
 *  - grilles d'altitude pour le relief autour du parcours ;
 *  - orthophotos (pour colorer le sol comme dans la réalité : champs, forêts, villes) ;
 *  - BD TOPO : bâtiments avec leur hauteur réelle, routes, végétation, eau, voies ferrées.
 *
 * Les réponses sont gardées dans le cache du navigateur : une sortie déjà faite
 * se recharge beaucoup plus vite, et fonctionne même avec une connexion faible.
 */
import { IGN } from '../config';
import type { Route } from './route';

const CACHE_NAME = 'geodata-v1';
const MAX_PARALLEL = 6;

// ---------------------------------------------------------------------------
// Limiteur : pas plus de MAX_PARALLEL requêtes simultanées vers l'IGN.
let active = 0;
const queue: Array<() => void> = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((res) => queue.push(res));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/** fetch() avec cache persistant et nouvelles tentatives en cas d'échec réseau. */
export async function cachedFetch(url: string, init?: RequestInit, cacheKey?: string): Promise<Response> {
  const cache = await openCache();
  const key = cacheKey ?? url;
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return hit;
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await limited(() => fetch(url, init));
      if (res.ok) {
        if (cache) await cache.put(key, res.clone()).catch(() => undefined);
        return res;
      }
      lastErr = new Error(`HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
export interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/** Altitude IGN pour une liste de points (lots de 400 au maximum). */
export async function fetchElevations(lats: number[], lons: number[]): Promise<number[]> {
  const body = JSON.stringify({
    lon: lons.map((v) => v.toFixed(6)).join('|'),
    lat: lats.map((v) => v.toFixed(6)).join('|'),
    resource: IGN.altiResource,
    zonly: 'true',
  });
  // Clé de cache synthétique : une requête POST ne peut pas être mise en cache telle quelle.
  const key = `${IGN.alti}?k=${await hash(body)}`;
  const res = await cachedFetch(IGN.alti, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, key);
  const json = (await res.json()) as { elevations: number[] };
  return json.elevations.map((v) => (v < -1000 ? NaN : v));
}

/**
 * Altitude de tout le parcours : un point sur deux (tous les 10 m) est interrogé,
 * les autres sont interpolés. onProgress reçoit une valeur entre 0 et 1.
 */
export async function fetchRouteElevation(route: Route, onProgress?: (p: number) => void): Promise<Float32Array> {
  const idx: number[] = [];
  for (let i = 0; i < route.n; i += 2) idx.push(i);
  if (idx[idx.length - 1] !== route.n - 1) idx.push(route.n - 1);
  const BATCH = 400;
  const batches: number[][] = [];
  for (let i = 0; i < idx.length; i += BATCH) batches.push(idx.slice(i, i + BATCH));
  const values = new Float32Array(route.n).fill(NaN);
  let done = 0;
  await Promise.all(
    batches.map(async (b) => {
      const el = await fetchElevations(b.map((i) => route.lat[i]), b.map((i) => route.lon[i]));
      b.forEach((i, k) => (values[i] = el[k]));
      done++;
      onProgress?.(done / batches.length);
    }),
  );
  // Interpolation des points intermédiaires et des éventuels trous (NaN).
  let prev = -1;
  for (let i = 0; i < route.n; i++) {
    if (Number.isNaN(values[i])) continue;
    if (prev >= 0 && i - prev > 1) {
      for (let q = prev + 1; q < i; q++) values[q] = values[prev] + ((values[i] - values[prev]) * (q - prev)) / (i - prev);
    } else if (prev < 0) {
      for (let q = 0; q < i; q++) values[q] = values[i];
    }
    prev = i;
  }
  if (prev < 0) throw new Error('no-elevation');
  for (let q = prev + 1; q < route.n; q++) values[q] = values[prev];
  return values;
}

/**
 * Grille d'altitude (w × h valeurs, rangées du nord au sud, colonnes d'ouest en est).
 * La boîte est élargie d'un demi-pixel pour que les centres de pixels tombent
 * exactement sur les bords de la tuile : les tuiles voisines se raccordent sans couture.
 */
export async function fetchDemGrid(b: BBox, w: number, h: number): Promise<Float32Array> {
  const hx = (b.maxLon - b.minLon) / (w - 1) / 2;
  const hy = (b.maxLat - b.minLat) / (h - 1) / 2;
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: IGN.demLayer,
    STYLES: '',
    FORMAT: 'image/x-bil;bits=32',
    CRS: 'EPSG:4326',
    BBOX: [b.minLat - hy, b.minLon - hx, b.maxLat + hy, b.maxLon + hx].map((v) => v.toFixed(7)).join(','),
    WIDTH: String(w),
    HEIGHT: String(h),
  });
  const res = await cachedFetch(`${IGN.wmsR}?${params}`);
  if (!(res.headers.get('content-type') ?? '').includes('bil')) throw new Error('dem-format');
  const buf = await res.arrayBuffer();
  const out = new Float32Array(w * h);
  const dv = new DataView(buf);
  let last = 0;
  for (let i = 0; i < w * h; i++) {
    const v = i * 4 + 4 <= buf.byteLength ? dv.getFloat32(i * 4, true) : NaN;
    // Valeurs « sans donnée » (mer, hors France) : on reprend la dernière valeur valide.
    if (!Number.isFinite(v) || v < -500 || v > 9000) out[i] = last;
    else out[i] = last = v;
  }
  return out;
}

/** Orthophoto (pixels RVBA) de la boîte, pour colorer le terrain. Renvoie null si indisponible. */
export async function fetchOrtho(b: BBox, w: number, h: number): Promise<Uint8ClampedArray | null> {
  try {
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetMap',
      LAYERS: IGN.orthoLayer,
      STYLES: '',
      FORMAT: 'image/jpeg',
      CRS: 'EPSG:4326',
      BBOX: [b.minLat, b.minLon, b.maxLat, b.maxLon].map((v) => v.toFixed(7)).join(','),
      WIDTH: String(w),
      HEIGHT: String(h),
    });
    const res = await cachedFetch(`${IGN.wmsR}?${params}`);
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
export interface GeoFeature {
  id: string;
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

/** Objets BD TOPO d'une couche dans une boîte (pagination automatique). */
export async function fetchWfs(layer: string, b: BBox, properties: string[], maxPages = 4): Promise<GeoFeature[]> {
  const PAGE = 5000;
  const all: GeoFeature[] = [];
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '2.0.0',
      REQUEST: 'GetFeature',
      TYPENAMES: `BDTOPO_V3:${layer}`,
      BBOX: `${b.minLat.toFixed(6)},${b.minLon.toFixed(6)},${b.maxLat.toFixed(6)},${b.maxLon.toFixed(6)},urn:ogc:def:crs:EPSG::4326`,
      OUTPUTFORMAT: 'application/json',
      COUNT: String(PAGE),
      STARTINDEX: String(page * PAGE),
      PROPERTYNAME: ['geometrie', ...properties].join(','),
    });
    const res = await cachedFetch(`${IGN.wfs}?${params}`);
    const json = (await res.json()) as { features?: GeoFeature[]; numberMatched?: number };
    const feats = json.features ?? [];
    all.push(...feats);
    if (feats.length < PAGE) break;
  }
  return all;
}

async function hash(s: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h);
}
