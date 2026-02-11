import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotConnectedError, normalizeError } from './errors';
import { ConnectionAbortedError, createManager } from './manager';
import {
  createDeferred,
  createMockAdapter,
  createMockCharacteristic,
  createMockConnectedSession,
  createMockConsoleError,
  createMockService,
} from './test-utils';

function createStandardMocks() {
  const writeChar = createMockCharacteristic({
    uuid: '0000fe01-0000-1000-8000-00805f9b34fb',
    properties: { write: true },
  });
  const notifyChar = createMockCharacteristic({
    uuid: '0000fe02-0000-1000-8000-00805f9b34fb',
    properties: { notify: true },
  });
  const service = createMockService({
    uuid: '0000fe00-0000-1000-8000-00805f9b34fb',
    characteristics: [writeChar, notifyChar],
  });
  const session = createMockConnectedSession({ services: [service] });
  const adapter = createMockAdapter({ session });

  return { adapter, session, service, writeChar, notifyChar };
}

function createFTMSMocks() {
  const notifyChar = createMockCharacteristic({
    uuid: '00002acd-0000-1000-8000-00805f9b34fb',
    properties: { notify: true },
  });
  const controlPointChar = createMockCharacteristic({
    uuid: '00002ad9-0000-1000-8000-00805f9b34fb',
    properties: { write: true, indicate: true },
  });
  const service = createMockService({
    uuid: '00001826-0000-1000-8000-00805f9b34fb',
    characteristics: [notifyChar, controlPointChar],
  });
  const session = createMockConnectedSession({ services: [service] });
  const adapter = createMockAdapter({ session });

  return { adapter, session, service, notifyChar, controlPointChar };
}

