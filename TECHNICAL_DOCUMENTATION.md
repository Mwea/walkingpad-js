# 📖 Technical Documentation

This document provides detailed API reference, types, and advanced configuration options for the WalkingPad BLE library.

---

## 📑 Table of Contents

- [Examples](#-examples)
  - [Auto-Reconnect](#auto-reconnect)
  - [Connection State Monitoring](#connection-state-monitoring)
  - [Cancel Connection with AbortSignal](#cancel-connection-with-abortsignal)
- [API Reference](#-api-reference)
  - [Manager Methods](#manager-methods)
  - [Events](#events)
  - [Types](#types)
  - [Error Classes](#error-classes)
- [Advanced Configuration](#%EF%B8%8F-advanced-configuration)
  - [Custom Timeouts](#-custom-timeouts)
  - [Custom Device Storage](#-custom-device-storage)
  - [Custom Logging](#-custom-logging)
  - [Per-Manager Logger](#-per-manager-logger)
- [Architecture](#-architecture)
- [Future Work](#-future-work)

---

## 💡 Examples

### Auto-Reconnect

Reconnect to a previously paired device without showing the device picker:

```typescript
import { getWalkingPadBLE } from 'walkingpad-js';

const pad = getWalkingPadBLE();

// Try to reconnect to a previously paired device
const reconnected = await pad.reconnect();

if (!reconnected) {
  // No known device, show connect button to user
  await pad.connect({ rememberDevice: true });
}
```

### Connection State Monitoring

Track connection state changes:

```typescript
import { getWalkingPadBLE } from 'walkingpad-js';

const pad = getWalkingPadBLE();

pad.events.on('connectionStateChange', ({ from, to }) => {
  console.log(`Connection: ${from} -> ${to}`);

  if (to === 'connected') {
    console.log('Ready to use!');
  } else if (to === 'disconnected') {
    console.log('Device disconnected');
  }
});

// Check current state anytime
console.log(pad.getConnectionState()); // 'disconnected' | 'connecting' | 'connected' | 'error'
```

### Cancel Connection with AbortSignal

Cancel a connection attempt using an AbortController:

```typescript
import { getWalkingPadBLE } from 'walkingpad-js';

const pad = getWalkingPadBLE();
const controller = new AbortController();

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10000);

try {
  await pad.connect({ signal: controller.signal });
} catch (error) {
  if (error.name === 'ConnectionAbortedError') {
    console.log('Connection was cancelled');
  }
}
```

---

## 📋 API Reference

### Manager Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `connect(options?)` | Connect to a WalkingPad device | `Promise<void>` |
| `reconnect(options?)` | Reconnect to a previously paired device | `Promise<boolean>` |
| `disconnect()` | Disconnect from the device | `Promise<void>` |
| `start()` | Start the treadmill belt | `Promise<void>` |
| `stop()` | Stop the treadmill belt | `Promise<void>` |
| `setSpeed(kmh)` | Set belt speed (0.5-6.0 km/h) | `Promise<void>` |
| `getConnectionState()` | Get current connection state | `ConnectionState` |
| `events` | Event emitter for state/error/connection events | `EventEmitter` |

### Events

```typescript
// Treadmill state updates (speed, distance, time, steps)
pad.events.on('state', (state: WalkingPadState) => { });

// Error events
pad.events.on('error', (error: Error) => { });

// Connection state changes
pad.events.on('connectionStateChange', ({ from, to }) => { });
```

### Types

#### WalkingPadState

```typescript
interface WalkingPadState {
  state: number;      // Device state (0=idle, 1=running, 2=starting, 3=paused)
  speed: number;      // Current speed in km/h
  time: number;       // Elapsed time in seconds
  distance: number;   // Distance traveled in km
  steps: number;      // Step count
  mode: number;       // Control mode (0=standby, 1=manual, 2=auto)
  isRunning: boolean; // Whether the belt is moving
}
```

#### ConnectionState

```typescript
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
```

#### ConnectOptions

```typescript
interface ConnectOptions {
  rememberDevice?: boolean;  // Store device ID for reconnection (default: false)
  pollIntervalMs?: number;   // Polling interval for legacy devices (default: 3000)
  signal?: AbortSignal;      // Cancel the connection attempt
}
```

#### ReconnectOptions

```typescript
interface ReconnectOptions {
  signal?: AbortSignal;      // Cancel the reconnection attempt
}
```

### Error Classes

```typescript
import {
  NotConnectedError,      // Thrown when calling methods while disconnected
  SpeedOutOfRangeError,   // Thrown when speed is outside 0.5-6.0 km/h
  TimeoutError,           // Thrown when BLE operations timeout
  ConnectionAbortedError  // Thrown when connection is cancelled via AbortSignal
} from 'walkingpad-js';
```

---

## ⚙️ Advanced Configuration

For advanced use cases, create a custom manager instead of using the default singleton.

### ⏱️ Custom Timeouts

Configure BLE operation timeouts for slow or unreliable connections:

```typescript
import { createManager, createWalkingPadAdapter } from 'walkingpad-js';

const adapter = createWalkingPadAdapter({
  connectionTimeoutMs: 30000,  // 30s for slow devices (default: 20s)
});

const manager = createManager(adapter, {
  writeTimeoutMs: 15000,        // 15s for write operations (default: 10s)
  notificationTimeoutMs: 20000, // 20s for notification setup (default: 15s)
  pollIntervalMs: 5000,         // 5s polling for legacy devices (default: 3s)
});

await manager.connect();
```

#### AdapterOptions

Adapter options are provided by [web-ble-kit](https://github.com/user/web-ble-kit). Common options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storage` | `DeviceStorage` | localStorage | Storage for device ID persistence |
| `connectionTimeoutMs` | `number` | 20000 | GATT connection timeout in ms |

#### CreateManagerOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `logger` | `Logger` | global logger | Logger instance for this manager |
| `writeTimeoutMs` | `number` | 10000 | BLE write operation timeout in ms |
| `notificationTimeoutMs` | `number` | 15000 | Notification setup timeout in ms |
| `pollIntervalMs` | `number` | 3000 | Polling interval for legacy protocol |

### 💾 Custom Device Storage

Control how device IDs are persisted for reconnection. Storage utilities are provided by [web-ble-kit](https://github.com/user/web-ble-kit):

```typescript
import {
  createManager,
  createWalkingPadAdapter,
  createSessionStorage,  // Persists for browser session only
  createMemoryStorage,   // Lost on page refresh
  createNoOpStorage,     // Disable persistence entirely
} from 'walkingpad-js';

// Use sessionStorage instead of localStorage
const adapter = createWalkingPadAdapter({
  storage: createSessionStorage(),
});

// Or disable persistence entirely
const adapterNoPersist = createWalkingPadAdapter({
  storage: createNoOpStorage(),
});

// Or implement your own
const adapterCustom = createWalkingPadAdapter({
  storage: {
    get: () => mySecureStore.getDeviceId(),
    set: (id) => mySecureStore.setDeviceId(id),
    remove: () => mySecureStore.clearDeviceId(),
  },
});
```

#### DeviceStorage Interface

```typescript
interface DeviceStorage {
  get(): string | null;
  set(deviceId: string): void;
  remove(): void;
}
```

### 📝 Custom Logging

Integrate with your logging infrastructure:

```typescript
import { setLogger, enableDebugLogging } from 'walkingpad-js';

// Enable debug output to console
enableDebugLogging();

// Or provide a custom logger
setLogger({
  debug: (msg, ...args) => myLogger.debug(msg, ...args),
  warn: (msg, ...args) => myLogger.warn(msg, ...args),
  error: (msg, ...args) => myLogger.error(msg, ...args),
});
```

#### Logger Interface

```typescript
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

### 🧪 Per-Manager Logger

Use isolated loggers for testing or multiple manager instances:

```typescript
import { createManager, createWalkingPadAdapter } from 'walkingpad-js';

const testLogger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const manager = createManager(createWalkingPadAdapter(), {
  logger: testLogger,
});
```

---

## 🏗️ Architecture

This library is built on top of [web-ble-kit](https://github.com/user/web-ble-kit), which handles all low-level Bluetooth operations.

```
┌─────────────────────────────────────────────────────┐
│              Application Layer                       │
│         (Your app using WalkingPadJS)              │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                Manager Layer                         │
│    • Connection state machine                        │
│    • Event emitter (state, error, connection)       │
│    • Command serialization (mutex)                  │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              Protocol Layer                          │
│   ┌─────────────────┬─────────────────┐             │
│   │ StandardProtocol│  FTMSProtocol   │             │
│   │   (A1/R1/P1)    │  (Z1/R2/C2)     │             │
│   └─────────────────┴─────────────────┘             │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              Transport Layer                         │
│    • WalkingPad-specific service discovery          │
│    • Protocol detection                             │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│         web-ble-kit (External Library)               │
│    • Web Bluetooth API abstraction                  │
│    • Device selection & pairing                     │
│    • Notification handling & write operations       │
│    • Configurable storage & timeouts               │
└─────────────────────────────────────────────────────┘
```

---

## 🔮 Future Work

- **Retry Logic** — Exponential backoff for transient BLE failures
