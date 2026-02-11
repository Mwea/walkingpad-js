/**
 * Re-export common types from web-ble-kit for convenience.
 */
export type {
  BLEAdapter,
  BLEConnectedSession,
  BLEConnectOptions,
  BLEGATTCharacteristic,
  BLEGATTService,
  ConnectionState,
  DeviceStorage,
  RequestDeviceFilter,
} from 'web-ble-kit';

import type {
  BLEGATTCharacteristic as BLEGATTCharacteristicType,
  RequestDeviceFilter as RequestDeviceFilterType,
} from 'web-ble-kit';

declare const DeviceStateBrand: unique symbol;
declare const DeviceModeBrand: unique symbol;

/**
 * Device operational state (branded type for type safety)
 * 0 = idle/standby
 * 1 = running/active
 * 2 = starting (transitional)
 * 3 = paused
 */
export type DeviceState = (0 | 1 | 2 | 3) & {
  readonly [DeviceStateBrand]: never;
};

/**
 * Device control mode (branded type for type safety)
 * 0 = standby
 * 1 = manual (user controls speed)
 * 2 = auto (speed adjusts based on position on belt)
 */
export type DeviceMode = (0 | 1 | 2) & { readonly [DeviceModeBrand]: never };

export function createDeviceState(n: 0 | 1 | 2 | 3): DeviceState {
  return n as DeviceState;
}

export function createDeviceMode(n: 0 | 1 | 2): DeviceMode {
  return n as DeviceMode;
}

/**
 * Clamps a number to a valid DeviceState (0-3).
 * Handles floats by flooring and out-of-range values by clamping.
 * Returns 0 for non-finite values (NaN, Infinity, -Infinity).
 */
export function clampDeviceState(n: number): DeviceState {
  if (!Number.isFinite(n)) return createDeviceState(0);
  const clamped = Math.min(Math.max(0, Math.floor(n)), 3) as 0 | 1 | 2 | 3;
  return createDeviceState(clamped);
}

/**
 * Clamps a number to a valid DeviceMode (0-2).
 * Handles floats by flooring and out-of-range values by clamping.
 * Returns 0 for non-finite values (NaN, Infinity, -Infinity).
 */
export function clampDeviceMode(n: number): DeviceMode {
  if (!Number.isFinite(n)) return createDeviceMode(0);
  const clamped = Math.min(Math.max(0, Math.floor(n)), 2) as 0 | 1 | 2;
  return createDeviceMode(clamped);
}

/**
 * Current state of the WalkingPad treadmill.
 * Received periodically via notifications (FTMS) or polling (standard protocol).
 */
export interface WalkingPadState {
  /** Device operational state (0=idle, 1=running, 2=starting, 3=paused) */
  state: DeviceState;
  /** Current speed in km/h */
  speed: number;
  /** Elapsed time in seconds */
  time: number;
  /** Distance traveled in km */
  distance: number;
  /** Step count */
  steps: number;
  /** Control mode (0=standby, 1=manual, 2=auto) */
  mode: DeviceMode;
  /** Whether the belt is currently moving */
  isRunning: boolean;
}

/**
 * Options for connecting to a WalkingPad device.
 */
export interface ConnectOptions {
  /**
   * Bluetooth device filters. If empty, defaults to known WalkingPad name prefixes.
   */
  filters?: RequestDeviceFilterType[];
  /**
   * Optional service UUIDs to request access to.
   * Defaults to FTMS and standard WalkingPad services.
   */
  optionalServices?: (number | string)[];
  /**
   * If true, stores device ID in localStorage for faster reconnection.
   * @default false
   */
  rememberDevice?: boolean;
  /**
   * Polling interval in milliseconds for standard protocol devices.
   * FTMS devices use notifications and ignore this setting.
   * @default 3000
   */
  pollIntervalMs?: number;
  /**
   * AbortSignal to cancel the connection attempt.
   * When aborted, the connection transitions to 'disconnected' state.
   */
  signal?: AbortSignal;
}

/**
 * Options for reconnecting to a previously paired device.
 */
