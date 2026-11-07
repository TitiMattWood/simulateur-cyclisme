/**
 * Décodage des trames Bluetooth (spécifications officielles du Bluetooth SIG).
 * Fonctions pures, testées unitairement.
 */

export interface IndoorBikeData {
  speed?: number; // km/h
  cadence?: number; // tr/min
  power?: number; // W
  hr?: number; // bpm
}

/** FTMS – caractéristique « Indoor Bike Data » (0x2AD2). */
export function parseIndoorBikeData(dv: DataView): IndoorBikeData {
  const flags = dv.getUint16(0, true);
  let o = 2;
  const out: IndoorBikeData = {};
  // Bit 0 « More Data » : quand il vaut 0, la vitesse instantanée EST présente.
  if (!(flags & 0x0001)) { out.speed = dv.getUint16(o, true) / 100; o += 2; }
  if (flags & 0x0002) o += 2; // vitesse moyenne
  if (flags & 0x0004) { out.cadence = dv.getUint16(o, true) / 2; o += 2; }
  if (flags & 0x0008) o += 2; // cadence moyenne
  if (flags & 0x0010) o += 3; // distance totale (24 bits)
  if (flags & 0x0020) o += 2; // niveau de résistance
  if (flags & 0x0040) { out.power = dv.getInt16(o, true); o += 2; }
  if (flags & 0x0080) o += 2; // puissance moyenne
  if (flags & 0x0100) o += 5; // énergie dépensée
  if (flags & 0x0200) { out.hr = dv.getUint8(o); o += 1; }
  return out;
}

export interface CyclingPower {
  power: number;
  crankRevs?: number;
  crankTime?: number;
}

/** CPS – caractéristique « Cycling Power Measurement » (0x2A63). */
export function parseCyclingPower(dv: DataView): CyclingPower {
  const flags = dv.getUint16(0, true);
  const power = dv.getInt16(2, true);
  let o = 4;
  if (flags & 0x0001) o += 1; // équilibre gauche/droite
  if (flags & 0x0004) o += 2; // couple cumulé
  if (flags & 0x0010) o += 6; // tours de roue
  const out: CyclingPower = { power };
  if (flags & 0x0020 && dv.byteLength >= o + 4) {
    out.crankRevs = dv.getUint16(o, true);
    out.crankTime = dv.getUint16(o + 2, true);
  }
  return out;
}

/** HRS – caractéristique « Heart Rate Measurement » (0x2A37). */
export function parseHeartRate(dv: DataView): number {
  const flags = dv.getUint8(0);
  return flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1);
}

/** CSC – caractéristique « CSC Measurement » (0x2A5B) : seulement la partie pédalier. */
export function parseCsc(dv: DataView): { crankRevs?: number; crankTime?: number } {
  const flags = dv.getUint8(0);
  let o = 1;
  if (flags & 0x01) o += 6;
  if (flags & 0x02 && dv.byteLength >= o + 4) {
    return { crankRevs: dv.getUint16(o, true), crankTime: dv.getUint16(o + 2, true) };
  }
  return {};
}

/**
 * FTMS – commande « Set Indoor Bike Simulation Parameters » (code 0x11).
 * Le trainer règle lui-même sa résistance à partir de ces paramètres (mode SIM).
 */
export function encodeSimulation(windSpeed: number, grade: number, crr: number, cw: number): Uint8Array {
  const buf = new DataView(new ArrayBuffer(7));
  buf.setUint8(0, 0x11);
  buf.setInt16(1, clamp(Math.round(windSpeed * 1000), -32768, 32767), true); // 0,001 m/s
  buf.setInt16(3, clamp(Math.round(grade * 100 * 100), -32768, 32767), true); // 0,01 %
  buf.setUint8(5, clamp(Math.round(crr * 10000), 0, 255)); // 0,0001
  buf.setUint8(6, clamp(Math.round(cw * 100), 0, 255)); // 0,01 kg/m
  return new Uint8Array(buf.buffer);
}

/** FTMS – commande « Set Target Power » (code 0x05) : mode ERG. */
export function encodeTargetPower(watts: number): Uint8Array {
  const buf = new DataView(new ArrayBuffer(3));
  buf.setUint8(0, 0x05);
  buf.setInt16(1, clamp(Math.round(watts), 0, 4000), true);
  return new Uint8Array(buf.buffer);
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
