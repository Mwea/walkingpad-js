import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FTMS_DEFAULT_MAX_SPEED_KMH,
  FTMS_DEFAULT_MIN_SPEED_KMH,
} from './constants';
import { SpeedOutOfRangeError } from './errors';
import { FTMSProtocol } from './protocol-ftms';
import { createDefaultState } from './types';

describe('FTMSProtocol', () => {
  const protocol = new FTMSProtocol();

  describe('parseStatus', () => {
    it('never throws for any input', () => {
      fc.assert(
        fc.property(fc.uint8Array(), (data) => {
          const buf = new Uint8Array(data).buffer as ArrayBuffer;
          expect(() => protocol.parseStatus(buf)).not.toThrow();
        }),
      );
    });

    it('returns default-like state for buffer shorter than 2 bytes', () => {
      expect(protocol.parseStatus(new ArrayBuffer(0))).toEqual(
        createDefaultState(),
      );
      expect(protocol.parseStatus(new ArrayBuffer(1))).toEqual(
        createDefaultState(),
      );
    });

    it('returns object with all required keys for any buffer length >= 2', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 2, maxLength: 64 }), (data) => {
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
        }),
      );
    });

    it('state and isRunning are 0/false when speed is 0', () => {
      const buf = new Uint8Array(4);
      buf[0] = 0;
      buf[1] = 0;
      buf[2] = 0;
      buf[3] = 0;
      const state = protocol.parseStatus(buf.buffer);
      expect(state.speed).toBe(0);
      expect(state.state).toBe(0);
      expect(state.isRunning).toBe(false);
    });

    it('state and isRunning are 1/true when speed > 0', () => {
      const buf = new Uint8Array(4);
      buf[0] = 0;
      buf[1] = 0;
      buf[2] = 100; // 1.00 km/h (LE)
      buf[3] = 0;
      const state = protocol.parseStatus(buf.buffer);
      expect(state.speed).toBe(1);
      expect(state.state).toBe(1);
      expect(state.isRunning).toBe(true);
    });

    describe('truncated packet handling', () => {
      // These tests verify that truncated packets with flags set but missing bytes
      // return early with partial state rather than corrupting subsequent fields

      it('returns early with speed when AVERAGE_SPEED flag set but bytes missing', () => {
        // Flags: AVERAGE_SPEED (0x0002) set, but only speed field present
        // Format: [flags_lo, flags_hi, speed_lo, speed_hi]
        const buf = new Uint8Array([0x02, 0x00, 0x64, 0x00]); // speed = 1.00 km/h
        const state = protocol.parseStatus(buf.buffer);
        expect(state.speed).toBe(1);
        // Should have returned early, not parsed garbage
        expect(state.distance).toBe(0);
        expect(state.time).toBe(0);
      });

      it('returns early when TOTAL_DISTANCE flag set but only 2 bytes present', () => {
        // Flags: TOTAL_DISTANCE (0x0004) set, but only 2 of 3 distance bytes present
        const buf = new Uint8Array([0x04, 0x00, 0x64, 0x00, 0x01, 0x02]); // speed + 2 dist bytes
        const state = protocol.parseStatus(buf.buffer);
        expect(state.speed).toBe(1);
        expect(state.distance).toBe(0); // Should not have parsed partial distance
      });

      it('parses distance correctly when enough bytes present', () => {
        // Flags: TOTAL_DISTANCE (0x0004) set with all 3 bytes
        // Distance = 1000 meters = 1 km
        const buf = new Uint8Array([0x04, 0x00, 0x64, 0x00, 0xe8, 0x03, 0x00]); // 1000 in LE 24-bit
        const state = protocol.parseStatus(buf.buffer);
        expect(state.speed).toBe(1);
        expect(state.distance).toBe(1); // 1000m = 1km
      });

      it('handles multiple flags with truncation gracefully', () => {
        // Flags: INCLINATION (0x0008) + ELEVATION_GAIN (0x0010) set
        // But packet only has speed field
        const buf = new Uint8Array([0x18, 0x00, 0x64, 0x00]);
        const state = protocol.parseStatus(buf.buffer);
        expect(state.speed).toBe(1);
        // Other fields should be default, not corrupted
        expect(state.distance).toBe(0);
        expect(state.time).toBe(0);
        expect(state.steps).toBe(0);
      });

      it('parses elapsed time when flag set and bytes present', () => {
        // Flags: ELAPSED_TIME (1 << 10 = 0x0400) set with 2 bytes
        // Format: [flags_lo, flags_hi, speed_lo, speed_hi, time_lo, time_hi]
        const buf = new Uint8Array([0x00, 0x04, 0x64, 0x00, 0x3c, 0x00]); // flags=0x0400, speed=1.00, time=60
        const state = protocol.parseStatus(buf.buffer);
        expect(state.speed).toBe(1);
        expect(state.time).toBe(60);
      });
    });
  });

  describe('command builders', () => {
    it('cmdStart returns single byte 0x07', () => {
      const cmd = protocol.cmdStart();
      expect(cmd.length).toBe(1);
      expect(cmd[0]).toBe(0x07);
    });

    it('cmdStop returns two bytes 0x08 0x01', () => {
      const cmd = protocol.cmdStop();
      expect(cmd.length).toBe(2);
      expect(cmd[0]).toBe(0x08);
      expect(cmd[1]).toBe(0x01);
    });

    it('cmdAskStats returns empty array', () => {
      expect(protocol.cmdAskStats().length).toBe(0);
    });

    it('cmdSetSpeed returns 3 bytes: opcode 0x02 then uint16 LE', () => {
      const cmd = protocol.cmdSetSpeed(3.5);
      expect(cmd.length).toBe(3);
      expect(cmd[0]).toBe(0x02);
      const value = cmd[1]! | (cmd[2]! << 8);
      expect(value).toBe(350); // 3.5 * 100
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
      const cmdMin = protocol.cmdSetSpeed(FTMS_DEFAULT_MIN_SPEED_KMH);
      expect(cmdMin[1]! | (cmdMin[2]! << 8)).toBe(50); // 0.5 * 100

      const cmdMax = protocol.cmdSetSpeed(FTMS_DEFAULT_MAX_SPEED_KMH);
      expect(cmdMax[1]! | (cmdMax[2]! << 8)).toBe(600); // 6.0 * 100
    });

    it('cmdRequestControl returns single byte 0x00', () => {
      const cmd = protocol.cmdRequestControl();
      expect(cmd.length).toBe(1);
      expect(cmd[0]).toBe(0x00);
    });
  });
});
