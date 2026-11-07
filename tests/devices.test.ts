import { describe, it, expect } from 'vitest';
import { parseIndoorBikeData, parseCyclingPower, parseHeartRate, encodeSimulation, encodeTargetPower } from '../src/devices/parsers';
import { CrankCadence } from '../src/devices/ble';

const dv = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

describe('trames Bluetooth', () => {
  it('FTMS Indoor Bike Data : vitesse, cadence, puissance', () => {
    // flags 0x0044 = cadence + puissance, bit 0 à 0 → vitesse présente
    const d = parseIndoorBikeData(dv([0x44, 0x00, 0x10, 0x0e, 0xaa, 0x00, 0xfa, 0x00]));
    expect(d.speed).toBeCloseTo(36, 1); // 3600 × 0,01 km/h
    expect(d.cadence).toBe(85); // 170 × 0,5
    expect(d.power).toBe(250);
  });

  it('CPS : puissance et cadence par tours de pédalier', () => {
    const c = new CrankCadence();
    // flags 0x20 = données pédalier ; 200 W ; 10 tours à t=1024 (1 s)
    const a = parseCyclingPower(dv([0x20, 0x00, 0xc8, 0x00, 10, 0, 0x00, 0x04]));
    expect(a.power).toBe(200);
    c.update(a.crankRevs!, a.crankTime!, 0);
    // 1,5 tour plus tard en 1 s → 90 tr/min (ici 3 tours en 2 s)
    expect(c.update(13, 1024 + 2048, 2000)).toBeCloseTo(90, 5);
  });

  it('cardio 8 et 16 bits', () => {
    expect(parseHeartRate(dv([0x00, 142]))).toBe(142);
    expect(parseHeartRate(dv([0x01, 0x2c, 0x01]))).toBe(300);
  });

  it('commandes FTMS SIM et ERG', () => {
    expect(Array.from(encodeSimulation(0, 0.085, 0.004, 0.18))).toEqual([0x11, 0, 0, 0x52, 0x03, 40, 18]);
    expect(Array.from(encodeTargetPower(230))).toEqual([0x05, 230, 0]);
    expect(Array.from(encodeSimulation(0, -0.05, 0.004, 0.18)).slice(3, 5)).toEqual([0x0c, 0xfe]);
  });
});
