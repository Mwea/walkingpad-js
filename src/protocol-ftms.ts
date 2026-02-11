import { readUint16LE, readUint24LE } from 'web-ble-kit';
import {
  FTMS_DEFAULT_MAX_SPEED_KMH,
  FTMS_DEFAULT_MIN_SPEED_KMH,
  FTMS_FLAG_AVERAGE_PACE,
  FTMS_FLAG_AVERAGE_SPEED,
  FTMS_FLAG_ELAPSED_TIME,
  FTMS_FLAG_ELEVATION_GAIN,
  FTMS_FLAG_EXPENDED_ENERGY,
  FTMS_FLAG_HEART_RATE,
  FTMS_FLAG_INCLINATION,
  FTMS_FLAG_INSTANTANEOUS_PACE,
  FTMS_FLAG_METABOLIC_EQUIVALENT,
  FTMS_FLAG_TOTAL_DISTANCE,
  FTMS_METERS_PER_KM,
  FTMS_MIN_PACKET_LENGTH,
  FTMS_MIN_SPEED_LENGTH,
  FTMS_OP_REQUEST_CONTROL,
  FTMS_OP_SET_TARGET_SPEED,
  FTMS_OP_START_RESUME,
  FTMS_OP_STOP_PAUSE,
  FTMS_SPEED_SCALE,
  FTMS_STOP_PARAM_STOP,
} from './constants';
import { SpeedOutOfRangeError } from './errors';
import type { WalkingPadProtocol } from './types';
import {
  clampDeviceMode,
  clampDeviceState,
  clampDistance,
  clampSpeed,
  clampSteps,
  clampTime,
  createDefaultState,
  type ProtocolName,
  type WalkingPadState,
} from './types';

export class FTMSProtocol implements WalkingPadProtocol {
  readonly name: ProtocolName = 'ftms';

  parseStatus(data: ArrayBuffer | DataView): WalkingPadState {
    const state = createDefaultState();
    const bytes =
      data instanceof DataView
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);

    if (bytes.length < FTMS_MIN_PACKET_LENGTH) {
      return state;
    }

    const flags = readUint16LE(bytes, 0);
    let offset = FTMS_MIN_PACKET_LENGTH;

    // Speed is always present after flags (2 bytes, little-endian, in 0.01 km/h units)
    if (bytes.length >= FTMS_MIN_SPEED_LENGTH) {
      state.speed = clampSpeed(readUint16LE(bytes, offset) / FTMS_SPEED_SCALE);
      offset += 2;
    }

    // Skip optional fields based on flags
    // If a flag is set but bytes are missing, return early with partial state
    // to avoid corrupting subsequent field parsing
    if (flags & FTMS_FLAG_AVERAGE_SPEED) {
      if (bytes.length < offset + 2) return state;
      offset += 2;
    }
    if (flags & FTMS_FLAG_TOTAL_DISTANCE) {
      if (bytes.length < offset + 3) return state;
      const dist = readUint24LE(bytes, offset);
      state.distance = clampDistance(dist / FTMS_METERS_PER_KM);
      offset += 3;
    }
    if (flags & FTMS_FLAG_INCLINATION) {
      if (bytes.length < offset + 4) return state;
      offset += 4;
    }
    if (flags & FTMS_FLAG_ELEVATION_GAIN) {
      if (bytes.length < offset + 2) return state;
      offset += 2;
    }
    if (flags & FTMS_FLAG_INSTANTANEOUS_PACE) {
      if (bytes.length < offset + 1) return state;
      offset += 1;
    }
    if (flags & FTMS_FLAG_AVERAGE_PACE) {
      if (bytes.length < offset + 1) return state;
      offset += 1;
    }
    if (flags & FTMS_FLAG_EXPENDED_ENERGY) {
      if (bytes.length < offset + 5) return state;
      offset += 5;
    }
    if (flags & FTMS_FLAG_HEART_RATE) {
      if (bytes.length < offset + 1) return state;
      offset += 1;
    }
    if (flags & FTMS_FLAG_METABOLIC_EQUIVALENT) {
      if (bytes.length < offset + 1) return state;
      offset += 1;
    }
    if (flags & FTMS_FLAG_ELAPSED_TIME) {
      if (bytes.length < offset + 2) return state;
      state.time = clampTime(readUint16LE(bytes, offset));
      offset += 2;
    }

    // Derive state from speed using type-safe helpers
    state.state = clampDeviceState(state.speed > 0 ? 1 : 0);
    state.isRunning = state.speed > 0;
    // FTMS doesn't provide mode, default to manual (1) when running
    state.mode = clampDeviceMode(state.speed > 0 ? 1 : 0);

    // Steps field (non-standard WalkingPad extension at end of packet)
    if (bytes.length >= offset + 2) {
      state.steps = clampSteps(readUint16LE(bytes, offset));
    }

    return state;
  }

  cmdStart(): Uint8Array {
    return new Uint8Array([FTMS_OP_START_RESUME]);
  }

  cmdStop(): Uint8Array {
    return new Uint8Array([FTMS_OP_STOP_PAUSE, FTMS_STOP_PARAM_STOP]);
  }

  cmdAskStats(): Uint8Array {
    // FTMS uses notifications, no polling needed
    return new Uint8Array(0);
  }

  cmdSetSpeed(kmh: number): Uint8Array {
    if (
      !Number.isFinite(kmh) ||
      kmh < FTMS_DEFAULT_MIN_SPEED_KMH ||
      kmh > FTMS_DEFAULT_MAX_SPEED_KMH
    ) {
      throw new SpeedOutOfRangeError(
        kmh,
        FTMS_DEFAULT_MIN_SPEED_KMH,
        FTMS_DEFAULT_MAX_SPEED_KMH,
      );
    }
    const value = Math.round(kmh * FTMS_SPEED_SCALE);
    const buf = new ArrayBuffer(3);
    const view = new DataView(buf);
    view.setUint8(0, FTMS_OP_SET_TARGET_SPEED);
    view.setUint16(1, value, true);
    return new Uint8Array(buf);
  }

  cmdRequestControl(): Uint8Array {
    return new Uint8Array([FTMS_OP_REQUEST_CONTROL]);
  }
}
