import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  STANDARD_DEFAULT_MAX_SPEED_KMH,
  STANDARD_DEFAULT_MIN_SPEED_KMH,
  STANDARD_MIN_STATUS_LENGTH,
  STANDARD_PACKET_HEADER_1,
  STANDARD_PACKET_HEADER_2,
  STANDARD_PACKET_SUFFIX,
} from './constants';
import { SpeedOutOfRangeError } from './errors';
import { StandardProtocol } from './protocol-standard';
import { createDefaultState } from './types';

describe('StandardProtocol', () => {
  const protocol = new StandardProtocol();

  describe('parseStatus', () => {
    it('never throws for any input', () => {
      fc.assert(
        fc.property(fc.uint8Array(), (data) => {
          const buf = new Uint8Array(data).buffer as ArrayBuffer;
          expect(() => protocol.parseStatus(buf)).not.toThrow();
        }),
      );
    });

    it('returns default-like state for buffer shorter than MIN_STATUS_LENGTH', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ maxLength: STANDARD_MIN_STATUS_LENGTH - 1 }),
          (data) => {
            const state = protocol.parseStatus(
              new Uint8Array(data).buffer as ArrayBuffer,
            );
            expect(state).toEqual(createDefaultState());
          },
        ),
      );
    });

    it('returns object with all required keys for any buffer length >= MIN_STATUS_LENGTH', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({
            minLength: STANDARD_MIN_STATUS_LENGTH,
            maxLength: 64,
          }),
          (data) => {
            const state = protocol.parseStatus(
              new Uint8Array(data).buffer as ArrayBuffer,
            );
            expect(typeof state.state).toBe('number');
            expect(typeof state.speed).toBe('number');
            expect(typeof state.time).toBe('number');
            expect(typeof state.distance).toBe('number');
            expect(typeof state.steps).toBe('number');
            expect(typeof state.mode).toBe('number');
            expect(typeof state.isRunning).toBe('boolean');
          },
        ),
      );
    });

    it('parses known packet: state, speed, time, distance, steps', () => {
      const bytes = new Uint8Array(16);
      bytes[0] = STANDARD_PACKET_HEADER_1;
      bytes[1] = STANDARD_PACKET_HEADER_2;
      bytes[2] = 1; // state = running
      bytes[3] = 35; // speed = 3.5 km/h
      bytes[4] = 0; // mode
      bytes[5] = 0;
      bytes[6] = 0;
      bytes[7] = 120; // time = 120 s
      bytes[8] = 0;
      bytes[9] = 0;
      bytes[10] = 50; // distance = 0.5 km (50 * 10m / 100)
      bytes[11] = 0;
      bytes[12] = 0;
      bytes[13] = 100; // steps = 100
      bytes[14] = 0;
      bytes[15] = 0xfd;

      const state = protocol.parseStatus(bytes.buffer);
      expect(state.state).toBe(1);
      expect(state.speed).toBe(3.5);
      expect(state.time).toBe(120);
      expect(state.distance).toBe(0.5);
      expect(state.steps).toBe(100);
      expect(state.isRunning).toBe(true);
    });

    it('isRunning is true when speed > 0 or state === 1', () => {
      const buf = new ArrayBuffer(16);
      const view = new Uint8Array(buf);
      view[2] = 1;
      view[3] = 20; // 2.0 km/h
      const state = protocol.parseStatus(buf);
      expect(state.isRunning).toBe(true);
    });
  });

  describe('command builders', () => {
    it('cmdStart returns packet with prefix and suffix', () => {
      const cmd = protocol.cmdStart();
      expect(cmd[0]).toBe(STANDARD_PACKET_HEADER_1);
      expect(cmd[1]).toBe(STANDARD_PACKET_HEADER_2);
      expect(cmd[cmd.length - 1]).toBe(STANDARD_PACKET_SUFFIX);
    });

    it('cmdStop returns packet with prefix and suffix', () => {
      const cmd = protocol.cmdStop();
      expect(cmd[0]).toBe(STANDARD_PACKET_HEADER_1);
      expect(cmd[1]).toBe(STANDARD_PACKET_HEADER_2);
      expect(cmd[cmd.length - 1]).toBe(STANDARD_PACKET_SUFFIX);
    });

    it('cmdAskStats returns non-empty packet', () => {
      const cmd = protocol.cmdAskStats();
      expect(cmd.length).toBeGreaterThan(0);
      expect(cmd[0]).toBe(STANDARD_PACKET_HEADER_1);
      expect(cmd[cmd.length - 1]).toBe(STANDARD_PACKET_SUFFIX);
    });

    it('cmdSetSpeed throws SpeedOutOfRangeError for values outside [0.5, 6.0]', () => {
      expect(() => protocol.cmdSetSpeed(-1)).toThrow(SpeedOutOfRangeError);
      expect(() => protocol.cmdSetSpeed(0)).toThrow(SpeedOutOfRangeError);
      expect(() => protocol.cmdSetSpeed(0.4)).toThrow(SpeedOutOfRangeError);
      expect(() => protocol.cmdSetSpeed(6.1)).toThrow(SpeedOutOfRangeError);
      expect(() => protocol.cmdSetSpeed(10)).toThrow(SpeedOutOfRangeError);
    });

    it('cmdSetSpeed throws SpeedOutOfRangeError for NaN', () => {
      expect(() => protocol.cmdSetSpeed(NaN)).toThrow(SpeedOutOfRangeError);
    });

    it('cmdSetSpeed throws SpeedOutOfRangeError for Infinity', () => {
      expect(() => protocol.cmdSetSpeed(Infinity)).toThrow(
        SpeedOutOfRangeError,
      );
    });

    it('cmdSetSpeed throws SpeedOutOfRangeError for -Infinity', () => {
      expect(() => protocol.cmdSetSpeed(-Infinity)).toThrow(
        SpeedOutOfRangeError,
      );
    });

    it('cmdSetSpeed accepts valid speeds in range [0.5, 6.0]', () => {
      // Speed value is at index 3 (after header + opcode), encoded as speed * 10
      const cmdMin = protocol.cmdSetSpeed(STANDARD_DEFAULT_MIN_SPEED_KMH);
      expect(cmdMin[3]).toBe(5); // 0.5 * 10 = 5

      const cmdMax = protocol.cmdSetSpeed(STANDARD_DEFAULT_MAX_SPEED_KMH);
      expect(cmdMax[3]).toBe(60); // 6.0 * 10 = 60

      const cmdNormal = protocol.cmdSetSpeed(3.5);
      expect(cmdNormal[3]).toBe(35); // 3.5 * 10 = 35
    });

    it('cmdRequestControl returns empty array', () => {
      expect(protocol.cmdRequestControl().length).toBe(0);
    });
  });

  describe('checksum property', () => {
    it('createPacket (via cmdAskStats) has valid checksum: sum(bytes[1..n-2]) mod 256 = byte n-1', () => {
      const cmd = protocol.cmdAskStats();
      let sum = 0;
      for (let i = 1; i < cmd.length - 2; i++) {
        sum += cmd[i]!;
      }
      expect((sum & 0xff) === cmd[cmd.length - 2]).toBe(true);
    });
  });
});
