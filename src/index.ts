/**
 * WalkingPad BLE - TypeScript library for controlling WalkingPad treadmills over Web Bluetooth.
 *
 * @packageDocumentation
 *
 * @example Quick Start
 * ```typescript
 * import { getWalkingPadBLE } from 'walkingpad-ble';
 *
 * const manager = getWalkingPadBLE();
 * await manager.connect();
 *
 * manager.events.on('state', (state) => {
 *   console.log(`Speed: ${state.speed} km/h`);
 * });
 *
 * await manager.start();
 * await manager.setSpeed(3.5);
 * ```
 *
 * @example Custom Adapter
 * ```typescript
 * import { createManager, createWalkingPadAdapter } from 'walkingpad-ble';
 *
 * const adapter = createWalkingPadAdapter({ connectionTimeoutMs: 30000 });
 * const manager = createManager(adapter);
 * await manager.connect();
 * ```
 */

import {
  createWebBluetoothAdapter,
  type WebBluetoothAdapterOptions,
} from 'web-ble-kit';
import {
  DEFAULT_NAME_PREFIXES,
  GATT_FTMS_SERVICE,
  GATT_STANDARD_SERVICE_FE00,
  GATT_STANDARD_SERVICE_FFF0,
  toFullUuid,
} from './constants';
import { resetLogger } from './logger';
import { createManager, type WalkingPadBLEManager } from './manager';

// Lazy singleton - only created when first accessed
// This avoids throwing in environments without Web Bluetooth (Node.js, SSR)
let defaultInstance: WalkingPadBLEManager | null = null;

/**
 * Creates a pre-configured Bluetooth adapter for WalkingPad devices.
 *
 * @param options - Optional adapter configuration (timeouts, storage, etc.)
 * @returns A configured BLE adapter for WalkingPad devices
 */
export function createWalkingPadAdapter(
  options: WebBluetoothAdapterOptions = {},
) {
  return createWebBluetoothAdapter({
    namePrefixes: DEFAULT_NAME_PREFIXES,
    optionalServices: [
      toFullUuid(GATT_FTMS_SERVICE),
      toFullUuid(GATT_STANDARD_SERVICE_FE00),
      toFullUuid(GATT_STANDARD_SERVICE_FFF0),
    ],
    ...options,
  });
}

/**
 * Gets the default WalkingPadBLE singleton instance.
 * Creates the instance lazily on first access using the Web Bluetooth adapter.
 *
 * @returns The default manager instance
 * @throws Error if Web Bluetooth is not available
 *
 * @example
 * ```typescript
 * const manager = getWalkingPadBLE();
 * await manager.connect();
 * ```
 */
export function getWalkingPadBLE(): WalkingPadBLEManager {
  if (!defaultInstance) {
    defaultInstance = createManager(createWalkingPadAdapter());
  }
  return defaultInstance;
}

// ============================================================================
// ESSENTIAL TYPES - What most users need
// ============================================================================

/** The manager interface for controlling WalkingPad treadmills */
export type { WalkingPadBLEManager } from './manager';
/** Treadmill state (speed, distance, time, steps, etc.) */
/** Options for connect() and reconnect() */
export type {
  ConnectionState,
  ConnectOptions,
  ReconnectOptions,
  WalkingPadState,
} from './types';

// ============================================================================
// ERRORS - For error handling
// ============================================================================

export {
  NotConnectedError,
  SpeedOutOfRangeError,
  TimeoutError,
} from './errors';
export { ConnectionAbortedError } from './manager';

// ============================================================================
// ADVANCED - For power users who need custom configuration
// ============================================================================

/**
 * Creates a manager with a custom adapter and configuration.
 * Use this when you need control over timeouts, logging, or storage.
 *
 * @example Custom timeouts
 * ```typescript
 * const adapter = createWalkingPadAdapter({ connectionTimeoutMs: 30000 });
 * const manager = createManager(adapter, { writeTimeoutMs: 5000 });
 * ```
 */
export { createManager };
export type { CreateManagerOptions } from './manager';

/** Options for configuring the WalkingPad Bluetooth adapter */
export type { WebBluetoothAdapterOptions as AdapterOptions } from 'web-ble-kit';

// ============================================================================
// CONFIGURATION - For custom logging and storage
// ============================================================================

/** Custom logger interface */
export type { Logger } from './logger';
export { enableDebugLogging, resetLogger, setLogger } from './logger';

/** Storage interface for persisting device info (used for auto-reconnect) */
export type { DeviceStorage } from 'web-ble-kit';
/** Storage factory functions */
export {
  createLocalStorage,
  createMemoryStorage,
  createNoOpStorage,
  createSessionStorage,
} from 'web-ble-kit';

/**
 * Rate limiting utilities for high-frequency UI interactions.
 * Use createThrottledSetSpeed to safely connect a slider to setSpeed.
 */
export {
  createThrottledSetSpeed,
  type ThrottledSetSpeedOptions,
} from './throttle';

// ============================================================================
// TESTING - For test isolation
// ============================================================================

/**
 * Resets all singleton state. **For testing only.**
 * Clears the default manager instance and resets the logger.
 * This allows tests to run in isolation without state pollution.
 *
 * @example
 * ```typescript
 * afterEach(() => {
 *   resetForTesting();
 * });
 * ```
 */
export function resetForTesting(): void {
  defaultInstance = null;
  resetLogger();
}
