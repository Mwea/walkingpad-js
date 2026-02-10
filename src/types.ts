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
 * Connection lifecycle state.
 * - 'disconnected': No active connection
 * - 'connecting': Connection in progress
 * - 'connected': Successfully connected to device
 * - 'error': Connection failed (can retry via connect/reconnect)
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/**
 * Filter options for Bluetooth device discovery.
 */
export interface RequestDeviceFilter {
  /** Match devices whose name starts with this prefix */
  namePrefix?: string;
  /** Match devices with this exact name */
  name?: string;
  /** Match devices advertising these service UUIDs */
  services?: (number | string)[];
}

/**
 * Options for connecting to a WalkingPad device.
 */
export interface ConnectOptions {
  /**
   * Bluetooth device filters. If empty, defaults to known WalkingPad name prefixes.
   */
  filters?: RequestDeviceFilter[];
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
 * Represents an established BLE connection session.
 * Provides access to GATT services and connection lifecycle management.
 *
 * @remarks
 * Implementers should ensure that:
 * - `getPrimaryServices()` returns all available GATT services
 * - `disconnect()` cleanly terminates the connection
 * - `onDisconnect()` fires when the device disconnects unexpectedly
 *
 * @example Custom adapter implementation
 * ```typescript
 * const session: BLEConnectedSession = {
 *   async getPrimaryServices() {
 *     return myDevice.getServices();
 *   },
 *   async disconnect() {
 *     await myDevice.disconnect();
 *   },
 *   onDisconnect(callback) {
 *     myDevice.on('disconnect', callback);
 *     return () => myDevice.off('disconnect', callback);
 *   }
 * };
 * ```
 */
export interface BLEConnectedSession {
  /**
   * Retrieves all primary GATT services from the connected device.
   * @returns Promise resolving to an array of GATT services
   */
  getPrimaryServices(): Promise<BLEGATTService[]>;

  /**
   * Disconnects from the BLE device.
   * Should be idempotent - safe to call multiple times.
   */
  disconnect(): Promise<void>;

  /**
   * Registers a callback for unexpected disconnection events.
   * Called when the device disconnects unexpectedly (out of range, powered off, etc.).
   * @param callback - Function to call when disconnection occurs
   * @returns A function to unregister the callback
   */
  onDisconnect?(callback: () => void): () => void;
}

/**
 * Represents a BLE GATT service.
 * A service is a collection of characteristics that define a feature or behavior.
 */
export interface BLEGATTService {
  /** The UUID of this service (e.g., '1826' for FTMS) */
  uuid: string;

  /**
   * Retrieves all characteristics belonging to this service.
   * @returns Promise resolving to an array of characteristics
   */
  getCharacteristics(): Promise<BLEGATTCharacteristic[]>;
}

/**
 * Represents a BLE GATT characteristic.
 * Characteristics are the primary way to read/write data to BLE devices.
 */
export interface BLEGATTCharacteristic {
  /** The UUID of this characteristic */
  uuid: string;

  /** Properties indicating what operations this characteristic supports */
  properties: {
    /** Characteristic supports notifications (passive value updates) */
    notify?: boolean;
    /** Characteristic supports indications (acknowledged notifications) */
    indicate?: boolean;
    /** Characteristic supports write with response */
    write?: boolean;
    /** Characteristic supports write without response (faster, no ACK) */
    writeWithoutResponse?: boolean;
  };

  /**
   * Writes a value to the characteristic and waits for acknowledgment.
   * @param value - The data to write
   * @throws Error if the write fails or times out
   */
  writeValueWithResponse(
    value: ArrayBuffer | Uint8Array | DataView,
  ): Promise<void>;

  /**
   * Enables notifications for this characteristic.
   * After calling this, 'characteristicvaluechanged' events will fire when the device sends data.
   */
  startNotifications(): Promise<void>;

  /**
   * Disables notifications for this characteristic.
   */
  stopNotifications(): Promise<void>;

  /**
   * Adds an event listener for characteristic events.
   * @param type - Event type (typically 'characteristicvaluechanged')
   * @param listener - The event handler
   */
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void;

  /**
   * Removes an event listener.
   * @param type - Event type
   * @param listener - The event handler to remove
   */
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void;

  /**
   * The last value received from this characteristic.
   * Updated when notifications fire or after a read operation.
   *
   * @remarks
   * Returns `undefined` (not `null`) to match the Web Bluetooth API behavior.
   * This is intentional and distinct from `null` which is used elsewhere
   * in this library to indicate "intentionally empty".
   */
  get value(): DataView | undefined;
}

/**
 * Adapter interface for BLE connectivity.
 * Implement this interface to provide custom Bluetooth backends
 * (e.g., Web Bluetooth, Node.js BLE libraries, React Native BLE).
 *
 * @remarks
 * The default implementation uses Web Bluetooth API via `createWebBluetoothAdapter()`.
 * Custom adapters must implement `connect()` and optionally `reconnect()` and `forgetDevice()`.
 *
 * @example Custom adapter
 * ```typescript
 * const myAdapter: BLEAdapter = {
 *   async connect(options) {
 *     const device = await myBleLibrary.scan(options.filters);
 *     await device.connect();
 *     return createSessionFromDevice(device);
 *   },
 *   async reconnect() {
 *     const cached = await myBleLibrary.getCachedDevice();
 *     if (!cached) return null;
 *     await cached.connect();
 *     return createSessionFromDevice(cached);
 *   }
 * };
 * ```
 */
export interface BLEAdapter {
  /**
   * Initiates a new connection to a BLE device.
   * Typically shows a device picker dialog to the user.
   *
   * @param options - Connection options including device filters
   * @returns Promise resolving to a connected session
   * @throws Error if connection fails or is cancelled
   */
  connect(options: ConnectOptions): Promise<BLEConnectedSession>;

  /**
   * Attempts to reconnect to a previously paired device.
   * Uses cached device information to connect without user interaction.
   *
   * @returns Promise resolving to a connected session, or null if no device found
   * @throws Error if reconnection fails (device found but connection failed)
   */
  reconnect?(): Promise<BLEConnectedSession | null>;

  /**
   * Clears the remembered device ID from storage.
   * Only available on adapters that support device persistence.
   */
  forgetDevice?(): void;
}

/**
 * Internal session object containing discovered GATT characteristics.
 * Created by the transport layer after successful service discovery.
 */
export interface TransportSession {
  /** UUIDs of all discovered GATT services */
  serviceUuids: string[];

  /** Characteristic used for writing commands to the device */
  writeChar: BLEGATTCharacteristic;

  /** Characteristic used for receiving notifications from the device */
  notifyChar: BLEGATTCharacteristic;

  /** FTMS control point characteristic (null for standard protocol) */
  controlPointChar: BLEGATTCharacteristic | null;

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
