// Standard protocol (A1, R1, P1)
export const STANDARD_PACKET_HEADER_1 = 0xf7;
export const STANDARD_PACKET_HEADER_2 = 0xa2;
export const STANDARD_PACKET_SUFFIX = 0xfd;
export const STANDARD_MIN_STATUS_LENGTH = 16;
export const STANDARD_OFFSET_STATE = 2;
export const STANDARD_OFFSET_SPEED = 3;
export const STANDARD_OFFSET_MODE = 4;
export const STANDARD_OFFSET_TIME = 5;
export const STANDARD_OFFSET_DISTANCE = 8;
export const STANDARD_OFFSET_STEPS = 11;
export const STANDARD_CMD_ASK_STATS_BODY = 0x00;
export const STANDARD_CMD_START_BODY: readonly number[] = [0x04, 0x01] as const;
export const STANDARD_CMD_STOP_BODY: readonly number[] = [0x04, 0x00] as const;
export const STANDARD_CMD_SET_SPEED_OP = 0x03;
export const STANDARD_DEFAULT_MIN_SPEED_KMH = 0.5;
export const STANDARD_DEFAULT_MAX_SPEED_KMH = 6.0;
/** Standard protocol encodes speed as value * 10 (e.g., 3.5 km/h = 35) */
export const STANDARD_SPEED_SCALE = 10;
/** Standard protocol encodes distance in units of 0.01 km (centimeters to km) */
export const STANDARD_DISTANCE_SCALE = 100;

// FTMS protocol (Z1, R2, C2)
export const FTMS_OP_REQUEST_CONTROL = 0x00;
export const FTMS_OP_SET_TARGET_SPEED = 0x02;
export const FTMS_OP_START_RESUME = 0x07;
export const FTMS_OP_STOP_PAUSE = 0x08;
export const FTMS_STOP_PARAM_STOP = 0x01;
export const FTMS_SPEED_SCALE = 100;
export const FTMS_METERS_PER_KM = 1000;
export const FTMS_DEFAULT_MIN_SPEED_KMH = 0.5;
export const FTMS_DEFAULT_MAX_SPEED_KMH = 6.0;
/** Minimum bytes required: 2 bytes flags */
export const FTMS_MIN_PACKET_LENGTH = 2;
/** Minimum bytes for speed: 2 bytes flags + 2 bytes speed */
export const FTMS_MIN_SPEED_LENGTH = 4;
export const FTMS_FLAG_AVERAGE_SPEED = 1 << 1;
export const FTMS_FLAG_TOTAL_DISTANCE = 1 << 2;
export const FTMS_FLAG_INCLINATION = 1 << 3;
export const FTMS_FLAG_ELEVATION_GAIN = 1 << 4;
export const FTMS_FLAG_INSTANTANEOUS_PACE = 1 << 5;
export const FTMS_FLAG_AVERAGE_PACE = 1 << 6;
export const FTMS_FLAG_EXPENDED_ENERGY = 1 << 7;
export const FTMS_FLAG_HEART_RATE = 1 << 8;
export const FTMS_FLAG_METABOLIC_EQUIVALENT = 1 << 9;
export const FTMS_FLAG_ELAPSED_TIME = 1 << 10;

// GATT UUIDs
export const GATT_FTMS_SERVICE = '1826';
export const GATT_FTMS_TREADMILL_DATA = '2acd';
export const GATT_FTMS_CONTROL_POINT = '2ad9';
export const GATT_STANDARD_SERVICE_FE00 = 'fe00';
export const GATT_STANDARD_SERVICE_FFF0 = 'fff0';
export const GATT_STANDARD_WRITE_FE01 = 'fe01';
export const GATT_STANDARD_WRITE_FFF2 = 'fff2';
export const GATT_STANDARD_NOTIFY_FE02 = 'fe02';
export const GATT_STANDARD_NOTIFY_FFF1 = 'fff1';
export const BLUETOOTH_UUID_BASE = '-0000-1000-8000-00805f9b34fb';

export function toFullUuid(shortId: number | string): string {
  const hex =
    typeof shortId === 'number' ? shortId.toString(16) : shortId.toLowerCase();
  return `0000${hex.padStart(4, '0')}${BLUETOOTH_UUID_BASE}`;
}

export const STORAGE_KEY = 'walkingpad-ble-device-id';

/**
 * Default device name prefixes for WalkingPad treadmills.
 * Used when filtering Bluetooth devices during discovery.
 */
export const DEFAULT_NAME_PREFIXES: readonly string[] = [
  'Walking',
  'KS',
] as const;

/**
 * Polling interval for standard protocol devices (A1, R1, P1).
 * 3 seconds balances responsiveness with BLE traffic overhead.
 * Lower values increase battery drain on the treadmill.
 * FTMS devices use notifications and don't need polling.
 */
export const MANAGER_POLL_INTERVAL_MS = 3000;

/**
 * Timeout for BLE write operations.
 * BLE writes can hang indefinitely if the device disconnects or becomes
 * unresponsive. 10 seconds is generous enough for slow devices while
 * preventing the app from hanging forever.
 */
export const BLE_WRITE_TIMEOUT_MS = 10000;

/**
 * Timeout for starting BLE notifications.
 * Some devices take a while to set up notifications, but if it takes
 * longer than 15 seconds something is wrong.
 */
export const BLE_NOTIFICATION_TIMEOUT_MS = 15000;

/**
 * Timeout for GATT connection.
 * Bluetooth connections can hang for 30+ seconds on some devices.
 * 20 seconds gives reasonable time for slow connections while
 * preventing indefinite hangs.
 */
export const BLE_CONNECTION_TIMEOUT_MS = 20000;
