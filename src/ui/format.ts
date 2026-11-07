/** Mise en forme des valeurs affichées. */

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function fmtKm(meters: number, digits = 2): string {
  return (meters / 1000).toFixed(digits).replace('.', ',');
}

export function fmtNum(v: number, digits = 0): string {
  return v.toFixed(digits).replace('.', ',');
}

/** Zone de puissance (Coggan) : 1 à 7, et sa couleur. */
export function powerZone(power: number, ftp: number): { zone: number; color: string } {
  const r = ftp > 0 ? power / ftp : 0;
  const zones: Array<[number, string]> = [
    [0.55, '#9aa5b1'], [0.75, '#3b82f6'], [0.9, '#22c55e'], [1.05, '#eab308'],
    [1.2, '#f97316'], [1.5, '#ef4444'], [Infinity, '#a855f7'],
  ];
  const i = zones.findIndex(([lim]) => r < lim);
  return { zone: i + 1, color: zones[i][1] };
}

/** Couleur associée à une pente (fraction). */
export function gradeColor(g: number): string {
  if (g < -0.02) return '#38bdf8';
  if (g < 0.02) return '#a3e635';
  if (g < 0.05) return '#facc15';
  if (g < 0.08) return '#fb923c';
  if (g < 0.11) return '#ef4444';
  return '#7f1d1d';
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
