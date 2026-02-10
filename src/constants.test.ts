import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BLUETOOTH_UUID_BASE,
  FTMS_OP_START_RESUME,
  FTMS_STOP_PARAM_STOP,
  GATT_FTMS_SERVICE,
  GATT_STANDARD_SERVICE_FE00,
  MANAGER_POLL_INTERVAL_MS,
  STANDARD_MIN_STATUS_LENGTH,
  STANDARD_PACKET_SUFFIX,
  toFullUuid,
} from './constants';

describe('toFullUuid', () => {
  it('returns 36-character UUID string', () => {
    expect(toFullUuid(0x1826).length).toBe(36);
    expect(toFullUuid(0).length).toBe(36);
    expect(toFullUuid(0xffff).length).toBe(36);
  });

  it('contains Bluetooth base suffix', () => {
    expect(toFullUuid(0x1826)).toContain(BLUETOOTH_UUID_BASE);
  });

  it('formats 0x1826 as 00001826-...', () => {
    const u = toFullUuid(0x1826);
    expect(u.startsWith('00001826')).toBe(true);
  });

  it('property: shortId in [0, 65535] yields 36-char UUID starting with 0000 + 4 hex digits', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 65535 }), (shortId) => {
        const u = toFullUuid(shortId);
        expect(u.length).toBe(36);
        const hex = shortId.toString(16).padStart(4, '0').toLowerCase();
        expect(u.toLowerCase().startsWith(`0000${hex}`)).toBe(true);
      }),
    );
  });
});

describe('constants consistency', () => {
  it('GATT service UUIDs are lowercase hex', () => {
    expect(GATT_FTMS_SERVICE).toBe('1826');
    expect(GATT_STANDARD_SERVICE_FE00).toBe('fe00');
  });

  it('Standard min status length is 16', () => {
    expect(STANDARD_MIN_STATUS_LENGTH).toBe(16);
  });

  it('Standard packet suffix is 0xFD', () => {
    expect(STANDARD_PACKET_SUFFIX).toBe(0xfd);
  });

  it('FTMS start opcode is 0x07', () => {
    expect(FTMS_OP_START_RESUME).toBe(0x07);
  });

  it('FTMS stop param is 0x01', () => {
    expect(FTMS_STOP_PARAM_STOP).toBe(0x01);
  });

  it('Manager poll interval is positive', () => {
    expect(MANAGER_POLL_INTERVAL_MS).toBeGreaterThan(0);
  });
});