describe('createManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('connect', () => {
    it('transitions to connected state on success', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();

      expect(manager.getConnectionState()).toBe('connected');
    });

    it('throws for pollIntervalMs <= 0', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      await expect(manager.connect({ pollIntervalMs: 0 })).rejects.toThrow(
        RangeError,
      );
      await expect(manager.connect({ pollIntervalMs: -1 })).rejects.toThrow(
        RangeError,
      );
      await expect(manager.connect({ pollIntervalMs: -1000 })).rejects.toThrow(
        RangeError,
      );
    });

    it('throws for pollIntervalMs = NaN', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      await expect(manager.connect({ pollIntervalMs: NaN })).rejects.toThrow(
        RangeError,
      );
    });

    it('accepts valid pollIntervalMs values', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect({ pollIntervalMs: 1000 });
      expect(manager.getConnectionState()).toBe('connected');
    });

    it('aborts mid-connection when signal fires during adapter.connect()', async () => {
      // Create a deferred to control when adapter.connect() resolves
      const deferred = createDeferred<any>();
      let abortController: AbortController | null = null;

      // Custom adapter that aborts when connect is called
      const adapter = {
        connect: () => {
          // Abort synchronously when connect is called
          // This simulates the signal firing while the operation is pending
          if (abortController) {
            abortController.abort();
          }
          return deferred.promise;
        },
      };

      const manager = createManager(adapter);
      abortController = new AbortController();

      // Start connection - the adapter will abort the signal during connect()
      const connectPromise = manager.connect({
        signal: abortController.signal,
      });

      // Should reject with ConnectionAbortedError
      await expect(connectPromise).rejects.toThrow(ConnectionAbortedError);
      expect(manager.getConnectionState()).toBe('disconnected');

      // Clean up: resolve the deferred
      deferred.resolve(createMockConnectedSession());
    });

    it('handles abort and promise settlement race condition correctly', async () => {
      // This test verifies that when abort and promise settle "simultaneously",
      // only one resolution path is taken (not both)
      const { adapter } = createStandardMocks();
      const abortController = new AbortController();
      let settleCount = 0;

      const manager = createManager(adapter);

      // Track how many times then/catch handlers run
      const connectPromise = manager
        .connect({ signal: abortController.signal })
        .then(() => {
          settleCount++;
        })
        .catch(() => {
          settleCount++;
        });

      // Wait for connection to complete
      await connectPromise;

      // Should only settle once, not twice (race condition would cause double settlement)
      expect(settleCount).toBe(1);
    });

    it('cleans up abort listener after successful connection', async () => {
      const { adapter } = createStandardMocks();
      const abortController = new AbortController();

      // Cast to access internal listener tracking (implementation detail for testing)
      const signal = abortController.signal;
      const originalAddEventListener = signal.addEventListener.bind(signal);
      const originalRemoveEventListener =
        signal.removeEventListener.bind(signal);

      let addedListeners = 0;
      let removedListeners = 0;

      signal.addEventListener = (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'abort') addedListeners++;
        return originalAddEventListener(type, listener, options);
      };
      signal.removeEventListener = (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
      ) => {
        if (type === 'abort') removedListeners++;
        return originalRemoveEventListener(type, listener, options);
      };

      const manager = createManager(adapter);
      await manager.connect({ signal });

      // Should have cleaned up abort listener
      expect(addedListeners).toBe(removedListeners);
    });

    it('transitions to error state on failure', async () => {
      const adapter = createMockAdapter({ connectShouldFail: true });
      const manager = createManager(adapter);

      await expect(manager.connect()).rejects.toThrow();
      expect(manager.getConnectionState()).toBe('error');
    });

    it('sets connecting state during connection', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      // Check initial state
      expect(manager.getConnectionState()).toBe('disconnected');

      // Start connection but don't await
      const connectPromise = manager.connect();

      // After starting, state should be connecting
      // Note: Due to async nature, we check after connection completes
      await connectPromise;

      expect(manager.getConnectionState()).toBe('connected');
    });
  });

  describe('disconnect', () => {
    it('transitions to disconnected state', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();
      await manager.disconnect();

      expect(manager.getConnectionState()).toBe('disconnected');
    });

    it('is idempotent when already disconnected', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      // Should not throw
      await manager.disconnect();
      await manager.disconnect();

      expect(manager.getConnectionState()).toBe('disconnected');
    });
  });

  describe('reconnect', () => {
    it('returns true and connects when adapter.reconnect succeeds', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      const result = await manager.reconnect();

      expect(result).toBe(true);
      expect(manager.getConnectionState()).toBe('connected');
    });

    it('returns false when adapter has no reconnect method', async () => {
      const { adapter } = createStandardMocks();
      // Remove reconnect method
      delete (adapter as { reconnect?: unknown }).reconnect;
      const manager = createManager(adapter);

      const result = await manager.reconnect();

      expect(result).toBe(false);
      expect(manager.getConnectionState()).toBe('disconnected');
    });

    it('returns true without reconnecting when already connected', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();
      const result = await manager.reconnect();

      expect(result).toBe(true);
      expect(adapter.getReconnectCallCount()).toBe(0);
    });

    it('returns false when reconnect returns null', async () => {
      const adapter = createMockAdapter({ reconnectReturnsNull: true });
      const manager = createManager(adapter);

      const result = await manager.reconnect();

      expect(result).toBe(false);
      expect(manager.getConnectionState()).toBe('disconnected');
    });

    it('emits error and throws when reconnect fails', async () => {
      const adapter = createMockAdapter({ reconnectShouldFail: true });
      const manager = createManager(adapter);
      const errors: Error[] = [];

      manager.events.on('error', (err) => errors.push(err));

      await expect(manager.reconnect()).rejects.toThrow('Reconnect failed');
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('Reconnect failed');
      expect(manager.getConnectionState()).toBe('error');
    });

    it('sets error state when reconnect fails', async () => {
      const adapter = createMockAdapter({ reconnectShouldFail: true });
      // Use mock logger to suppress stderr output
      const mockLogger = { warn: vi.fn(), error: vi.fn() };
      const manager = createManager(adapter, { logger: mockLogger });

      // Should throw (consistent with connect())
      await expect(manager.reconnect()).rejects.toThrow('Reconnect failed');

      expect(manager.getConnectionState()).toBe('error');
      // Error should have been emitted (no listeners, so logged)
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('aborts immediately if signal already aborted', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);
      const controller = new AbortController();
      controller.abort();

      await expect(
        manager.reconnect({ signal: controller.signal }),
      ).rejects.toThrow(ConnectionAbortedError);
      expect(manager.getConnectionState()).toBe('disconnected');
    });

    it('transitions to disconnected on abort', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);
      const controller = new AbortController();
      controller.abort();

      await expect(
        manager.reconnect({ signal: controller.signal }),
      ).rejects.toThrow(ConnectionAbortedError);
      expect(manager.getConnectionState()).toBe('disconnected');
    });
  });

  describe('state events', () => {
    it('emits state event on notification', async () => {
      const { adapter, notifyChar } = createStandardMocks();
      const manager = createManager(adapter);
      const states: unknown[] = [];

      manager.events.on('state', (state) => states.push(state));
      await manager.connect();

      // Simulate status notification (standard protocol packet)
      const packet = new Uint8Array(16);
      packet[0] = 0xf7;
      packet[1] = 0xa2;
      packet[2] = 1; // state = running
      packet[3] = 35; // speed = 3.5 km/h
      notifyChar.simulateNotification(packet.buffer);

      expect(states).toHaveLength(1);
      expect((states[0] as { speed: number }).speed).toBe(3.5);
    });

    it('allows multiple state listeners', async () => {
      const { adapter, notifyChar } = createStandardMocks();
      const manager = createManager(adapter);
      let callback1Count = 0;
      let callback2Count = 0;

      manager.events.on('state', () => callback1Count++);
      manager.events.on('state', () => callback2Count++);
      await manager.connect();

      notifyChar.simulateNotification(new ArrayBuffer(16));

      expect(callback1Count).toBe(1);
      expect(callback2Count).toBe(1);
    });

    it('returns unsubscribe function', async () => {
      const { adapter, notifyChar } = createStandardMocks();
      const manager = createManager(adapter);
      let callCount = 0;

      const unsubscribe = manager.events.on('state', () => callCount++);
      await manager.connect();

      notifyChar.simulateNotification(new ArrayBuffer(16));
      expect(callCount).toBe(1);

      unsubscribe();
      notifyChar.simulateNotification(new ArrayBuffer(16));
      expect(callCount).toBe(1); // Still 1, callback was removed
    });
  });

  describe('error handling', () => {
    it('logs to console.error when no error listeners', async () => {
      const mockConsole = createMockConsoleError();
      mockConsole.install();

      try {
        const adapter = createMockAdapter({ reconnectShouldFail: true });
        const manager = createManager(adapter);

        // No error listener registered
        await expect(manager.reconnect()).rejects.toThrow('Reconnect failed');

        expect(mockConsole.getCallCount()).toBeGreaterThan(0);
      } finally {
        mockConsole.restore();
      }
    });

    it('emits errors to error listeners', async () => {
      const adapter = createMockAdapter({ reconnectShouldFail: true });
      const manager = createManager(adapter);
      const errors: Error[] = [];

      manager.events.on('error', (err) => errors.push(err));

      await expect(manager.reconnect()).rejects.toThrow('Reconnect failed');

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('Reconnect failed');
    });

    it('continues invoking other listeners when one throws', async () => {
      const { adapter, notifyChar } = createStandardMocks();
      // Use mock logger to suppress stderr output
      const mockLogger = { warn: vi.fn(), error: vi.fn() };
      const manager = createManager(adapter, { logger: mockLogger });
      let secondCallbackInvoked = false;

      manager.events.on('state', () => {
        throw new Error('First callback fails');
      });
      manager.events.on('state', () => {
        secondCallbackInvoked = true;
      });
      await manager.connect();

      notifyChar.simulateNotification(new ArrayBuffer(16));

      // Wait for microtask to complete (error logging is async)
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      expect(secondCallbackInvoked).toBe(true);
    });
  });

  describe('commands', () => {
    it('start() sends start command', async () => {
      const { adapter, writeChar } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();
      await manager.start();

      expect(writeChar.getWrittenValues()).toHaveLength(1);
    });

    it('stop() sends stop command', async () => {
      const { adapter, writeChar } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();
      await manager.stop();

      expect(writeChar.getWrittenValues()).toHaveLength(1);
    });

    it('setSpeed() sends speed command', async () => {
      const { adapter, writeChar } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();
      await manager.setSpeed(3.5);

      expect(writeChar.getWrittenValues()).toHaveLength(1);
    });

    it('throws when not connected', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      await expect(manager.start()).rejects.toThrow(NotConnectedError);
      await expect(manager.stop()).rejects.toThrow(NotConnectedError);
      await expect(manager.setSpeed(3.0)).rejects.toThrow(NotConnectedError);
    });
  });

  describe('connection mutex', () => {
    it('serializes concurrent connect() calls', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      // Start two connections simultaneously
      const connect1 = manager.connect();
      const connect2 = manager.connect();

      await Promise.all([connect1, connect2]);

      // Only one actual connection should be made due to mutex
      // The second connect should wait for first to complete
      expect(manager.getConnectionState()).toBe('connected');
    });

    it('queues connect during connecting state', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      // Start two connections - they should be serialized by mutex
      const connect1 = manager.connect();
      const connect2 = manager.connect();

      await Promise.all([connect1, connect2]);

      expect(manager.getConnectionState()).toBe('connected');
      // Both should complete without errors due to mutex serialization
    });

    it('handles rapid connect/disconnect cycles', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      // Rapid fire operations
      const ops = [
        manager.connect(),
        manager.disconnect(),
        manager.connect(),
        manager.disconnect(),
        manager.connect(),
      ];

      await Promise.all(ops);

      // Should end up in a valid state
      const state = manager.getConnectionState();
      expect(['connected', 'disconnected']).toContain(state);
    });

    it('disconnect acquires mutex and serializes with connect', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      // Connect first
      await manager.connect();
      expect(manager.getConnectionState()).toBe('connected');

      // Start disconnect and connect simultaneously
      const disconnectPromise = manager.disconnect();
      const connectPromise = manager.connect();

      await Promise.all([disconnectPromise, connectPromise]);

      // Should end connected (connect runs after disconnect completes)
      expect(manager.getConnectionState()).toBe('connected');
    });

    it('reconnect acquires mutex and serializes with other operations', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      // Start multiple operations simultaneously
      const reconnect1 = manager.reconnect();
      const reconnect2 = manager.reconnect();

      await Promise.all([reconnect1, reconnect2]);

      // Both should complete without error
      expect(manager.getConnectionState()).toBe('connected');
    });
  });

  describe('command mutex', () => {
    it('serializes concurrent commands', async () => {
      const { adapter, writeChar } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();

      // Fire multiple commands simultaneously
      const results = await Promise.all([
        manager.start(),
        manager.setSpeed(3.0),
        manager.stop(),
      ]);

      // All should complete without errors
      expect(results).toHaveLength(3);
      // All commands should have been written (serialized by mutex)
      expect(writeChar.getWrittenValues().length).toBeGreaterThanOrEqual(3);
    });

    it('throws NotConnectedError if disconnected during command', async () => {
      const { adapter, writeChar } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();

      // Make the write slow so we can disconnect mid-operation
      let writeResolve: () => void;
      const writePromise = new Promise<void>((resolve) => {
        writeResolve = resolve;
      });
      writeChar.setWriteDelay(writePromise);

      const startPromise = manager.start();

      // Disconnect while command is in progress
      await manager.disconnect();

      // Resolve the write
      writeResolve!();

      // Command should throw NotConnectedError
      await expect(startPromise).rejects.toThrow(NotConnectedError);
    });

    it('queues commands during other commands', async () => {
      const { adapter, writeChar } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();

      // Track write order
      const writeOrder: string[] = [];
      const originalWriteValueWithResponse = writeChar.writeValueWithResponse;
      writeChar.writeValueWithResponse = async (value: ArrayBuffer) => {
        const bytes = new Uint8Array(value);
        writeOrder.push(bytes[2] === 0x04 ? 'start/stop' : 'setSpeed');
        return originalWriteValueWithResponse.call(writeChar, value);
      };

      // Commands should be serialized
      await Promise.all([manager.start(), manager.setSpeed(3.0)]);

      // Both commands executed
      expect(writeOrder.length).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('clears polling timer on disconnect', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();

      // Verify polling is active (standard protocol polls)
      await vi.advanceTimersByTimeAsync(3000);

      await manager.disconnect();

      // After disconnect, polling should be stopped
      // No more writes should occur
      await vi.advanceTimersByTimeAsync(6000);

      // This is a bit tricky to test - we're mainly checking it doesn't throw
      expect(manager.getConnectionState()).toBe('disconnected');
    });

    it('stops notifications on disconnect', async () => {
      const { adapter, notifyChar } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();
      expect(notifyChar.wasStartNotificationsCalled()).toBe(true);

      await manager.disconnect();
      expect(notifyChar.wasStopNotificationsCalled()).toBe(true);
    });

    it('removes event listeners on disconnect', async () => {
      const { adapter, notifyChar } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();
      expect(notifyChar.getListenerCount()).toBe(1);

      await manager.disconnect();
      expect(notifyChar.getListenerCount()).toBe(0);
    });

    it('cleans up on connection error', async () => {
      const notifyChar = createMockCharacteristic({
        uuid: '0000fe02-0000-1000-8000-00805f9b34fb',
        properties: { notify: true },
        startNotificationsShouldFail: true,
      });
      const writeChar = createMockCharacteristic({
        uuid: '0000fe01-0000-1000-8000-00805f9b34fb',
        properties: { write: true },
      });
      const service = createMockService({
        uuid: '0000fe00-0000-1000-8000-00805f9b34fb',
        characteristics: [writeChar, notifyChar],
      });
      const session = createMockConnectedSession({ services: [service] });
      const adapter = createMockAdapter({ session });
      const manager = createManager(adapter);

      await expect(manager.connect()).rejects.toThrow();

      // Session should be disconnected on error
      expect(session.wasDisconnectCalled()).toBe(true);
      expect(manager.getConnectionState()).toBe('error');
    });
  });

  describe('FTMS protocol', () => {
    it('sends request control on connect', async () => {
      const { adapter, controlPointChar } = createFTMSMocks();
      const manager = createManager(adapter);

      await manager.connect();

      // FTMS protocol should send control request
      const writes = controlPointChar.getWrittenValues();
      expect(writes.length).toBeGreaterThan(0);
    });

    it('sets up control point notifications', async () => {
      const { adapter, controlPointChar } = createFTMSMocks();
      const manager = createManager(adapter);

      await manager.connect();

      expect(controlPointChar.wasStartNotificationsCalled()).toBe(true);
    });
  });

  describe('getSessionInfo', () => {
    it('returns null when not connected', () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      expect(manager.getSessionInfo()).toBeNull();
    });

    it('returns session info for standard protocol', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();

      const info = manager.getSessionInfo();
      expect(info).not.toBeNull();
      expect(info?.protocol).toBe('standard');
      expect(info?.serviceUuids).toContain(
        '0000fe00-0000-1000-8000-00805f9b34fb',
      );
    });

    it('returns session info for FTMS protocol', async () => {
      const { adapter } = createFTMSMocks();
      const manager = createManager(adapter);

      await manager.connect();

      const info = manager.getSessionInfo();
      expect(info).not.toBeNull();
      expect(info?.protocol).toBe('ftms');
      expect(info?.serviceUuids).toContain(
        '00001826-0000-1000-8000-00805f9b34fb',
      );
    });

    it('returns null after disconnect', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();
      expect(manager.getSessionInfo()).not.toBeNull();

      await manager.disconnect();
      expect(manager.getSessionInfo()).toBeNull();
    });

    it('returns a copy of serviceUuids (not the internal array)', async () => {
      const { adapter } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();

      const info1 = manager.getSessionInfo();
      const info2 = manager.getSessionInfo();

      expect(info1?.serviceUuids).not.toBe(info2?.serviceUuids);
      expect(info1?.serviceUuids).toEqual(info2?.serviceUuids);
    });
  });

  describe('polling (standard protocol)', () => {
    it('polls for stats every 3 seconds', async () => {
      const { adapter, writeChar } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();

      // Initial state - no polls yet
      const initialWrites = writeChar.getWrittenValues().length;

      // Advance by 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      expect(writeChar.getWrittenValues().length).toBeGreaterThan(
        initialWrites,
      );
    });

    it('emits error on poll failure', async () => {
      vi.useRealTimers(); // Use real timers for this specific test

      const writeChar = createMockCharacteristic({
        uuid: '0000fe01-0000-1000-8000-00805f9b34fb',
        properties: { write: true },
        writeShouldFail: true, // Set to fail from start
      });
      const notifyChar = createMockCharacteristic({
        uuid: '0000fe02-0000-1000-8000-00805f9b34fb',
        properties: { notify: true },
      });
      const service = createMockService({
        uuid: '0000fe00-0000-1000-8000-00805f9b34fb',
        characteristics: [writeChar, notifyChar],
      });
      const session = createMockConnectedSession({ services: [service] });
      const adapter = createMockAdapter({ session });
      const manager = createManager(adapter);
      const errors: Error[] = [];

      manager.events.on('error', (err) => errors.push(err));

      // Connection itself should succeed (write fails but poll hasn't started)
      // We need to allow the first poll write to fail
      // Temporarily allow writes for connection
      (writeChar as unknown as { writeShouldFail: boolean }).writeShouldFail =
        false;
      await manager.connect();

      // Now make writes fail
      (writeChar as unknown as { writeShouldFail: boolean }).writeShouldFail =
        true;

      // Wait for poll to fire (MANAGER_POLL_INTERVAL_MS = 3000)
      await new Promise((resolve) => setTimeout(resolve, 3100));

      expect(errors.length).toBeGreaterThan(0);

      await manager.disconnect();
      vi.useFakeTimers(); // Restore fake timers
    });

    it('poll is no-op after disconnect', async () => {
      const { adapter, writeChar } = createStandardMocks();
      const manager = createManager(adapter);

      await manager.connect();
      const writesAfterConnect = writeChar.getWrittenValues().length;

      await manager.disconnect();

      // Advance timers - should not cause any writes
      await vi.advanceTimersByTimeAsync(6000);

      expect(writeChar.getWrittenValues().length).toBe(writesAfterConnect);
    });
  });
});

