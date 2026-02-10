import {
  BLE_CONNECTION_TIMEOUT_MS,
  DEFAULT_NAME_PREFIXES,
  GATT_FTMS_SERVICE,
  GATT_STANDARD_SERVICE_FE00,
  GATT_STANDARD_SERVICE_FFF0,
  toFullUuid,
} from '../constants';
import { withTimeout } from '../errors';
import { getLogger } from '../logger';
import { type DeviceStorage, getDefaultStorage } from '../storage';
import type {
  BLEAdapter,
  BLEConnectedSession,
  BLEGATTCharacteristic,
  BLEGATTService,
  ConnectOptions,
} from '../types';

const OPTIONAL_SERVICES: BluetoothServiceUUID[] = [
  toFullUuid(GATT_FTMS_SERVICE),
  toFullUuid(GATT_STANDARD_SERVICE_FE00),
  toFullUuid(GATT_STANDARD_SERVICE_FFF0),
];

function getBluetooth(): Bluetooth {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    throw new Error('Web Bluetooth not available');
  }
  return navigator.bluetooth;
}

function adaptCharacteristic(
  char: BluetoothRemoteGATTCharacteristic,
): BLEGATTCharacteristic {
  return {
    uuid: char.uuid,
    properties: {
      notify: char.properties.notify,
      indicate: char.properties.indicate,
      write: char.properties.write,
      writeWithoutResponse: char.properties.writeWithoutResponse,
    },
    writeValueWithResponse: (value) =>
      char.writeValueWithResponse(value as BufferSource),
    startNotifications: () => char.startNotifications().then(() => {}),
    stopNotifications: () => char.stopNotifications().then(() => {}),
    addEventListener: (type, listener) => char.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      char.removeEventListener(type, listener),
    get value() {
      return char.value;
    },
  };
}

function adaptService(service: BluetoothRemoteGATTService): BLEGATTService {
  return {
    uuid: service.uuid,
    getCharacteristics: async () => {
      const chars = await service.getCharacteristics();
      return chars.map(adaptCharacteristic);
    },
  };
}

function createSession(server: BluetoothRemoteGATTServer): BLEConnectedSession {
  const device = server.device;

  return {
    async getPrimaryServices(): Promise<BLEGATTService[]> {
      const services = await server.getPrimaryServices();
      return services.map(adaptService);
    },
    async disconnect(): Promise<void> {
      try {
        server.disconnect();
      } catch (e) {
        getLogger().warn(
          '[WalkingPadBLE] Error during GATT disconnect:',
          e instanceof Error ? e.message : String(e),
        );
      }
    },
    onDisconnect(callback: () => void): () => void {
      const handler = () => {
        callback();
      };
      device.addEventListener('gattserverdisconnected', handler);
      return () => {
        device.removeEventListener('gattserverdisconnected', handler);
      };
    },
  };
}

function isWalkingPadName(
  name: string | undefined,
  prefixes: readonly string[],
): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  return prefixes.some((prefix) => trimmed.startsWith(prefix));
}

export interface WebBluetoothAdapterOptions {
  /**
   * Storage implementation for persisting device IDs.
   * Defaults to localStorage with graceful fallback.
   *
   * @example Disable persistence
   * ```typescript
   * import { createWebBluetoothAdapter, createNoOpStorage } from 'walkingpad-ble';
   * const adapter = createWebBluetoothAdapter({ storage: createNoOpStorage() });
   * ```
   *
   * @example Use sessionStorage
   * ```typescript
   * import { createWebBluetoothAdapter, createSessionStorage } from 'walkingpad-ble';
   * const adapter = createWebBluetoothAdapter({ storage: createSessionStorage() });
   * ```
   */
  storage?: DeviceStorage;

  /**
   * Timeout for GATT connection in milliseconds.
   * Bluetooth connections can hang for 30+ seconds on some devices.
   * @default 20000 (20 seconds)
   */
  connectionTimeoutMs?: number;

  /**
   * Device name prefixes to match during reconnection.
   * Used to identify WalkingPad devices when no remembered device ID is available.
   * @default ['Walking', 'KS']
   */
  namePrefixes?: readonly string[];
}

