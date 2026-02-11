import {
  AbortError,
  createEventEmitter,
  createPollManager,
  createStateMachine,
  type PollManager,
  raceWithAbort,
  type StateMachine,
  type TypedEventEmitter,
  toEventTarget,
} from 'web-ble-kit';
import {
  BLE_NOTIFICATION_TIMEOUT_MS,
  BLE_WRITE_TIMEOUT_MS,
  MANAGER_POLL_INTERVAL_MS,
} from './constants';
import { NotConnectedError, normalizeError } from './errors';
import { getLogger, type Logger } from './logger';
import { detectProtocol, getProtocol } from './protocol-factory';
import * as transport from './transport';
import type {
  BLEAdapter,
  BLEConnectedSession,
  ConnectionState,
  ConnectOptions,
  ProtocolName,
  ReconnectOptions,
  TransportSession,
  WalkingPadProtocol,
  WalkingPadState,
} from './types';

/**
 * Events emitted by the WalkingPad manager.
 */
export type WalkingPadEvents = {
  state: WalkingPadState;
  error: Error;
  connectionStateChange: {
    from: ConnectionState;
    to: ConnectionState;
  };
};

/**
 * Information about the current session.
 * Available after successful connection.
 */
export interface SessionInfo {
  /** The detected protocol ('standard' or 'ftms') */
  protocol: ProtocolName;
  /** UUIDs of discovered GATT services */
  serviceUuids: string[];
}

/**
 * Manager interface for controlling WalkingPad treadmills over BLE.
 */
export interface WalkingPadBLEManager {
  /**
   * Connects to a WalkingPad device.
   * Opens a device selection dialog in the browser.
   * @param options - Connection options including filters and polling interval
   * @throws {ConnectionAbortedError} If the connection is aborted via signal
   */
  connect(options?: ConnectOptions): Promise<void>;

  /**
   * Attempts to reconnect to a previously paired device.
   * Uses Web Bluetooth's getDevices() API to find known devices.
   * @param options - Reconnection options including abort signal
   * @returns true if reconnection succeeded, false if no device found
   * @throws {ConnectionAbortedError} If the reconnection is aborted via signal
   */
  reconnect(options?: ReconnectOptions): Promise<boolean>;

  /**
   * Disconnects from the current device.
   * Safe to call even when not connected.
   */
  disconnect(): Promise<void>;

  /**
   * Starts the treadmill belt.
   * @throws {Error} If not connected
   */
  start(): Promise<void>;

  /**
   * Stops the treadmill belt.
   * @throws {Error} If not connected
   */
  stop(): Promise<void>;

  /**
   * Sets the target speed of the treadmill.
   * @param kmh - Target speed in kilometers per hour (0.5-6.0)
   * @throws {SpeedOutOfRangeError} If speed is outside valid range
   * @throws {Error} If not connected
   */
  setSpeed(kmh: number): Promise<void>;

  /**
   * Returns the current connection state.
   */
  getConnectionState(): ConnectionState;

  /**
   * Returns session info if connected, null otherwise.
   * Includes detected protocol and discovered service UUIDs.
   */
  getSessionInfo(): SessionInfo | null;

  /**
   * Typed event emitter for state, error, and connection state changes.
   * @example
   * ```typescript
   * manager.events.on('state', (state) => console.log(state.speed));
   * manager.events.on('error', (error) => console.error(error));
   * ```
   */
  readonly events: TypedEventEmitter<WalkingPadEvents>;

  /**
   * Returns an EventTarget adapter for browser integration.
   * Allows using standard addEventListener/removeEventListener.
   * @example
   * ```typescript
   * const target = manager.asEventTarget();
   * target.addEventListener('state', (e) => console.log(e.detail));
   * ```
   */
  asEventTarget(): EventTarget;
}

/**
 * Error thrown when a connection attempt is aborted via AbortSignal.
 */
export class ConnectionAbortedError extends Error {
  constructor() {
    super('Connection aborted');
    this.name = 'ConnectionAbortedError';
  }
}

/**
 * Options for creating a WalkingPad manager.
 */
export interface CreateManagerOptions {
  /**
   * Custom logger instance. If not provided, uses the global logger.
   * Use this to isolate logging in tests or provide custom logging infrastructure.
   */
  logger?: Logger;

  /**
   * Timeout for BLE write operations in milliseconds.
   * BLE writes can hang indefinitely if the device disconnects or becomes unresponsive.
   * @default 10000 (10 seconds)
   */
  writeTimeoutMs?: number;

  /**
   * Timeout for starting BLE notifications in milliseconds.
   * Some devices take a while to set up notifications.
   * @default 15000 (15 seconds)
   */
  notificationTimeoutMs?: number;

