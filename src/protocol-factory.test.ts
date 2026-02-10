import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { detectProtocol, getProtocol } from './protocol-factory';
import type { ProtocolName } from './types';

describe('detectProtocol', () => {
  it('returns ftms for valid FTMS service UUID', () => {
    expect(detectProtocol(['00001826-0000-1000-8000-00805f9b34fb'])).toBe(
      'ftms',
    );
  });

  it('returns ftms for short FTMS UUID', () => {
    expect(detectProtocol(['1826'])).toBe('ftms');
  });

  it('returns standard when no FTMS UUID present', () => {
    expect(detectProtocol([])).toBe('standard');
    expect(detectProtocol(['0000fe00-0000-1000-8000-00805f9b34fb'])).toBe(
      'standard',
    );
    expect(detectProtocol(['0000fff0-0000-1000-8000-00805f9b34fb'])).toBe(
      'standard',
    );
  });

  it('is case-insensitive', () => {
    expect(
      detectProtocol(['00001826-0000-1000-8000-00805f9b34fb'.toUpperCase()]),
    ).toBe('ftms');
  });

  // HIGH PRIORITY FIX: Should NOT match UUIDs where 1826 appears at wrong position
  it('does NOT match when 1826 appears at wrong position in UUID', () => {
    // These should NOT be detected as FTMS - 1826 is not the service short ID
    expect(detectProtocol(['ab1826cd'])).toBe('standard'); // 1826 in middle
    expect(detectProtocol(['18260000-0000-1000-8000-00805f9b34fb'])).toBe(
      'standard',
    ); // 1826 at start
    expect(detectProtocol(['00001826'])).toBe('standard'); // incomplete UUID with 1826 at wrong position
  });

  it('property: list containing valid FTMS UUID yields ftms', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (other) => {
        const uuid = '00001826-0000-1000-8000-00805f9b34fb';
        expect(detectProtocol([...other, uuid])).toBe('ftms');
      }),
    );
  });
});

describe('getProtocol', () => {
  it('returns protocol with correct name', () => {
    expect(getProtocol('standard').name).toBe('standard');
    expect(getProtocol('ftms').name).toBe('ftms');
  });

  it('returns different instances for standard vs ftms', () => {
    const a = getProtocol('standard');
    const b = getProtocol('ftms');
    expect(a).not.toBe(b);
    expect(a.name).not.toBe(b.name);
  });

  // HIGH PRIORITY FIX: Should cache protocol instances
  it('returns same instance for repeated calls with same protocol', () => {
    const standard1 = getProtocol('standard');
    const standard2 = getProtocol('standard');
    expect(standard1).toBe(standard2);

    const ftms1 = getProtocol('ftms');
    const ftms2 = getProtocol('ftms');
    expect(ftms1).toBe(ftms2);
  });

  it('property: getProtocol(detectProtocol(uuids)).name matches when uuids contain FTMS', () => {
    const uuidsWithFTMS = ['00001826-0000-1000-8000-00805f9b34fb'];
    const name: ProtocolName = detectProtocol(uuidsWithFTMS);
    expect(getProtocol(name).name).toBe('ftms');
  });
});
