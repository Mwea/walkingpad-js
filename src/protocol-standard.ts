import { readByte, readUint24BE } from 'web-ble-kit';
import {
  STANDARD_CMD_ASK_STATS_BODY,
  STANDARD_CMD_SET_SPEED_OP,
  STANDARD_CMD_START_BODY,
  STANDARD_CMD_STOP_BODY,
  STANDARD_DEFAULT_MAX_SPEED_KMH,
  STANDARD_DEFAULT_MIN_SPEED_KMH,
  STANDARD_DISTANCE_SCALE,
  STANDARD_MIN_STATUS_LENGTH,
  STANDARD_OFFSET_DISTANCE,
  STANDARD_OFFSET_MODE,
  STANDARD_OFFSET_SPEED,
  STANDARD_OFFSET_STATE,
  STANDARD_OFFSET_STEPS,
  STANDARD_OFFSET_TIME,
  STANDARD_PACKET_HEADER_1,
  STANDARD_PACKET_HEADER_2,
  STANDARD_PACKET_SUFFIX,
  STANDARD_SPEED_SCALE,
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

const PACKET_PREFIX = new Uint8Array([
  STANDARD_PACKET_HEADER_1,
  STANDARD_PACKET_HEADER_2,
]);

export class StandardProtocol implements WalkingPadProtocol {
  readonly name: ProtocolName = 'standard';

  private createPacket(body: Uint8Array): Uint8Array {
    const msg = new Uint8Array(PACKET_PREFIX.length + body.length + 2);
    msg.set(PACKET_PREFIX, 0);
    msg.set(body, PACKET_PREFIX.length);
    let sum = 0;
    for (let i = 1; i < msg.length - 2; i++) {
      sum += msg[i]!;
    }
    msg[msg.length - 2] = sum & 0xff;
    msg[msg.length - 1] = STANDARD_PACKET_SUFFIX;
    return msg;
  }

  parseStatus(data: ArrayBuffer | DataView): WalkingPadState {
    const state = createDefaultState();
    const bytes =
      data instanceof DataView
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);

    if (bytes.length < STANDARD_MIN_STATUS_LENGTH) {
      return state;
    }

    const rawState = readByte(bytes, STANDARD_OFFSET_STATE);
    const rawSpeed = readByte(bytes, STANDARD_OFFSET_SPEED);
    const rawMode = readByte(bytes, STANDARD_OFFSET_MODE);

    state.state = clampDeviceState(rawState);
    state.speed = clampSpeed(rawSpeed / STANDARD_SPEED_SCALE);
    state.mode = clampDeviceMode(rawMode);
    state.time = clampTime(readUint24BE(bytes, STANDARD_OFFSET_TIME));
    state.distance = clampDistance(
      readUint24BE(bytes, STANDARD_OFFSET_DISTANCE) / STANDARD_DISTANCE_SCALE,
    );
    state.steps = clampSteps(readUint24BE(bytes, STANDARD_OFFSET_STEPS));
    state.isRunning = state.speed > 0 || state.state === 1;
    return state;
  }

  cmdStart(): Uint8Array {
    return this.createPacket(Uint8Array.from(STANDARD_CMD_START_BODY));
  }

  cmdStop(): Uint8Array {
    return this.createPacket(Uint8Array.from(STANDARD_CMD_STOP_BODY));
  }

  cmdAskStats(): Uint8Array {
    return this.createPacket(new Uint8Array([STANDARD_CMD_ASK_STATS_BODY]));
  }

  cmdSetSpeed(kmh: number): Uint8Array {
    if (
      !Number.isFinite(kmh) ||
      kmh < STANDARD_DEFAULT_MIN_SPEED_KMH ||
      kmh > STANDARD_DEFAULT_MAX_SPEED_KMH
    ) {
      throw new SpeedOutOfRangeError(
        kmh,
        STANDARD_DEFAULT_MIN_SPEED_KMH,
        STANDARD_DEFAULT_MAX_SPEED_KMH,
      );
    }
    const value = Math.round(kmh * STANDARD_SPEED_SCALE);
    return this.createPacket(
      new Uint8Array([STANDARD_CMD_SET_SPEED_OP, value]),
    );
  }

  cmdRequestControl(): Uint8Array {
    return new Uint8Array(0);
  }
}
