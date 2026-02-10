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
 * import { createManager, createWebBluetoothAdapter } from 'walkingpad-ble';
 *
 * const adapter = createWebBluetoothAdapter();
 * const manager = createManager(adapter);
 * await manager.connect();
 * ```
 */

import {
  createWebBluetoothAdapter,
  type WebBluetoothAdapterOptions,
} from './adapter/web-bluetooth';
import { resetLogger } from './logger';
import { createManager, type WalkingPadBLEManager } from './manager';
import { resetDefaultStorage } from './storage';

// Lazy singleton - only created when first accessed
// This avoids throwing in environments without Web Bluetooth (Node.js, SSR)
let defaultInstance: WalkingPadBLEManager | null = null;

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
    defaultInstance = createManager(createWebBluetoothAdapter());
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
 * const adapter = createWebBluetoothAdapter({ connectionTimeoutMs: 30000 });
 * const manager = createManager(adapter, { writeTimeoutMs: 5000 });
 * ```
 */
export { createManager };
export type { CreateManagerOptions } from './manager';

/**
 * Creates a Web Bluetooth adapter with custom configuration.
 *
 * @example Disable device persistence
 * ```typescript
 * const adapter = createWebBluetoothAdapter({ storage: createNoOpStorage() });
 * ```
 */
export { createWebBluetoothAdapter };
export type { WebBluetoothAdapterOptions };

// ============================================================================
// CONFIGURATION - For custom logging and storage
// ============================================================================

/** Custom logger interface */
export type { Logger } from './logger';
export { enableDebugLogging, resetLogger, setLogger } from './logger';

/** Custom storage for device ID persistence */
export type { DeviceStorage } from './storage';
export {
  createLocalStorage,
  createMemoryStorage,
  createNoOpStorage,
  createSessionStorage,
} from './storage';

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
 * Clears the default manager instance, resets the logger, and clears default storage.
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
  resetDefaultStorage();
}
