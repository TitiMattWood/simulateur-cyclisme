/**
 * Connexion Bluetooth (Web Bluetooth) aux capteurs standards :
 *  - FTMS (Fitness Machine Service) : home trainers connectés (Elite Direto X, Wahoo, Tacx,
 *    Saris, JetBlack...). Lecture puissance/cadence et pilotage de la résistance.
 *  - CPS (Cycling Power Service) : capteurs de puissance et trainers non pilotables.
 *  - HRS (Heart Rate Service) : ceintures cardio et montres qui diffusent leur fréquence
 *    cardiaque (Coros, Garmin : option « diffuser la FC »).
 *  - CSC (Cycling Speed and Cadence) : capteurs de cadence.
 *
 * Web Bluetooth fonctionne dans Chrome et Edge (Windows, macOS, Android, ChromeOS).
 * Sur iPad, il faut un navigateur qui l'ajoute (par exemple Bluefy) ; Safari ne le gère pas.
 */

export const UUID = {
  FTMS: 0x1826,
  INDOOR_BIKE_DATA: 0x2ad2,
  FTMS_CONTROL_POINT: 0x2ad9,
  FTMS_STATUS: 0x2ada,
  CPS: 0x1818,
  CP_MEASUREMENT: 0x2a63,
  HRS: 0x180d,
  HR_MEASUREMENT: 0x2a37,
  CSC: 0x1816,
  CSC_MEASUREMENT: 0x2a5b,
  DEVICE_INFO: 0x180a,
} as const;

export type SensorKind = 'trainer' | 'power' | 'hr' | 'cadence';
export type SensorStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface SensorReading {
  power?: number;
  cadence?: number;
  /** vitesse mesurée par le trainer (km/h) — information seulement, la vitesse du jeu vient de la physique */
  speed?: number;
  hr?: number;
}

export function bluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator && !!navigator.bluetooth;
}

/** Classe de base : connexion, reconnexion automatique, notifications. */
export abstract class BleSensor {
  status: SensorStatus = 'connecting';
  name = '';
  onData: (r: SensorReading) => void = () => {};
  onStatus: () => void = () => {};
  protected device?: BluetoothDevice;
  private wantConnected = true;
  private retry = 0;

  constructor(readonly kind: SensorKind) {}

  async attach(device: BluetoothDevice): Promise<void> {
    this.device = device;
    this.name = device.name ?? 'Bluetooth';
    device.addEventListener('gattserverdisconnected', () => this.handleDisconnect());
    await this.open();
  }

  private async open(): Promise<void> {
    if (!this.device?.gatt) throw new Error('no-gatt');
    this.setStatus(this.retry ? 'reconnecting' : 'connecting');
    const server = await this.device.gatt.connect();
    await this.setup(server);
    this.retry = 0;
    this.setStatus('connected');
  }

  /** Reconnexion automatique si le capteur décroche pendant la sortie. */
  private handleDisconnect(): void {
    if (!this.wantConnected) return;
    this.setStatus('reconnecting');
    const delay = Math.min(10000, 1000 * 2 ** this.retry++);
    setTimeout(() => {
      if (!this.wantConnected) return;
      this.open().catch(() => this.handleDisconnect());
    }, delay);
  }

  disconnect(): void {
    this.wantConnected = false;
    try {
      this.device?.gatt?.disconnect();
    } catch {
      /* déjà déconnecté */
    }
    this.setStatus('disconnected');
  }

  protected setStatus(s: SensorStatus): void {
    this.status = s;
    this.onStatus();
  }

  protected abstract setup(server: BluetoothRemoteGATTServer): Promise<void>;

  /** Abonnement aux notifications d'une caractéristique. */
  protected async subscribe(
    server: BluetoothRemoteGATTServer, service: number, characteristic: number,
    handler: (dv: DataView) => void,
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    const svc = await server.getPrimaryService(service);
    const ch = await svc.getCharacteristic(characteristic);
    ch.addEventListener('characteristicvaluechanged', (ev) => {
      const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (v) handler(v);
    });
    await ch.startNotifications();
    return ch;
  }
}

/** Calcule une cadence (tr/min) à partir de compteurs de tours cumulés (CPS, CSC). */
export class CrankCadence {
  private lastRevs = -1;
  private lastTime = 0;
  private lastChange = 0;
  cadence = 0;

  /** revs : tours cumulés (16 bits) ; time : horodatage de l'événement en 1/1024 s (16 bits). */
  update(revs: number, time: number, now = performance.now()): number {
    if (this.lastRevs >= 0) {
      const dRev = (revs - this.lastRevs) & 0xffff;
      const dt = ((time - this.lastTime) & 0xffff) / 1024;
      if (dRev > 0 && dt > 0) {
        const c = (dRev / dt) * 60;
        if (c < 250) this.cadence = c;
        this.lastChange = now;
      } else if (now - this.lastChange > 2500) {
        this.cadence = 0;
      }
    }
    this.lastRevs = revs;
    this.lastTime = time;
    return this.cadence;
  }
}
