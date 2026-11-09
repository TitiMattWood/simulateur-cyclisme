import { describe, it, expect } from 'vitest';
import { decodeClick, parseVarintFields } from '../src/devices/zwiftClick';

describe('Zwift Click', () => {
  it('lit les champs protobuf entiers', () => {
    const f = parseVarintFields(new Uint8Array([0x08, 0x00, 0x10, 0x01]));
    expect(f.get(1)).toBe(0);
    expect(f.get(2)).toBe(1);
  });
  it('décode l’appui sur + (champ 1 = 0)', () => {
    expect(decodeClick(new Uint8Array([0x37, 0x08, 0x00, 0x10, 0x01]))).toEqual({ plus: true, minus: false });
    expect(decodeClick(new Uint8Array([0x37, 0x08, 0x01, 0x10, 0x00]))).toEqual({ plus: false, minus: true });
  });
  it('ignore les autres messages', () => {
    expect(decodeClick(new Uint8Array([0x19, 0x08, 0x64]))).toBeNull();
  });
});
