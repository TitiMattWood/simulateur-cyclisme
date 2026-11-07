/**
 * Encodeur de fichiers .FIT (format d'activité Garmin, accepté par Strava, Garmin Connect,
 * Coros, TrainingPeaks...). L'activité est déclarée « cyclisme / activité virtuelle »,
 * ce que Strava affiche comme une « Sortie virtuelle ».
 *
 * Structure d'un fichier FIT :
 *   en-tête (14 octets) | messages de définition et de données | CRC 16 bits
 * Chaque message de données est précédé d'une « définition » qui décrit ses champs.
 */
import type { Sample, RideSummary } from '../ride/recorder';

/** Origine des dates FIT : 31/12/1989 00:00 UTC. */
const FIT_EPOCH = 631065600;

type BaseType = 'enum' | 'uint8' | 'uint16' | 'uint32' | 'sint32' | 'uint32z';
const BASE: Record<BaseType, { id: number; size: number; invalid: number }> = {
  enum: { id: 0x00, size: 1, invalid: 0xff },
  uint8: { id: 0x02, size: 1, invalid: 0xff },
  uint16: { id: 0x84, size: 2, invalid: 0xffff },
  uint32: { id: 0x86, size: 4, invalid: 0xffffffff },
  sint32: { id: 0x85, size: 4, invalid: 0x7fffffff },
  uint32z: { id: 0x8c, size: 4, invalid: 0 },
};

type Field = [num: number, type: BaseType];

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];

export function fitCrc(bytes: Uint8Array, start = 0, end = bytes.length, crc = 0): number {
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

class FitWriter {
  private out: number[] = [];
  private defs = new Map<number, Field[]>();

  define(local: number, globalNum: number, fields: Field[]): void {
    this.defs.set(local, fields);
    this.out.push(0x40 | local, 0, 0, globalNum & 0xff, (globalNum >> 8) & 0xff, fields.length);
    for (const [num, type] of fields) this.out.push(num, BASE[type].size, BASE[type].id);
  }

  data(local: number, values: Array<number | undefined>): void {
    const fields = this.defs.get(local);
    if (!fields) throw new Error('fit-undefined-message');
    this.out.push(local & 0x0f);
    fields.forEach(([, type], i) => {
      const b = BASE[type];
      let v = values[i];
      if (v === undefined || !Number.isFinite(v)) v = b.invalid;
      v = Math.round(v);
      if (type === 'sint32' && v < 0) v = v + 0x100000000;
      for (let k = 0; k < b.size; k++) this.out.push(Math.floor(v / 2 ** (8 * k)) & 0xff);
    });
  }

  finish(): Uint8Array {
    const dataSize = this.out.length;
    const file = new Uint8Array(14 + dataSize + 2);
    const dv = new DataView(file.buffer);
    dv.setUint8(0, 14);
    dv.setUint8(1, 0x20); // protocole 2.0
    dv.setUint16(2, 2132, true); // version du profil 21.32
    dv.setUint32(4, dataSize, true);
    file.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
    dv.setUint16(12, fitCrc(file, 0, 12), true);
    file.set(this.out, 14);
    dv.setUint16(14 + dataSize, fitCrc(file, 0, 14 + dataSize), true);
    return file;
  }
}

const fitTime = (ms: number) => Math.round(ms / 1000) - FIT_EPOCH;
const semicircles = (deg: number) => Math.round((deg * 2 ** 31) / 180);

/** Construit le fichier .fit d'une sortie. */
export function encodeFit(samples: Sample[], s: RideSummary): Uint8Array {
  const w = new FitWriter();
  const start = samples.length ? samples[0].t : Date.now();
  const end = samples.length ? samples[samples.length - 1].t : start;
  const tEnd = fitTime(end);
  const tStart = fitTime(start);

  // file_id (0)
  w.define(0, 0, [[0, 'enum'], [1, 'uint16'], [2, 'uint16'], [3, 'uint32z'], [4, 'uint32']]);
  w.data(0, [4, 255, 1, 20260101, tStart]);

  // event (21) : début du chronomètre
  w.define(1, 21, [[253, 'uint32'], [0, 'enum'], [1, 'enum']]);
  w.data(1, [tStart, 0, 0]);

  // record (20) : un point par seconde
  w.define(2, 20, [
    [253, 'uint32'], [0, 'sint32'], [1, 'sint32'], [2, 'uint16'], [3, 'uint8'],
    [4, 'uint8'], [5, 'uint32'], [6, 'uint16'], [7, 'uint16'],
  ]);
  for (const p of samples) {
    w.data(2, [
      fitTime(p.t), semicircles(p.lat), semicircles(p.lon), (p.ele + 500) * 5,
      p.hr > 0 ? p.hr : undefined, p.cadence, p.dist * 100, p.speed * 1000, p.power,
    ]);
  }

  // event (21) : arrêt
  w.data(1, [tEnd, 0, 4]);

  const totals = (msg: 'lap' | 'session') => {
    const isLap = msg === 'lap';
    return [
      tEnd, tStart, s.elapsedTime * 1000, s.movingTime * 1000, s.distance * 100,
      isLap ? 9 : 8, 1, 2, 58,
      s.avgPower, s.maxPower, s.avgHr || undefined, s.maxHr || undefined, s.avgCadence,
      s.ascent, s.kcal, s.avgSpeed * 1000, s.maxSpeed * 1000, s.np,
    ];
  };

  // lap (19)
  w.define(3, 19, [
    [253, 'uint32'], [2, 'uint32'], [7, 'uint32'], [8, 'uint32'], [9, 'uint32'],
    [0, 'enum'], [1, 'enum'], [25, 'enum'], [39, 'enum'],
    [19, 'uint16'], [20, 'uint16'], [15, 'uint8'], [16, 'uint8'], [17, 'uint8'],
    [21, 'uint16'], [11, 'uint16'], [13, 'uint16'], [14, 'uint16'], [33, 'uint16'],
  ]);
  w.data(3, totals('lap'));

  // session (18)
  w.define(4, 18, [
    [253, 'uint32'], [2, 'uint32'], [7, 'uint32'], [8, 'uint32'], [9, 'uint32'],
    [0, 'enum'], [1, 'enum'], [5, 'enum'], [6, 'enum'],
    [20, 'uint16'], [21, 'uint16'], [16, 'uint8'], [17, 'uint8'], [18, 'uint8'],
    [22, 'uint16'], [11, 'uint16'], [14, 'uint16'], [15, 'uint16'], [34, 'uint16'],
    [25, 'uint16'], [26, 'uint16'], [35, 'uint16'], [36, 'uint16'], [45, 'uint16'],
  ]);
  w.data(4, [...totals('session'), 0, 1, s.tss * 10, s.intensity * 1000, s.ftp]);

  // activity (34)
  const tzOffset = -new Date(end).getTimezoneOffset() * 60;
  w.define(5, 34, [[253, 'uint32'], [0, 'uint32'], [1, 'uint16'], [2, 'enum'], [3, 'enum'], [4, 'enum'], [5, 'uint32']]);
  w.data(5, [tEnd, s.movingTime * 1000, 1, 0, 26, 1, tEnd + tzOffset]);

  return w.finish();
}
