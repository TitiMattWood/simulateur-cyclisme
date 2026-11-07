/**
 * Capteurs Bluetooth concrets : trainer FTMS, capteur de puissance, cardio, cadence.
 */
import { BleSensor, CrankCadence, UUID } from './ble';
import {
  parseIndoorBikeData, parseCyclingPower, parseHeartRate, parseCsc,
  encodeSimulation, encodeTargetPower,
} from './parsers';

/** Home trainer connecté (FTMS) : lecture des données + pilotage SIM / ERG. */
export class FtmsTrainer extends BleSensor {
  /** vrai si le trainer accepte qu'on pilote sa résistance */
  controllable = false;
  private cp?: BluetoothRemoteGATTCharacteristic;
  private chain: Promise<unknown> = Promise.resolve();

  constructor() {
    super('trainer');
  }

  protected async setup(server: BluetoothRemoteGATTServer): Promise<void> {
    await this.subscribe(server, UUID.FTMS, UUID.INDOOR_BIKE_DATA, (dv) => {
      const d = parseIndoorBikeData(dv);
      this.onData({ power: d.power, cadence: d.cadence, speed: d.speed, hr: d.hr || undefined });
    });
    try {
      const svc = await server.getPrimaryService(UUID.FTMS);
      this.cp = await svc.getCharacteristic(UUID.FTMS_CONTROL_POINT);
      // Le point de contrôle répond par « indications » : il faut s'y abonner avant d'écrire.
      await this.cp.startNotifications();
      await this.write(new Uint8Array([0x00])); // demande de contrôle
      await this.write(new Uint8Array([0x07])); // démarrage
      this.controllable = true;
    } catch {
      this.controllable = false;
    }
  }

  /** Mode SIM : pente (fraction), Crr, coefficient de vent cw = ½·ρ·CdA (kg/m), vent (m/s). */
  setSimulation(grade: number, crr: number, cw: number, windSpeed: number): Promise<void> {
    return this.write(encodeSimulation(windSpeed, grade, crr, cw));
  }

  /** Mode ERG : le trainer impose cette puissance quelle que soit la cadence. */
  setTargetPower(watts: number): Promise<void> {
    return this.write(encodeTargetPower(watts));
  }

  /** Les écritures Bluetooth sont mises en file : une seule opération à la fois. */
  private write(bytes: Uint8Array): Promise<void> {
    const run = async () => {
      if (!this.cp || this.status !== 'connected' && this.status !== 'connecting') return;
      const data = new Uint8Array(bytes); // copie : BufferSource propre
      if ('writeValueWithResponse' in this.cp) await this.cp.writeValueWithResponse(data);
      else await (this.cp as BluetoothRemoteGATTCharacteristic).writeValue(data);
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }
}

/** Capteur de puissance (ou trainer non pilotable qui n'expose que CPS). */
export class PowerMeter extends BleSensor {
  private cad = new CrankCadence();

  constructor(kind: 'trainer' | 'power' = 'power') {
    super(kind);
  }

  protected async setup(server: BluetoothRemoteGATTServer): Promise<void> {
    await this.subscribe(server, UUID.CPS, UUID.CP_MEASUREMENT, (dv) => {
      const d = parseCyclingPower(dv);
      const r: { power: number; cadence?: number } = { power: d.power };
      if (d.crankRevs !== undefined && d.crankTime !== undefined) r.cadence = this.cad.update(d.crankRevs, d.crankTime);
      this.onData(r);
    });
  }
}

/** Ceinture cardio ou montre en diffusion de fréquence cardiaque. */
export class HeartRateMonitor extends BleSensor {
  constructor() {
    super('hr');
  }

  protected async setup(server: BluetoothRemoteGATTServer): Promise<void> {
    await this.subscribe(server, UUID.HRS, UUID.HR_MEASUREMENT, (dv) => {
      const hr = parseHeartRate(dv);
      if (hr > 0) this.onData({ hr });
    });
  }
}

/** Capteur de cadence seul. */
export class CadenceSensor extends BleSensor {
  private cad = new CrankCadence();

  constructor() {
    super('cadence');
  }

  protected async setup(server: BluetoothRemoteGATTServer): Promise<void> {
    await this.subscribe(server, UUID.CSC, UUID.CSC_MEASUREMENT, (dv) => {
      const d = parseCsc(dv);
      if (d.crankRevs !== undefined && d.crankTime !== undefined) this.onData({ cadence: this.cad.update(d.crankRevs, d.crankTime) });
    });
  }
}
