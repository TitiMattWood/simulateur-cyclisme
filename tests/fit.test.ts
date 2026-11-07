import { describe, it, expect } from 'vitest';
import { Decoder, Stream } from '@garmin/fitsdk';
import { encodeFit } from '../src/export/fit';
import { Recorder } from '../src/ride/recorder';
import { normalizedPower, trainingLoad } from '../src/ride/metrics';

describe('export .fit', () => {
  it('produit un fichier valide pour le décodeur officiel Garmin', () => {
    const rec = new Recorder();
    for (let i = 0; i < 600; i++) {
      rec.tick(1, {
        dist: i * 9, lat: 49.03 + i * 1e-5, lon: 2.05 + i * 1e-5, ele: 40 + i * 0.05,
        speed: 9, power: 200 + (i % 10), cadence: 88, hr: 140,
      });
    }
    const s = rec.summarize('Test', 250);
    const bytes = encodeFit(rec.samples, s);
    const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
    expect(decoder.isFIT()).toBe(true);
    expect(decoder.checkIntegrity()).toBe(true);
    const { messages, errors } = decoder.read();
    expect(errors).toEqual([]);
    expect(messages.recordMesgs.length).toBe(600);
    const r = messages.recordMesgs[100];
    expect(r.power).toBe(200);
    expect(r.heartRate).toBe(140);
    expect(r.altitude).toBeCloseTo(45, 0);
    expect(r.positionLat / 2 ** 31 * 180).toBeCloseTo(49.031, 4);
    const session = messages.sessionMesgs[0];
    expect(session.sport).toBe('cycling');
    expect(session.subSport).toBe('virtualActivity');
    expect(session.totalDistance).toBeCloseTo(s.distance, 0);
    expect(session.avgPower).toBe(Math.round(s.avgPower));
    expect(messages.activityMesgs.length).toBe(1);
  });
});

describe('indicateurs', () => {
  it('NP = puissance constante pour un effort constant ; TSS = 100 pour 1 h à la FTP', () => {
    const p = new Array(3600).fill(250);
    expect(normalizedPower(p)).toBeCloseTo(250, 5);
    expect(trainingLoad(3600, 250, 250).tss).toBeCloseTo(100, 5);
  });
  it('NP > moyenne pour un effort irrégulier', () => {
    const p = Array.from({ length: 1200 }, (_, i) => (Math.floor(i / 60) % 2 ? 350 : 150));
    expect(normalizedPower(p)).toBeGreaterThan(260);
  });
});
