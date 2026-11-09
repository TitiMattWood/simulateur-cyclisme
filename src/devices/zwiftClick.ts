/**
 * Manette Zwift Click en Bluetooth direct (EXPÉRIMENTAL).
 *
 * Le protocole n'est pas public. Ce module suit les descriptions issues de la
 * rétro-ingénierie publiée par la communauté (projets libres autour des manettes Zwift) :
 *  - service propriétaire 00000001-19ca-4651-86e5-fa29dcdd09d1 ;
 *  - caractéristique « async » (…0002…) : notifications des boutons ;
 *  - caractéristique « sync RX » (…0003…) : on y écrit la poignée de main « RideOn » ;
 *  - caractéristique « sync TX » (…0004…) : réponses de la manette ;
 *  - message boutons de la Click : octet de type 0x37 suivi d'un petit message protobuf
 *    (champ 1 = bouton +, champ 2 = bouton −, valeur 0 = appuyé, 1 = relâché).
 *
 * Non testé avec une vraie manette : tout ce qui est reçu est écrit dans la console du
 * navigateur (préfixe [ZwiftClick]) pour pouvoir ajuster. En cas d'échec, le clavier et
 * BikeControl restent disponibles.
 */

const SERVICE = '00000001-19ca-4651-86e5-fa29dcdd09d1';
const ASYNC = '00000002-19ca-4651-86e5-fa29dcdd09d1';
const SYNC_RX = '00000003-19ca-4651-86e5-fa29dcdd09d1';
const SYNC_TX = '00000004-19ca-4651-86e5-fa29dcdd09d1';
const RIDE_ON = new TextEncoder().encode('RideOn');
const CLICK_MESSAGE = 0x37;

export type ClickStatus = 'idle' | 'connecting' | 'connected' | 'error';

/** Lit un message protobuf simple (champs entiers « varint ») : numéro de champ → valeur. */
export function parseVarintFields(bytes: Uint8Array): Map<number, number> {
  const out = new Map<number, number>();
  let i = 0;
  const varint = () => {
    let v = 0, shift = 0;
    while (i < bytes.length) {
      const b = bytes[i++];
      v |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    return v;
  };
  while (i < bytes.length) {
    const tag = varint();
    const field = tag >> 3, type = tag & 7;
    if (type === 0) out.set(field, varint());
    else if (type === 2) i += varint(); // champ de longueur variable : ignoré
    else break;
  }
  return out;
}

/** Décode une notification de la Click : renvoie l'état des boutons (true = appuyé) ou null. */
export function decodeClick(data: Uint8Array): { plus: boolean; minus: boolean } | null {
  if (data.length < 2 || data[0] !== CLICK_MESSAGE) return null;
  const f = parseVarintFields(data.subarray(1));
  return { plus: f.get(1) === 0, minus: f.get(2) === 0 };
}

export class ZwiftClick {
  status: ClickStatus = 'idle';
  name = '';
  /** appelé à l'appui d'un bouton : +1 (vitesse plus dure) ou −1 */
  onShift: (dir: 1 | -1) => void = () => {};
  onStatus: () => void = () => {};
  private last = { plus: false, minus: false };
  private device?: BluetoothDevice;

  async connect(): Promise<void> {
    this.setStatus('connecting');
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'Zwift' }],
        optionalServices: [SERVICE, 0xfc82],
      });
      this.name = this.device.name ?? 'Zwift Click';
      this.device.addEventListener('gattserverdisconnected', () => this.setStatus('idle'));
      const server = await this.device.gatt!.connect();
      const svc = await server.getPrimaryService(SERVICE);
      const asyncCh = await svc.getCharacteristic(ASYNC);
      const rx = await svc.getCharacteristic(SYNC_RX);
      const tx = await svc.getCharacteristic(SYNC_TX).catch(() => null);
      const onValue = (e: Event) => {
        const v = (e.target as BluetoothRemoteGATTCharacteristic).value!;
        const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        console.debug('[ZwiftClick] reçu', Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' '));
        this.handle(bytes);
      };
      asyncCh.addEventListener('characteristicvaluechanged', onValue);
      await asyncCh.startNotifications();
      if (tx) {
        tx.addEventListener('characteristicvaluechanged', onValue);
        await tx.startNotifications().catch(() => undefined);
      }
      // poignée de main : la manette répond « RideOn » puis envoie l'état des boutons
      await rx.writeValueWithResponse(RIDE_ON);
      this.setStatus('connected');
    } catch (e) {
      console.warn('[ZwiftClick] échec', e);
      this.setStatus((e as Error).name === 'NotFoundError' ? 'idle' : 'error');
      throw e;
    }
  }

  disconnect(): void {
    this.device?.gatt?.disconnect();
    this.setStatus('idle');
  }

  private handle(bytes: Uint8Array): void {
    const s = decodeClick(bytes);
    if (!s) return;
    // on réagit à l'appui (front montant), pas au maintien
    if (s.plus && !this.last.plus) this.onShift(1);
    if (s.minus && !this.last.minus) this.onShift(-1);
    this.last = s;
  }

  private setStatus(s: ClickStatus): void {
    this.status = s;
    this.onStatus();
  }
}