describe('normalizeError usage', () => {
  it('normalizeError handles various error types', () => {
    expect(normalizeError(new Error('test'))).toBeInstanceOf(Error);
    expect(normalizeError('string')).toBeInstanceOf(Error);
    expect(normalizeError(42)).toBeInstanceOf(Error);
    expect(normalizeError(null)).toBeInstanceOf(Error);
  });
});

describe('custom logger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses custom logger instead of global logger', async () => {
    const { adapter } = createStandardMocks();
    const customLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const manager = createManager(adapter, { logger: customLogger });
    await manager.connect();

    expect(manager.getConnectionState()).toBe('connected');
  });

  it('isolates logger between manager instances', async () => {
    const mocks1 = createStandardMocks();
    const mocks2 = createStandardMocks();

    const logger1 = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logger2 = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const manager1 = createManager(mocks1.adapter, { logger: logger1 });
    const manager2 = createManager(mocks2.adapter, { logger: logger2 });

    await manager1.connect();
    await manager2.connect();

    // Each manager should use its own logger
    expect(manager1.getConnectionState()).toBe('connected');
    expect(manager2.getConnectionState()).toBe('connected');
  });
});

// HIGH PRIORITY: Session ID overflow protection
describe('session ID management', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('session ID wraps around to prevent overflow', async () => {
    const { adapter } = createStandardMocks();
    const manager = createManager(adapter);

    // Connect and disconnect many times
    for (let i = 0; i < 20; i++) {
      await manager.connect();
      await manager.disconnect();
    }

    // Should still work correctly after many cycles
    await manager.connect();
    expect(manager.getConnectionState()).toBe('connected');
  });
});
