import { STORAGE_KEY } from './constants';
import { getLogger } from './logger';

export interface DeviceStorage {
  get(): string | null;
  set(deviceId: string): void;
  remove(): void;
}

function createWebStorage(storage: Storage, name: string): DeviceStorage {
  return {
    get(): string | null {
      try {
        return storage.getItem(STORAGE_KEY);
      } catch (e) {
        getLogger().warn(
          `[WalkingPadBLE] Could not read device ID from ${name}:`,
          e instanceof Error ? e.message : String(e),
        );
        return null;
      }
    },

    set(deviceId: string): void {
      try {
        storage.setItem(STORAGE_KEY, deviceId);
      } catch (e) {
        getLogger().warn(
          `[WalkingPadBLE] Could not save device ID to ${name}:`,
          e instanceof Error ? e.message : String(e),
        );
      }
    },

    remove(): void {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch (e) {
        getLogger().warn(
          `[WalkingPadBLE] Could not clear device ID from ${name}:`,
          e instanceof Error ? e.message : String(e),
        );
      }
    },
  };
}

export function createLocalStorage(): DeviceStorage {
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage is not available in this environment');
  }
  return createWebStorage(localStorage, 'localStorage');
}

export function createSessionStorage(): DeviceStorage {
  if (typeof sessionStorage === 'undefined') {
    throw new Error('sessionStorage is not available in this environment');
  }
  return createWebStorage(sessionStorage, 'sessionStorage');
}

export function createMemoryStorage(): DeviceStorage {
  let storedDeviceId: string | null = null;

  return {
    get(): string | null {
      return storedDeviceId;
    },

    set(deviceId: string): void {
      storedDeviceId = deviceId;
    },

    remove(): void {
      storedDeviceId = null;
    },
  };
}

export function createNoOpStorage(): DeviceStorage {
  return {
    get(): string | null {
      return null;
    },

    set(): void {},

    remove(): void {},
  };
}

let defaultStorage: DeviceStorage | null = null;

export function getDefaultStorage(): DeviceStorage {
  if (!defaultStorage) {
    try {
      defaultStorage = createLocalStorage();
    } catch {
      defaultStorage = createNoOpStorage();
    }
  }
  return defaultStorage;
}

export function resetDefaultStorage(): void {
  defaultStorage = null;
}