function buildRequestOptions(
  options: ConnectOptions,
  namePrefixes: readonly string[],
): RequestDeviceOptions {
  const optionalServices: BluetoothServiceUUID[] = (
    options.optionalServices ?? OPTIONAL_SERVICES
  ).map((u) => (typeof u === 'number' ? toFullUuid(u) : String(u)));

  const filters: BluetoothLEScanFilter[] | undefined = options.filters?.length
    ? options.filters
        .map((f) => {
          const filter: BluetoothLEScanFilter = {};
          if (f.namePrefix != null)
            (filter as { namePrefix?: string }).namePrefix = f.namePrefix;
          if (f.name != null) (filter as { name?: string }).name = f.name;
          if (f.services != null)
            (filter as { services?: BluetoothServiceUUID[] }).services =
              f.services;
          return filter;
        })
        .filter((f) => Object.keys(f).length > 0)
    : undefined;

  const effectiveFilters: BluetoothLEScanFilter[] = filters?.length
    ? filters
    : namePrefixes.map((prefix) => ({ namePrefix: prefix }));

  return {
    filters: effectiveFilters,
    optionalServices,
  };
}

/**
 * Creates a Web Bluetooth adapter that implements the BLEAdapter interface.
 * This adapter uses the native Web Bluetooth API available in modern browsers.
 *
 * @param options - Adapter configuration options
 * @returns A BLEAdapter for use with createManager
 *
 * @example Default usage (localStorage persistence)
 * ```typescript
 * const adapter = createWebBluetoothAdapter();
 * ```
 *
 * @example Disable device persistence
 * ```typescript
 * import { createNoOpStorage } from 'walkingpad-ble';
 * const adapter = createWebBluetoothAdapter({ storage: createNoOpStorage() });
 * ```
 *
 * @example Custom storage
 * ```typescript
 * const adapter = createWebBluetoothAdapter({
 *   storage: {
 *     get: () => myStore.getDeviceId(),
 *     set: (id) => myStore.setDeviceId(id),
 *     remove: () => myStore.clearDeviceId(),
 *   }
 * });
 * ```
 */
export function createWebBluetoothAdapter(
  options: WebBluetoothAdapterOptions = {},
): BLEAdapter {
  const storage = options.storage ?? getDefaultStorage();
  const connectionTimeoutMs =
    options.connectionTimeoutMs ?? BLE_CONNECTION_TIMEOUT_MS;
  const namePrefixes = options.namePrefixes ?? DEFAULT_NAME_PREFIXES;

  return {
    async connect(
      connectOptions: ConnectOptions = {},
    ): Promise<BLEConnectedSession> {
      const bluetooth = getBluetooth();
      const requestOptions = buildRequestOptions(connectOptions, namePrefixes);

      const device: BluetoothDevice =
        await bluetooth.requestDevice(requestOptions);

      if (!device.gatt) {
        throw new Error('No GATT server');
      }

      if (device.id && device.id.length > 0 && connectOptions.rememberDevice) {
        storage.set(device.id);
      }

      const server: BluetoothRemoteGATTServer = await withTimeout(
        device.gatt.connect(),
        connectionTimeoutMs,
        'GATT connection',
      );

      return createSession(server);
    },

    async reconnect(): Promise<BLEConnectedSession | null> {
      const bluetooth = getBluetooth();

      if (typeof bluetooth.getDevices !== 'function') {
        return null;
      }

      const devices: BluetoothDevice[] = await bluetooth.getDevices();
      const rememberedId = storage.get();

      const preferredDevice = rememberedId
        ? devices.find((d) => d.id === rememberedId)
        : undefined;
      const targetDevice =
        preferredDevice ??
        devices.find((d) => isWalkingPadName(d.name, namePrefixes));

      if (!targetDevice?.gatt) {
        return null;
      }

      try {
        const server: BluetoothRemoteGATTServer = await withTimeout(
          targetDevice.gatt.connect(),
          connectionTimeoutMs,
          'GATT reconnection',
        );
        return createSession(server);
      } catch (e) {
        getLogger().warn(
          '[WalkingPadBLE] Reconnect failed:',
          e instanceof Error ? e.message : String(e),
        );
        return null;
      }
    },

    forgetDevice(): void {
      storage.remove();
    },
  };
}
