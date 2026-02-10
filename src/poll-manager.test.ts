import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPollManager } from './poll-manager';
import {
  createMockCharacteristic,
  createMockTransportSession,
} from './test-utils';
import type { WalkingPadProtocol } from './types';
import { createDefaultState, type ProtocolName } from './types';

function createMockProtocol(
  askStatsReturns: Uint8Array = new Uint8Array([0x01]),
): WalkingPadProtocol {
  return {
    name: 'standard' as ProtocolName,
    parseStatus: () => createDefaultState(),
    cmdStart: () => new Uint8Array([0x01]),
    cmdStop: () => new Uint8Array([0x02]),
    cmdAskStats: () => askStatsReturns,
    cmdSetSpeed: () => new Uint8Array([0x03]),
    cmdRequestControl: () => new Uint8Array([]),
  };
}

describe('createPollManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts polling at the specified interval', async () => {
    const writeChar = createMockCharacteristic({ properties: { write: true } });
    const session = createMockTransportSession({ writeChar });
    const protocol = createMockProtocol();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const onError = vi.fn();

    const pollManager = createPollManager({
      defaultIntervalMs: 1000,
      writeTimeoutMs: 5000,
      logger,
      onError,
    });

    pollManager.start(session, protocol);
    expect(pollManager.isPolling()).toBe(true);

    // Advance by interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeChar.getWrittenValues().length).toBe(1);

    // Advance again
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeChar.getWrittenValues().length).toBe(2);

    pollManager.stop();
    expect(pollManager.isPolling()).toBe(false);
  });

  it('uses custom interval when provided in start options', async () => {
    const writeChar = createMockCharacteristic({ properties: { write: true } });
    const session = createMockTransportSession({ writeChar });
    const protocol = createMockProtocol();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const onError = vi.fn();

    const pollManager = createPollManager({
      defaultIntervalMs: 5000,
      writeTimeoutMs: 5000,
      logger,
      onError,
    });

    // Override with shorter interval
    pollManager.start(session, protocol, { intervalMs: 500 });

    await vi.advanceTimersByTimeAsync(500);
    expect(writeChar.getWrittenValues().length).toBe(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(writeChar.getWrittenValues().length).toBe(2);

    pollManager.stop();
  });

  it('stops polling after max consecutive errors', async () => {
    const writeChar = createMockCharacteristic({
      properties: { write: true },
      writeShouldFail: true,
    });
    const session = createMockTransportSession({ writeChar });
    const protocol = createMockProtocol();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const onError = vi.fn();

    const pollManager = createPollManager({
      defaultIntervalMs: 100,
      writeTimeoutMs: 5000,
      logger,
      onError,
      maxConsecutiveErrors: 3,
    });

    pollManager.start(session, protocol);

    // Trigger 3 errors
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    expect(onError).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Too many consecutive errors'),
    );
    expect(pollManager.isPolling()).toBe(false);
  });

  it('resets error count on successful poll', async () => {
    let shouldFail = true;
    const writeChar = createMockCharacteristic({ properties: { write: true } });
    const originalWrite = writeChar.writeValueWithResponse.bind(writeChar);
    writeChar.writeValueWithResponse = async (value) => {
      if (shouldFail) {
        throw new Error('Write failed');
      }
      return originalWrite(value);
    };

    const session = createMockTransportSession({ writeChar });
    const protocol = createMockProtocol();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const onError = vi.fn();

    const pollManager = createPollManager({
      defaultIntervalMs: 100,
      writeTimeoutMs: 5000,
      logger,
      onError,
      maxConsecutiveErrors: 3,
    });

    pollManager.start(session, protocol);

    // Trigger 2 errors
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledTimes(2);

    // Make it succeed
    shouldFail = false;
    await vi.advanceTimersByTimeAsync(100);

    // Trigger 2 more errors (should not stop yet since counter reset)
    shouldFail = true;
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    expect(pollManager.isPolling()).toBe(true);
  });

  it('does not poll when cmdAskStats returns empty', async () => {
    const writeChar = createMockCharacteristic({ properties: { write: true } });
    const session = createMockTransportSession({ writeChar });
    const protocol = createMockProtocol(new Uint8Array(0)); // Empty cmdAskStats
    const logger = { warn: vi.fn(), error: vi.fn() };
    const onError = vi.fn();

    const pollManager = createPollManager({
      defaultIntervalMs: 100,
      writeTimeoutMs: 5000,
      logger,
      onError,
    });

    pollManager.start(session, protocol);

    await vi.advanceTimersByTimeAsync(500);
    expect(writeChar.getWrittenValues().length).toBe(0);

    pollManager.stop();
  });

  it('stops previous polling when start is called again', async () => {
    const writeChar1 = createMockCharacteristic({
      properties: { write: true },
    });
    const session1 = createMockTransportSession({ writeChar: writeChar1 });
    const writeChar2 = createMockCharacteristic({
      properties: { write: true },
    });
    const session2 = createMockTransportSession({ writeChar: writeChar2 });
    const protocol = createMockProtocol();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const onError = vi.fn();

    const pollManager = createPollManager({
      defaultIntervalMs: 100,
      writeTimeoutMs: 5000,
      logger,
      onError,
    });

    pollManager.start(session1, protocol);
    await vi.advanceTimersByTimeAsync(100);
    expect(writeChar1.getWrittenValues().length).toBe(1);

    // Start with new session
    pollManager.start(session2, protocol);
    await vi.advanceTimersByTimeAsync(100);

    // Only session2 should have new writes
    expect(writeChar1.getWrittenValues().length).toBe(1);
    expect(writeChar2.getWrittenValues().length).toBe(1);

    pollManager.stop();
  });
});
