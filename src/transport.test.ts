import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError } from './errors';
import {
  createMockCharacteristic,
  createMockConnectedSession,
  createMockService,
  createMockTransportSession,
} from './test-utils';
import * as transport from './transport';

describe('discoverWalkingPad', () => {
  describe('Standard protocol discovery', () => {
    it('finds write and notify characteristics from FE00 service', async () => {
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

      const result = await transport.discoverWalkingPad(session);

      expect(result.writeChar).toBe(writeChar);
      expect(result.notifyChar).toBe(notifyChar);
      expect(result.controlPointChar).toBeNull();
    });

    it('finds write and notify characteristics from FFF0 service', async () => {
      const writeChar = createMockCharacteristic({
        uuid: '0000fff2-0000-1000-8000-00805f9b34fb',
        properties: { write: true },
      });
      const notifyChar = createMockCharacteristic({
        uuid: '0000fff1-0000-1000-8000-00805f9b34fb',
        properties: { notify: true },
      });
      const service = createMockService({
        uuid: '0000fff0-0000-1000-8000-00805f9b34fb',
        characteristics: [writeChar, notifyChar],
      });
      const session = createMockConnectedSession({ services: [service] });

      const result = await transport.discoverWalkingPad(session);

      expect(result.writeChar).toBe(writeChar);
      expect(result.notifyChar).toBe(notifyChar);
    });
  });

  describe('FTMS protocol discovery', () => {
    it('finds treadmill data and control point from FTMS service', async () => {
      const treadmillDataChar = createMockCharacteristic({
        uuid: '00002acd-0000-1000-8000-00805f9b34fb',
        properties: { notify: true },
      });
      const controlPointChar = createMockCharacteristic({
        uuid: '00002ad9-0000-1000-8000-00805f9b34fb',
        properties: { write: true, indicate: true },
      });
      const service = createMockService({
        uuid: '00001826-0000-1000-8000-00805f9b34fb',
        characteristics: [treadmillDataChar, controlPointChar],
      });
      const session = createMockConnectedSession({ services: [service] });

      const result = await transport.discoverWalkingPad(session);

      expect(result.notifyChar).toBe(treadmillDataChar);
      expect(result.writeChar).toBe(controlPointChar);
      expect(result.controlPointChar).toBe(controlPointChar);
    });
  });

  describe('Error handling', () => {
    it('throws and disconnects when no write characteristic found', async () => {
      const notifyChar = createMockCharacteristic({
        uuid: '0000fe02-0000-1000-8000-00805f9b34fb',
        properties: { notify: true },
      });
      const service = createMockService({
        uuid: '0000fe00-0000-1000-8000-00805f9b34fb',
        characteristics: [notifyChar],
      });
      const session = createMockConnectedSession({ services: [service] });

      await expect(transport.discoverWalkingPad(session)).rejects.toThrow(
        'Could not find required write and notify characteristics',
      );
      expect(session.wasDisconnectCalled()).toBe(true);
    });

    it('throws and disconnects when no notify characteristic found', async () => {
      const writeChar = createMockCharacteristic({
        uuid: '0000fe01-0000-1000-8000-00805f9b34fb',
        properties: { write: true },
      });
      const service = createMockService({
        uuid: '0000fe00-0000-1000-8000-00805f9b34fb',
        characteristics: [writeChar],
      });
      const session = createMockConnectedSession({ services: [service] });

      await expect(transport.discoverWalkingPad(session)).rejects.toThrow();
      expect(session.wasDisconnectCalled()).toBe(true);
    });

    it('returns service UUIDs in the session', async () => {
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

      const result = await transport.discoverWalkingPad(session);

      expect(result.serviceUuids).toContain(
        '0000fe00-0000-1000-8000-00805f9b34fb',
      );
    });
  });
});

describe('write', () => {
  it('writes data to write characteristic', async () => {
    const writeChar = createMockCharacteristic({ properties: { write: true } });
    const session = createMockTransportSession({ writeChar });

    const data = new Uint8Array([0x01, 0x02, 0x03]);
    await transport.write(session, data);

    expect(writeChar.getWrittenValues()).toHaveLength(1);
  });

  it('propagates write errors', async () => {
    const writeError = new Error('Write failed');
    const writeChar = createMockCharacteristic({
      writeShouldFail: true,
      writeFailError: writeError,
    });
    const session = createMockTransportSession({ writeChar });

    await expect(transport.write(session, new Uint8Array([0x01]))).rejects.toBe(
      writeError,
    );
  });

  it('accepts ArrayBuffer', async () => {
    const writeChar = createMockCharacteristic({ properties: { write: true } });
    const session = createMockTransportSession({ writeChar });

    const buffer = new ArrayBuffer(3);
    await transport.write(session, buffer);

    expect(writeChar.getWrittenValues()).toHaveLength(1);
  });

  it('accepts DataView', async () => {
    const writeChar = createMockCharacteristic({ properties: { write: true } });
    const session = createMockTransportSession({ writeChar });

    const buffer = new ArrayBuffer(3);
    const view = new DataView(buffer);
    await transport.write(session, view);

    expect(writeChar.getWrittenValues()).toHaveLength(1);
  });

  // HIGH PRIORITY FIX: Should reject empty data
  it('throws error for empty Uint8Array', async () => {
    const writeChar = createMockCharacteristic({ properties: { write: true } });
    const session = createMockTransportSession({ writeChar });

    await expect(transport.write(session, new Uint8Array(0))).rejects.toThrow(
      'Empty data',
    );
  });

  it('throws error for empty ArrayBuffer', async () => {
    const writeChar = createMockCharacteristic({ properties: { write: true } });
    const session = createMockTransportSession({ writeChar });

    await expect(transport.write(session, new ArrayBuffer(0))).rejects.toThrow(
      'Empty data',
    );
  });
});

