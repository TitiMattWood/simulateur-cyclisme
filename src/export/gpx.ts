/**
 * Export .gpx de la sortie, avec cardio, cadence et puissance dans les extensions
 * (format lu par Strava, Garmin Connect et la plupart des plateformes).
 */
import type { Sample } from '../ride/recorder';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function encodeGpx(samples: Sample[], name: string, creator: string): string {
  const pts = samples
    .map((p) => {
      const ext = [
        p.hr > 0 ? `<gpxtpx:hr>${Math.round(p.hr)}</gpxtpx:hr>` : '',
        `<gpxtpx:cad>${Math.round(p.cadence)}</gpxtpx:cad>`,
      ].join('');
      return (
        `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">` +
        `<ele>${p.ele.toFixed(1)}</ele><time>${new Date(p.t).toISOString()}</time>` +
        `<extensions><power>${Math.round(p.power)}</power>` +
        `<gpxtpx:TrackPointExtension>${ext}</gpxtpx:TrackPointExtension></extensions></trkpt>`
      );
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${esc(creator)}" xmlns="http://www.topografix.com/GPX/1/1"
 xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
<metadata><name>${esc(name)}</name></metadata>
<trk><name>${esc(name)}</name><type>VirtualRide</type><trkseg>
${pts}
</trkseg></trk></gpx>
`;
}