export interface ReconnectOptions {
  /**
   * AbortSignal to cancel the reconnection attempt.
   * When aborted, the reconnection transitions to 'disconnected' state.
   */
  signal?: AbortSignal;
}

/**
 * Internal session object containing discovered GATT characteristics.
 * Created by the transport layer after successful service discovery.
 */
export interface TransportSession {
  /** UUIDs of all discovered GATT services */
  serviceUuids: string[];

  /** Characteristic used for writing commands to the device */
  writeChar: BLEGATTCharacteristicType;

  /** Characteristic used for receiving notifications from the device */
  notifyChar: BLEGATTCharacteristicType;

  /** FTMS control point characteristic (null for standard protocol) */
  controlPointChar: BLEGATTCharacteristicType | null;

  /** Disconnects from the device */
  disconnect(): Promise<void>;
}

/**
 * Protocol type identifier.
 * - 'standard': Legacy protocol for A1, R1, P1 models (polling-based)
 * - 'ftms': FTMS protocol for Z1, R2, C2 models (notification-based)
 */
export type ProtocolName = 'standard' | 'ftms';

/**
 * Protocol implementation interface.
 * Each protocol handles command encoding and response parsing for specific device models.
 *
 * @remarks
 * Implementers must handle:
 * - Command encoding (start, stop, set speed, request control)
 * - Status packet parsing (speed, distance, time, steps)
 * - Protocol-specific byte ordering and scaling factors
 */
export interface WalkingPadProtocol {
  /** The protocol identifier */
  readonly name: ProtocolName;

  /**
   * Parses a status packet from the device.
   * @param data - Raw bytes from the device notification
   * @returns Parsed treadmill state
   */
  parseStatus(data: ArrayBuffer | DataView): WalkingPadState;

  /**
   * Creates a command to start the treadmill belt.
   * @returns Encoded command bytes
   */
  cmdStart(): Uint8Array;

  /**
   * Creates a command to stop the treadmill belt.
   * @returns Encoded command bytes
   */
  cmdStop(): Uint8Array;

  /**
   * Creates a command to request current device status.
   * Only used by standard protocol (FTMS uses notifications).
   * @returns Encoded command bytes, or empty array if not supported
   */
  cmdAskStats(): Uint8Array;

  /**
   * Creates a command to set the target speed.
   * @param kmh - Target speed in km/h (typically 0.5-6.0)
   * @returns Encoded command bytes
   * @throws SpeedOutOfRangeError if speed is outside valid range
   */
  cmdSetSpeed(kmh: number): Uint8Array;

  /**
   * Creates a command to request control of the device.
   * Required by FTMS protocol before sending other commands.
   * @returns Encoded command bytes, or empty array if not required
   */
  cmdRequestControl(): Uint8Array;
}

export function createDefaultState(): WalkingPadState {
  return {
    state: createDeviceState(0),
    speed: 0,
    time: 0,
    distance: 0,
    steps: 0,
    mode: createDeviceMode(0),
    isRunning: false,
  };
}

// Maximum reasonable values for state fields
const MAX_SPEED_KMH = 25; // Reasonable max for walking/running treadmill
const MAX_TIME_SECONDS = 86400; // 24 hours
const MAX_DISTANCE_KM = 100; // Reasonable max for a session
const MAX_STEPS = 200000; // Reasonable max for a session

/**
 * Clamps a speed value to a valid range [0, MAX_SPEED_KMH].
 * Returns 0 for non-finite values.
 */
export function clampSpeed(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, MAX_SPEED_KMH));
}

/**
 * Clamps a time value to a valid range [0, MAX_TIME_SECONDS].
 * Returns 0 for non-finite values.
 */
export function clampTime(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.floor(value), MAX_TIME_SECONDS));
}

/**
 * Clamps a distance value to a valid range [0, MAX_DISTANCE_KM].
 * Returns 0 for non-finite values.
 */
export function clampDistance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, MAX_DISTANCE_KM));
}

/**
 * Clamps a steps value to a valid range [0, MAX_STEPS].
 * Returns 0 for non-finite values.
 */
export function clampSteps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.floor(value), MAX_STEPS));
}
