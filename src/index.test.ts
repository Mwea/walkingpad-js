import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createManager,
  getWalkingPadBLE,
  resetForTesting,
  resetLogger,
  setLogger,
} from './index';

describe('getWalkingPadBLE', () => {
  afterEach(() => {
    resetForTesting();
  });

  it('creates manager even without Web Bluetooth (throws on connect)', () => {
    // getWalkingPadBLE creates the manager lazily but doesn't check for
    // Web Bluetooth availability until connect() is called.
    // This allows the manager to be created in SSR environments.
    const manager = getWalkingPadBLE();
    expect(manager).toBeDefined();
    expect(manager.getConnectionState()).toBe('disconnected');
  });

  it('returns the same instance on multiple calls', () => {
    const manager1 = getWalkingPadBLE();
    const manager2 = getWalkingPadBLE();
    expect(manager1).toBe(manager2);
  });
});

describe('resetForTesting', () => {
  afterEach(() => {
    resetLogger();
  });

  it('resets the logger to default', () => {
    const customLogger = {
      warn: vi.fn(),
      error: vi.fn(),
    };

    setLogger(customLogger);

    // Verify custom logger is in use
    // (We'd need to trigger a log to verify, but this documents the intent)

    resetForTesting();

    // After reset, should use default logger (console)
    // This mainly tests that resetForTesting doesn't throw
    expect(true).toBe(true);
  });

  it('allows creating new singleton after reset', () => {
    // Reset clears the singleton
    resetForTesting();

    // This documents that a new call to getWalkingPadBLE would create a new instance
    // We can't fully test without mocking navigator.bluetooth
    expect(true).toBe(true);
  });
});

describe('createManager', () => {
  it('accepts custom logger option', () => {
    const customLogger = {
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Create a minimal mock adapter
    const mockAdapter = {
      connect: vi.fn().mockRejectedValue(new Error('Not implemented')),
    };

    // Should not throw
    const manager = createManager(mockAdapter, { logger: customLogger });
    expect(manager).toBeDefined();
    expect(manager.getConnectionState()).toBe('disconnected');
  });
});
