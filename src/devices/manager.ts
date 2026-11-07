/**
 * Gestionnaire des capteurs : connecte, fusionne les mesures, pilote le trainer.
 *
 * Priorités :
 *  - puissance : capteur de puissance dédié s'il est connecté, sinon le trainer ;
 *  - cadence : capteur de puissance > capteur de cadence > trainer ;
 *  - cardio : ceinture/montre > valeur relayée par le trainer.
 *
 * Sans capteur (ou en « mode démo »), un cycliste simulé au clavier prend le relais :
 * flèches haut/bas pour changer la puissance.
 */
import { bluetoothSupported, UUID, type BleSensor, type SensorKind, type SensorReading } from './ble';
import { FtmsTrainer, PowerMeter, HeartRateMonitor, CadenceSensor } from './sensors';

interface Stamped {
  value: number;
  at: number;
}

/** Une mesure plus vieille que ce délai est considérée comme perdue (ms). */
const STALE_MS = 3000;

export interface LiveData {
  power: number;
  cadence: number;
  hr: number;
  /** source de la puissance */
  source: 'ble' | 'demo';
}

export class DeviceManager {
  sensors: Partial<Record<SensorKind, BleSensor>> = {};
  /** puissance demandée en mode démo (W) */
  demoPower = 180;
  /** force le mode démo même si des capteurs sont connectés */
  demoForced = false;
  onChange: () => void = () => {};

  private power: Partial<Record<SensorKind, Stamped>> = {};
  private cadence: Partial<Record<SensorKind, Stamped>> = {};
  private hr: Partial<Record<SensorKind, Stamped>> = {};
  private demoHr = 95;
  private demoCad = 0;

  get supported(): boolean {
    return bluetoothSupported();
  }

  get trainer(): FtmsTrainer | null {
    const t = this.sensors.trainer;
    return t instanceof FtmsTrainer && t.controllable && t.status === 'connected' ? t : null;
  }

  /** Ouvre la fenêtre de choix Bluetooth du navigateur (doit suivre un clic). */
  async connect(kind: SensorKind): Promise<void> {
    if (!this.supported) throw new Error('bluetooth-unsupported');
    const filters: BluetoothLEScanFilter[] =
      kind === 'trainer' ? [{ services: [UUID.FTMS] }, { services: [UUID.CPS] }]
      : kind === 'power' ? [{ services: [UUID.CPS] }]
      : kind === 'hr' ? [{ services: [UUID.HRS] }]
      : [{ services: [UUID.CSC] }];
    const device = await navigator.bluetooth.requestDevice({
      filters,
      optionalServices: [UUID.FTMS, UUID.CPS, UUID.HRS, UUID.CSC, UUID.DEVICE_INFO],
    });
    this.sensors[kind]?.disconnect();
    let sensor: BleSensor;
    if (kind === 'trainer') {
      // On préfère FTMS (pilotable) ; à défaut, le trainer n'envoie que sa puissance.
      const server = await device.gatt!.connect();
      const hasFtms = await server.getPrimaryService(UUID.FTMS).then(() => true, () => false);
      sensor = hasFtms ? new FtmsTrainer() : new PowerMeter('trainer');
    } else if (kind === 'power') sensor = new PowerMeter('power');
    else if (kind === 'hr') sensor = new HeartRateMonitor();
    else sensor = new CadenceSensor();
    sensor.onData = (r) => this.ingest(kind, r);
    sensor.onStatus = () => this.onChange();
    this.sensors[kind] = sensor;
    await sensor.attach(device);
    this.onChange();
  }

  disconnect(kind: SensorKind): void {
    this.sensors[kind]?.disconnect();
    delete this.sensors[kind];
    this.onChange();
  }

  private ingest(kind: SensorKind, r: SensorReading): void {
    const now = performance.now();
    if (r.power !== undefined) this.power[kind] = { value: Math.max(0, r.power), at: now };
    if (r.cadence !== undefined) this.cadence[kind] = { value: r.cadence, at: now };
    if (r.hr !== undefined) this.hr[kind] = { value: r.hr, at: now };
  }

  private pick(map: Partial<Record<SensorKind, Stamped>>, order: SensorKind[], now: number): number | undefined {
    for (const k of order) {
      const s = map[k];
      if (s && now - s.at < STALE_MS && this.sensors[k]?.status === 'connected') return s.value;
    }
    return undefined;
  }

  /** vrai si une vraie source de puissance est disponible */
  get hasPowerSource(): boolean {
    return !this.demoForced && (['power', 'trainer'] as SensorKind[]).some((k) => this.sensors[k]?.status === 'connected');
  }

  /**
   * Mesures du moment. dt sert à faire évoluer le cardio et la cadence simulés.
   * ftp/hrMax permettent une simulation crédible en mode démo.
   */
  read(dt: number, ftp: number, hrMax: number): LiveData {
    const now = performance.now();
    if (this.hasPowerSource) {
      const power = this.pick(this.power, ['power', 'trainer'], now) ?? 0;
      const cadence = this.pick(this.cadence, ['power', 'cadence', 'trainer'], now) ?? 0;
      const hr = this.pick(this.hr, ['hr', 'trainer'], now) ?? 0;
      return { power, cadence, hr, source: 'ble' };
    }
    // Mode démo : cadence et cardio suivent la puissance avec un temps de réponse réaliste.
    const p = Math.max(0, this.demoPower);
    const targetCad = p > 0 ? 82 + Math.min(12, p / 40) : 0;
    this.demoCad += (targetCad - this.demoCad) * Math.min(1, dt * 2);
    const rest = 60;
    const targetHr = rest + (hrMax - rest) * Math.min(1, 0.35 + 0.6 * (p / Math.max(ftp, 1)));
    this.demoHr += (targetHr - this.demoHr) * Math.min(1, dt / 25);
    const realHr = this.pick(this.hr, ['hr'], now);
    return {
      power: p,
      cadence: this.demoCad + (p > 0 ? Math.sin(now / 900) * 1.5 : 0),
      hr: realHr ?? Math.round(this.demoHr),
      source: 'demo',
    };
  }
}