  /**
   * Default polling interval for standard protocol devices in milliseconds.
   * Can be overridden per-connection via ConnectOptions.pollIntervalMs.
   * FTMS devices use notifications and don't need polling.
   * @default 3000 (3 seconds)
   */
  pollIntervalMs?: number;
}

/**
 * Creates a new WalkingPad BLE manager with the given adapter.
 *
 * @param adapter - The BLE adapter to use for connections
 * @param options - Optional configuration including custom logger
 * @returns A manager instance for controlling WalkingPad devices
 *
 * @example
 * ```typescript
 * const manager = createManager(createWebBluetoothAdapter());
 * await manager.connect();
 * await manager.start();
 * await manager.setSpeed(3.5);
 * ```
 *
 * @example Custom logger
 * ```typescript
 * const manager = createManager(adapter, {
 *   logger: { warn: console.warn, error: console.error }
 * });
 * ```
 */
export function createManager(
  adapter: BLEAdapter,
  options: CreateManagerOptions = {},
): WalkingPadBLEManager {
  // Use provided logger or fall back to global logger
  const logger = options.logger ?? getLogger();
  const writeTimeoutMs = options.writeTimeoutMs ?? BLE_WRITE_TIMEOUT_MS;
  const notificationTimeoutMs =
    options.notificationTimeoutMs ?? BLE_NOTIFICATION_TIMEOUT_MS;
  const defaultPollIntervalMs =
    options.pollIntervalMs ?? MANAGER_POLL_INTERVAL_MS;
  const stateMachine: StateMachine = createStateMachine('disconnected');
  const events = createEventEmitter<WalkingPadEvents>();

  let session: TransportSession | null = null;
  let protocol: WalkingPadProtocol | null = null;
  let protocolName: ProtocolName | null = null;
  let stopNotify: (() => void) | null = null;
  let stopControlPointNotify: (() => void) | null = null;
  let stopDisconnectListener: (() => void) | null = null;

  // Configurable polling interval, stored when connect is called
  let currentPollIntervalMs = defaultPollIntervalMs;

  // Store service UUIDs for getSessionInfo
  let serviceUuids: string[] = [];

  // Connection mutex to prevent race conditions
  let connectionLock: Promise<void> = Promise.resolve();

  // Command mutex to prevent race conditions during command execution
  let commandLock: Promise<void> = Promise.resolve();

  // Cached EventTarget adapter (lazy created)
  let eventTargetAdapter: EventTarget | null = null;

  function emitError(error: Error): void {
    if (events.listenerCount('error') === 0) {
      // No error handlers, log to console
      logger.error('[WalkingPadBLE] Unhandled error:', error);
      return;
    }
    events.emit('error', error);
  }

  function emitState(state: WalkingPadState): void {
    events.emit('state', state);
  }

  // Context type for the poll manager
  interface PollContext {
    session: TransportSession;
    protocol: WalkingPadProtocol;
  }

  // Create poll manager using web-ble-kit
  const pollManager: PollManager<PollContext> = createPollManager<PollContext>(
    async (ctx: PollContext) => {
      const cmd = ctx.protocol.cmdAskStats();
      if (cmd.byteLength === 0) return;
      await transport.write(ctx.session, cmd, writeTimeoutMs);
    },
    {
      defaultIntervalMs: defaultPollIntervalMs,
      maxConsecutiveErrors: 3,
      onError: (e: Error) => emitError(normalizeError(e)),
    },
  );

  // Forward state machine transitions to event emitter
  stateMachine.onTransition((from, to) => {
    events.emit('connectionStateChange', { from, to });
  });

  function transitionState(to: ConnectionState): void {
    if (stateMachine.canTransition(to)) {
      stateMachine.transition(to);
    }
  }

  /**
   * Cleans up the session resources without changing state.
   * The caller is responsible for state transitions.
   */
  async function cleanupResources(): Promise<void> {
    pollManager.stop();
    if (stopNotify) {
      stopNotify();
      stopNotify = null;
    }
    if (stopControlPointNotify) {
      stopControlPointNotify();
      stopControlPointNotify = null;
    }
    if (stopDisconnectListener) {
      stopDisconnectListener();
      stopDisconnectListener = null;
    }
    if (session) {
      try {
        await session.disconnect();
      } catch (e) {
        emitError(normalizeError(e));
      }
      session = null;
    }
    protocol = null;
    protocolName = null;
    serviceUuids = [];
  }

  /**
   * Cleans up session and transitions to disconnected state.
   */
  async function cleanupSession(): Promise<void> {
    await cleanupResources();
    transitionState('disconnected');
  }

  async function connectWithSession(
    connectedSession: BLEConnectedSession,
    pollIntervalMs: number,
  ): Promise<void> {
    // Register disconnect listener if supported
    if (connectedSession.onDisconnect) {
      stopDisconnectListener = connectedSession.onDisconnect(() => {
        if (stateMachine.getState() === 'connected') {
          logger.warn('[WalkingPadBLE] Device disconnected unexpectedly');
          void acquireConnectionLock().then(async (releaseLock) => {
            try {
              // Re-check state after acquiring lock (may have changed)
              if (stateMachine.getState() !== 'disconnected') {
                await cleanupSession();
              }
            } finally {
              releaseLock();
            }
          });
        }
      });
    }

    const s = await transport.discoverWalkingPad(connectedSession);
    session = s;
    serviceUuids = s.serviceUuids;
    protocolName = detectProtocol(s.serviceUuids);
    protocol = getProtocol(protocolName);

    const currentProtocol = protocol;
    const currentProtocolName = protocolName;
    const onNotification = (data: ArrayBuffer): void => {
      if (!currentProtocol) return;
      emitState(currentProtocol.parseStatus(data));
    };

    try {
      stopNotify = await transport.startNotifications(
        s.notifyChar,
        onNotification,
        {
          timeoutMs: notificationTimeoutMs,
          logger,
        },
      );

      if (
        s.controlPointChar &&
        currentProtocol.cmdRequestControl().byteLength > 0
      ) {
        stopControlPointNotify = await transport.startNotifications(
          s.controlPointChar,
          () => {},
          {
            timeoutMs: notificationTimeoutMs,
            logger,
          },
        );
        // For FTMS, request control goes to the control point
        if (currentProtocolName === 'ftms') {
          await transport.writeToControlPoint(
            s,
            currentProtocol.cmdRequestControl(),
            writeTimeoutMs,
          );
        } else {
          await transport.write(
            s,
            currentProtocol.cmdRequestControl(),
            writeTimeoutMs,
          );
        }
      }
    } catch (err) {
      // Clean up any partial setup (don't transition state, caller handles it)
      await cleanupResources();
      throw err;
    }

    // Start polling for standard protocol devices (FTMS uses notifications)
    if (currentProtocolName === 'standard') {
      pollManager.start(
        { session: s, protocol: currentProtocol },
        { intervalMs: pollIntervalMs },
      );
    }
    transitionState('connected');
  }

  /**
   * Acquires the connection lock and returns a release function.
   * This ensures only one connection operation runs at a time.
   */
  async function acquireConnectionLock(): Promise<() => void> {
    const previousLock = connectionLock;
    let releaseLock: () => void;
    connectionLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    await previousLock;
    return releaseLock!;
  }

  /**
   * Acquires the command lock and returns a release function.
   * This ensures commands are serialized and state doesn't change mid-command.
   */
  async function acquireCommandLock(): Promise<() => void> {
    const previousLock = commandLock;
    let releaseLock: () => void;
    commandLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    await previousLock;
    return releaseLock!;
  }

  /**
   * Checks if the abort signal is aborted and throws if so.
   */
  function checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new ConnectionAbortedError();
    }
  }

  /**
   * Races a promise against an abort signal.
   * If the signal is aborted before the promise settles, rejects with ConnectionAbortedError.
   */
  async function withAbortSignal<T>(
    promise: Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!signal) {
      return promise;
    }

    try {
      return await raceWithAbort(promise, signal);
    } catch (err) {
      if (err instanceof AbortError) {
        throw new ConnectionAbortedError();
      }
      throw err;
    }
  }

  async function connect(options: ConnectOptions = {}): Promise<void> {
    const {
      signal,
      pollIntervalMs = defaultPollIntervalMs,
      ...adapterOptions
    } = options;

    // Validate pollIntervalMs
    if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
      throw new RangeError(
        `pollIntervalMs must be a positive number, got ${pollIntervalMs}`,
      );
    }

    // Check abort before acquiring lock
    checkAborted(signal);

    const releaseLock = await acquireConnectionLock();

    try {
      // Check abort after acquiring lock
      checkAborted(signal);

      const currentState = stateMachine.getState();
      if (currentState === 'connected' || currentState === 'connecting') {
        await cleanupSession();
      }
      transitionState('connecting');

      // Store polling interval for this connection
      currentPollIntervalMs = pollIntervalMs;

      try {
        // Race adapter.connect() against abort signal
        // This ensures abort immediately rejects even if adapter is slow
        const connectedSession = await withAbortSignal(
          adapter.connect(adapterOptions),
          signal,
        );

        // Check abort after adapter returns (in case abort fired at exact moment)
        checkAborted(signal);

        await withAbortSignal(
          connectWithSession(connectedSession, pollIntervalMs),
          signal,
        );
      } catch (err) {
        await cleanupResources();
        if (err instanceof ConnectionAbortedError) {
          transitionState('disconnected');
          throw err;
        } else {
          transitionState('error');
          // Normalize error for consistent error types
          throw normalizeError(err);
        }
      }
    } finally {
      releaseLock();
    }
  }

  async function reconnect(options: ReconnectOptions = {}): Promise<boolean> {
    const { signal } = options;

    // Check abort before acquiring lock
    checkAborted(signal);

    const releaseLock = await acquireConnectionLock();

    try {
      // Check abort after acquiring lock
      checkAborted(signal);

      const currentState = stateMachine.getState();
      if (currentState === 'connected' || currentState === 'connecting')
        return true;
      if (!adapter.reconnect) return false;
      transitionState('connecting');
      try {
        // Race adapter.reconnect() against abort signal
        const connectedSession = await withAbortSignal(
          adapter.reconnect(),
          signal,
        );

        // Check abort after adapter returns
        checkAborted(signal);

        if (!connectedSession) {
          transitionState('disconnected');
          return false;
        }

        await withAbortSignal(
          connectWithSession(connectedSession, currentPollIntervalMs),
          signal,
        );
        return true;
      } catch (err) {
        await cleanupResources();
        const normalizedErr =
          err instanceof ConnectionAbortedError ? err : normalizeError(err);
        if (normalizedErr instanceof ConnectionAbortedError) {
          transitionState('disconnected');
          throw normalizedErr;
        } else {
          transitionState('error');
          emitError(normalizedErr);
          throw normalizedErr;
        }
      }
    } finally {
      releaseLock();
    }
  }

  async function disconnect(): Promise<void> {
    const releaseLock = await acquireConnectionLock();

    try {
      if (stateMachine.getState() === 'disconnected') return;
      await cleanupSession();
    } finally {
      releaseLock();
    }
  }

  /**
   * Sends a command using the appropriate characteristic for the protocol.
   * FTMS commands go to the control point, standard protocol uses regular write.
   */
  async function sendCommand(
    currentSession: TransportSession,
    currentProtocol: WalkingPadProtocol,
    currentProtocolName: ProtocolName,
    getPayload: (p: WalkingPadProtocol) => Uint8Array,
  ): Promise<void> {
    const cmd = getPayload(currentProtocol);
    if (cmd.byteLength === 0) return;

    // FTMS protocol commands must go to the control point characteristic
    if (currentProtocolName === 'ftms' && currentSession.controlPointChar) {
      await transport.writeToControlPoint(currentSession, cmd, writeTimeoutMs);
    } else {
      await transport.write(currentSession, cmd, writeTimeoutMs);
    }
  }

  async function ensureConnectedAndSend(
    getPayload: (p: WalkingPadProtocol) => Uint8Array,
  ): Promise<void> {
    const releaseCommandLock = await acquireCommandLock();

    try {
      // Validate state and capture references under lock
      if (
        stateMachine.getState() !== 'connected' ||
        !session ||
        !protocol ||
        !protocolName
      ) {
        throw new NotConnectedError();
      }

      // Capture references to prevent race conditions
      const currentSession = session;
      const currentProtocol = protocol;
      const currentProtocolName = protocolName;

      await sendCommand(
        currentSession,
        currentProtocol,
        currentProtocolName,
        getPayload,
      );

      // Verify state hasn't changed during command execution
      if (stateMachine.getState() !== 'connected') {
        throw new NotConnectedError();
      }
    } finally {
      releaseCommandLock();
    }
  }

  async function start(): Promise<void> {
    await ensureConnectedAndSend((p) => p.cmdStart());
  }

  async function stop(): Promise<void> {
    await ensureConnectedAndSend((p) => p.cmdStop());
  }

  async function setSpeed(kmh: number): Promise<void> {
    await ensureConnectedAndSend((p) => p.cmdSetSpeed(kmh));
  }

  function getConnectionState(): ConnectionState {
    return stateMachine.getState();
  }

  function getSessionInfo(): SessionInfo | null {
    if (!protocolName || stateMachine.getState() !== 'connected') {
      return null;
    }
    return {
      protocol: protocolName,
      serviceUuids: [...serviceUuids],
    };
  }

  function asEventTarget(): EventTarget {
    if (!eventTargetAdapter) {
      eventTargetAdapter = toEventTarget(events);
    }
    return eventTargetAdapter;
  }

  return {
    connect,
    reconnect,
    disconnect,
    start,
    stop,
    setSpeed,
    getConnectionState,
    getSessionInfo,
    events,
    asEventTarget,
  };
}
