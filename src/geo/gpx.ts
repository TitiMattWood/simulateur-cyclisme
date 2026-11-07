/**
 * Lecture des fichiers .gpx (traces <trkpt> ou itinéraires <rtept>).
 * Lecture par expressions régulières : pas besoin du DOM, donc testable hors navigateur.
 */
export interface GpxPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: number;
}

export interface GpxData {
  name: string;
  points: GpxPoint[];
}

const ATTR = (attrs: string, name: string): number => {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(attrs);
  return m ? parseFloat(m[1]) : NaN;
};

export function parseGpx(text: string, fallbackName = 'Parcours'): GpxData {
  const points: GpxPoint[] = [];
  // On prend les points de trace ; à défaut, ceux d'itinéraire.
  for (const tag of ['trkpt', 'rtept']) {
    const re = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const lat = ATTR(m[1], 'lat');
      const lon = ATTR(m[1], 'lon');
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const p: GpxPoint = { lat, lon };
      const body = m[2] ?? '';
      const ele = /<ele>\s*([-\d.eE+]+)\s*<\/ele>/.exec(body);
      if (ele) p.ele = parseFloat(ele[1]);
      const time = /<time>\s*([^<]+)\s*<\/time>/.exec(body);
      if (time) {
        const ms = Date.parse(time[1]);
        if (Number.isFinite(ms)) p.time = ms;
      }
      points.push(p);
    }
    if (points.length) break;
  }
  const nameMatch = /<(?:trk|rte|metadata)\b[^>]*>[\s\S]*?<name>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/name>/.exec(text);
  const name = nameMatch ? decodeXml(nameMatch[1].trim()) : fallbackName;
  return { name: name || fallbackName, points };
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
