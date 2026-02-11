import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeError,
  SpeedOutOfRangeError,
  TimeoutError,
  withTimeout,
} from './errors';

describe('normalizeError', () => {
  it('returns the same Error instance when given an Error', () => {
    const err = new Error('test error');
    const result = normalizeError(err);
    expect(result).toBe(err);
  });

  it('wraps string in Error with original as message', () => {
    const result = normalizeError('string error');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('string error');
  });

  it('wraps number in Error with stringified value', () => {
    const result = normalizeError(42);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('42');
  });

  it('wraps null in Error with descriptive message', () => {
    const result = normalizeError(null);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('null');
  });

  it('wraps undefined in Error with descriptive message', () => {
    const result = normalizeError(undefined);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('undefined');
  });

  it('wraps object in Error with JSON representation', () => {
    const result = normalizeError({ code: 123, reason: 'failed' });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('code');
    expect(result.message).toContain('123');
  });

  it('handles circular objects gracefully', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj['self'] = obj;
    const result = normalizeError(obj);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('[object Object]');
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with value when promise completes before timeout', async () => {
    const promise = Promise.resolve('success');
    const result = withTimeout(promise, 1000, 'test operation');

    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe('success');
  });

  it('rejects with TimeoutError when timeout expires', async () => {
    const neverResolves = new Promise<string>(() => {});
    const result = withTimeout(neverResolves, 100, 'slow operation');

    vi.advanceTimersByTime(100);

    await expect(result).rejects.toBeInstanceOf(TimeoutError);
  });

  it('includes operation label in timeout error message', async () => {
    const neverResolves = new Promise<string>(() => {});
    const result = withTimeout(neverResolves, 100, 'BLE connect');

    vi.advanceTimersByTime(100);

    await expect(result).rejects.toThrow('BLE connect');
  });

  it('includes timeout duration in error message', async () => {
    const neverResolves = new Promise<string>(() => {});
    const result = withTimeout(neverResolves, 5000, 'operation');

    vi.advanceTimersByTime(5000);

    await expect(result).rejects.toThrow('5000');
  });

  it('propagates rejection from original promise', async () => {
    const error = new Error('original error');
    const promise = Promise.reject(error);
    const result = withTimeout(promise, 1000, 'test');

    await expect(result).rejects.toBe(error);
  });

  it('clears timeout when promise resolves', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const promise = Promise.resolve('done');
    await withTimeout(promise, 1000, 'test');

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('clears timeout when promise rejects', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const promise = Promise.reject(new Error('fail'));
    try {
      await withTimeout(promise, 1000, 'test');
    } catch {
      // expected
    }

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});

describe('TimeoutError', () => {
  it('is instanceof Error', () => {
    const err = new TimeoutError('test', 1000);
    expect(err).toBeInstanceOf(Error);
  });

  it('has name property set to TimeoutError', () => {
    const err = new TimeoutError('test', 1000);
    expect(err.name).toBe('TimeoutError');
  });

  it('exposes operation and timeout properties', () => {
    const err = new TimeoutError('my operation', 5000);
    expect(err.operation).toBe('my operation');
    expect(err.timeout).toBe(5000);
  });
});

describe('SpeedOutOfRangeError', () => {
  it('is instanceof RangeError', () => {
    const err = new SpeedOutOfRangeError(10, 0.5, 6);
    expect(err).toBeInstanceOf(RangeError);
  });

  it('is instanceof Error', () => {
    const err = new SpeedOutOfRangeError(10, 0.5, 6);
    expect(err).toBeInstanceOf(Error);
  });

  it('has name property set to SpeedOutOfRangeError', () => {
    const err = new SpeedOutOfRangeError(10, 0.5, 6);
    expect(err.name).toBe('SpeedOutOfRangeError');
  });

  it('exposes value, min, and max properties', () => {
    const err = new SpeedOutOfRangeError(10, 0.5, 6);
    expect(err.value).toBe(10);
    expect(err.min).toBe(0.5);
    expect(err.max).toBe(6);
  });

  it('includes all values in error message', () => {
    const err = new SpeedOutOfRangeError(10, 0.5, 6);
    expect(err.message).toContain('10');
    expect(err.message).toContain('0.5');
    expect(err.message).toContain('6');
  });
});