describe('writeWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when write completes before timeout', async () => {
    const char = createMockCharacteristic({ properties: { write: true } });

    const promise = transport.writeWithTimeout(
      char,
      new Uint8Array([0x01]),
      1000,
    );
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects with TimeoutError when write exceeds timeout', async () => {
    const char = createMockCharacteristic({
      properties: { write: true },
      writeDelay: 2000,
    });

    const promise = transport.writeWithTimeout(
      char,
      new Uint8Array([0x01]),
      100,
    );

    vi.advanceTimersByTime(100);

    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });

  it('includes descriptive label in timeout error', async () => {
    const char = createMockCharacteristic({
      properties: { write: true },
      writeDelay: 2000,
    });

    const promise = transport.writeWithTimeout(
      char,
      new Uint8Array([0x01]),
      100,
    );

    vi.advanceTimersByTime(100);

    await expect(promise).rejects.toThrow('BLE write');
  });
});

describe('writeToControlPoint', () => {
  it('writes to controlPointChar when available', async () => {
    const writeChar = createMockCharacteristic({ properties: { write: true } });
    const controlPointChar = createMockCharacteristic({
      properties: { write: true, indicate: true },
    });
    const session = createMockTransportSession({ writeChar, controlPointChar });

    await transport.writeToControlPoint(session, new Uint8Array([0x01]));

    expect(controlPointChar.getWrittenValues()).toHaveLength(1);
    expect(writeChar.getWrittenValues()).toHaveLength(0);
  });

  it('falls back to writeChar when controlPointChar is null', async () => {
    const writeChar = createMockCharacteristic({ properties: { write: true } });
    const session = createMockTransportSession({
      writeChar,
      controlPointChar: null,
    });

    await transport.writeToControlPoint(session, new Uint8Array([0x01]));

    expect(writeChar.getWrittenValues()).toHaveLength(1);
  });

  it('propagates write errors', async () => {
    const writeError = new Error('Control point write failed');
    const controlPointChar = createMockCharacteristic({
      properties: { write: true, indicate: true },
      writeShouldFail: true,
      writeFailError: writeError,
    });
    const session = createMockTransportSession({ controlPointChar });

    await expect(
      transport.writeToControlPoint(session, new Uint8Array([0x01])),
    ).rejects.toBe(writeError);
  });
});

describe('startNotifications', () => {
  it('calls startNotifications on characteristic', async () => {
    const char = createMockCharacteristic({ properties: { notify: true } });

    await transport.startNotifications(char, () => {});

    expect(char.wasStartNotificationsCalled()).toBe(true);
  });

  it('returns cleanup function that stops notifications', async () => {
    const char = createMockCharacteristic({ properties: { notify: true } });

    const cleanup = await transport.startNotifications(char, () => {});
    cleanup();

    expect(char.wasStopNotificationsCalled()).toBe(true);
  });

  it('returns cleanup function that removes event listener', async () => {
    const char = createMockCharacteristic({ properties: { notify: true } });

    const cleanup = await transport.startNotifications(char, () => {});
    expect(char.getListenerCount()).toBe(1);

    cleanup();
    expect(char.getListenerCount()).toBe(0);
  });

  it('invokes callback with ArrayBuffer when notification arrives', async () => {
    const char = createMockCharacteristic({ properties: { notify: true } });
    const receivedData: ArrayBuffer[] = [];

    await transport.startNotifications(char, (data) => {
      receivedData.push(data);
    });

    const testData = new Uint8Array([0x01, 0x02, 0x03]).buffer;
    char.simulateNotification(testData);

    expect(receivedData).toHaveLength(1);
    expect(receivedData[0]).toBeInstanceOf(ArrayBuffer);
  });

  it('rejects when startNotifications fails', async () => {
    const startError = new Error('BLE notification setup failed');
    const char = createMockCharacteristic({
      properties: { notify: true },
      startNotificationsShouldFail: true,
      startNotificationsFailError: startError,
    });

    await expect(transport.startNotifications(char, () => {})).rejects.toBe(
      startError,
    );
  });

  it('does not add listener if startNotifications fails', async () => {
    const char = createMockCharacteristic({
      properties: { notify: true },
      startNotificationsShouldFail: true,
    });

    try {
      await transport.startNotifications(char, () => {});
    } catch {
      // Expected
    }

    expect(char.getListenerCount()).toBe(0);
  });

  it('handles missing value gracefully (no callback invoked)', async () => {
    const char = createMockCharacteristic({ properties: { notify: true } });
    let callbackCount = 0;

    await transport.startNotifications(char, () => {
      callbackCount++;
    });

    expect(callbackCount).toBe(0); // No notification was triggered yet
  });
});
