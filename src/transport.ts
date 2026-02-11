import {
  type StartNotificationsOptions as BleStartNotificationsOptions,
  startNotifications as bleStartNotifications,
  uuidMatches,
  writeWithTimeout as bleWriteWithTimeout,
} from 'web-ble-kit';
import {
  BLE_NOTIFICATION_TIMEOUT_MS,
  BLE_WRITE_TIMEOUT_MS,
  GATT_FTMS_CONTROL_POINT,
  GATT_FTMS_SERVICE,
  GATT_FTMS_TREADMILL_DATA,
  GATT_STANDARD_NOTIFY_FE02,
  GATT_STANDARD_NOTIFY_FFF1,
  GATT_STANDARD_SERVICE_FE00,
  GATT_STANDARD_SERVICE_FFF0,
  GATT_STANDARD_WRITE_FE01,
  GATT_STANDARD_WRITE_FFF2,
} from './constants';
import type { Logger } from './logger';
import type {
  BLEConnectedSession,
  BLEGATTCharacteristic,
  BLEGATTService,
  TransportSession,
} from './types';

export async function discoverWalkingPad(
  session: BLEConnectedSession,
): Promise<TransportSession> {
  const services = await session.getPrimaryServices();
  const serviceUuids = services.map((s: BLEGATTService) => s.uuid);
  let writeChar: BLEGATTCharacteristic | null = null;
  let notifyChar: BLEGATTCharacteristic | null = null;
  let controlPointChar: BLEGATTCharacteristic | null = null;

  for (const service of services) {
    const uuid = service.uuid.toLowerCase();
    const chars = await service.getCharacteristics();

    if (uuidMatches(uuid, GATT_FTMS_SERVICE)) {
      for (const c of chars) {
        const cu = c.uuid.toLowerCase();
        if (uuidMatches(cu, GATT_FTMS_TREADMILL_DATA) && c.properties.notify) {
          notifyChar = c;
        }
        if (uuidMatches(cu, GATT_FTMS_CONTROL_POINT)) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            writeChar = c;
          }
          if (c.properties.indicate) {
            controlPointChar = c;
          }
        }
      }
    }

    if (
      (uuidMatches(uuid, GATT_STANDARD_SERVICE_FE00) ||
        uuidMatches(uuid, GATT_STANDARD_SERVICE_FFF0)) &&
      (!writeChar || !notifyChar)
    ) {
      for (const c of chars) {
        const cu = c.uuid.toLowerCase();
        if (
          (uuidMatches(cu, GATT_STANDARD_WRITE_FE01) ||
            uuidMatches(cu, GATT_STANDARD_WRITE_FFF2)) &&
          (c.properties.write || c.properties.writeWithoutResponse)
        ) {
          writeChar = c;
        }
        if (
          (uuidMatches(cu, GATT_STANDARD_NOTIFY_FE02) ||
            uuidMatches(cu, GATT_STANDARD_NOTIFY_FFF1)) &&
          c.properties.notify
        ) {
          notifyChar = c;
        }
      }
    }
  }

  if (!writeChar || !notifyChar) {
    await session.disconnect();
    throw new Error(
      'Could not find required write and notify characteristics on device',
    );
  }

  return {
    serviceUuids,
    writeChar,
    notifyChar,
    controlPointChar,
    disconnect: () => session.disconnect(),
  };
}

/**
 * Writes data to a characteristic with a timeout.
 * BLE writes can hang indefinitely, so all user-facing write operations
 * should use this to prevent the app from becoming unresponsive.
 * @throws Error if data is empty
 */
export async function writeWithTimeout(
  char: BLEGATTCharacteristic,
  data: ArrayBuffer | Uint8Array | DataView,
  timeoutMs: number = BLE_WRITE_TIMEOUT_MS,
): Promise<void> {
  await bleWriteWithTimeout(char, data, { timeoutMs });
}

/**
 * Writes data to the write characteristic.
 * Used for standard protocol commands and polling.
 * Includes timeout to prevent hanging on unresponsive devices.
 */
export async function write(
  session: TransportSession,
  data: ArrayBuffer | Uint8Array | DataView,
  timeoutMs: number = BLE_WRITE_TIMEOUT_MS,
): Promise<void> {
  await writeWithTimeout(session.writeChar, data, timeoutMs);
}

/**
 * Writes data to the control point characteristic.
 * For FTMS protocol, control commands (request control, start, stop, set speed)
 * must be sent to the control point, not the regular write characteristic.
 * Falls back to writeChar if no controlPointChar is available.
 * Includes timeout to prevent hanging on unresponsive devices.
 */
export async function writeToControlPoint(
  session: TransportSession,
  data: ArrayBuffer | Uint8Array | DataView,
  timeoutMs: number = BLE_WRITE_TIMEOUT_MS,
): Promise<void> {
  const char = session.controlPointChar ?? session.writeChar;
  await writeWithTimeout(char, data, timeoutMs);
}

/**
 * Options for starting notifications.
 */
export interface StartNotificationsOptions {
  /** Timeout for starting notifications in milliseconds */
  timeoutMs?: number;
  /** Logger for error reporting. Falls back to global logger if not provided. */
  logger?: Logger;
}

/**
 * Starts notifications on a characteristic with timeout protection.
 * Returns a cleanup function to stop notifications and remove listeners.
 *
 * @param char - The characteristic to start notifications on
 * @param onData - Callback invoked when data is received
 * @param options - Options including timeout and logger
 * @throws TimeoutError if notification setup takes too long
 */
export async function startNotifications(
  char: BLEGATTCharacteristic,
  onData: (data: ArrayBuffer) => void,
  options: StartNotificationsOptions | number = {},
): Promise<() => void> {
  // Support legacy signature: startNotifications(char, onData, timeoutMs)
  const opts = typeof options === 'number' ? { timeoutMs: options } : options;
  const timeoutMs = opts.timeoutMs ?? BLE_NOTIFICATION_TIMEOUT_MS;

  const bleOptions: BleStartNotificationsOptions = {
    timeoutMs,
    logPrefix: '[WalkingPadBLE]',
  };

  return bleStartNotifications(char, onData, bleOptions);
}
