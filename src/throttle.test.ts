import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThrottledSetSpeed, throttleAsync } from './throttle';

describe('throttleAsync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes immediately on first call', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const throttled = throttleAsync(fn, 100);

    await throttled('arg1');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('arg1');
  });

  it('throttles rapid calls', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const throttled = throttleAsync(fn, 100);

    // First call executes immediately
    const promise1 = throttled('first');
    await promise1;
    expect(fn).toHaveBeenCalledTimes(1);

    // Second call should be throttled
    const promise2 = throttled('second');

    // Not executed yet
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance time to allow throttled call
    await vi.advanceTimersByTimeAsync(100);
    await promise2;

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('second');
  });

  it('replaces pending call with newer one', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const throttled = throttleAsync(fn, 100);

    // First call
    await throttled('first');

    // Multiple rapid calls - catch rejections immediately to avoid unhandled rejections
    const promise2 = throttled('second').catch(() => 'superseded');
    const promise3 = throttled('third').catch(() => 'superseded');
    const promise4 = throttled('fourth');

    // Advance time
    await vi.advanceTimersByTimeAsync(100);

    // The superseded calls should have been caught
    expect(await promise2).toBe('superseded');
    expect(await promise3).toBe('superseded');

    // Only the last call should execute
    await promise4;
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('fourth');
  });

  it('allows calls after throttle period expires', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const throttled = throttleAsync(fn, 100);

    await throttled('first');
    expect(fn).toHaveBeenCalledTimes(1);

    // Wait for throttle to expire
    await vi.advanceTimersByTimeAsync(100);

    // Next call should execute immediately
    await throttled('second');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('propagates errors from the wrapped function', async () => {
    const error = new Error('Test error');
    const fn = vi.fn().mockRejectedValue(error);
    const throttled = throttleAsync(fn, 100);

    await expect(throttled('arg')).rejects.toThrow('Test error');
  });
});

describe('createThrottledSetSpeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses default interval of 100ms', async () => {
    const setSpeed = vi.fn().mockResolvedValue(undefined);
    const throttled = createThrottledSetSpeed(setSpeed);

    await throttled(3.0);
    expect(setSpeed).toHaveBeenCalledTimes(1);

    // Rapid calls should be throttled
    const promise = throttled(3.5);
    expect(setSpeed).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    await promise;
    expect(setSpeed).toHaveBeenCalledTimes(2);
  });

  it('respects custom interval', async () => {
    const setSpeed = vi.fn().mockResolvedValue(undefined);
    const throttled = createThrottledSetSpeed(setSpeed, { intervalMs: 200 });

    await throttled(3.0);

    const promise = throttled(3.5);

    // After 100ms, still throttled
    await vi.advanceTimersByTimeAsync(100);
    expect(setSpeed).toHaveBeenCalledTimes(1);

    // After 200ms total, should execute
    await vi.advanceTimersByTimeAsync(100);
    await promise;
    expect(setSpeed).toHaveBeenCalledTimes(2);
  });

  it('only sends the latest speed value', async () => {
    const setSpeed = vi.fn().mockResolvedValue(undefined);
    const throttled = createThrottledSetSpeed(setSpeed, { intervalMs: 100 });

    await throttled(1.0);

    // Simulate rapid slider movement
    throttled(2.0).catch(() => {}); // Will be superseded
    throttled(3.0).catch(() => {}); // Will be superseded
    const finalPromise = throttled(4.0);

    await vi.advanceTimersByTimeAsync(100);
    await finalPromise;

    expect(setSpeed).toHaveBeenCalledTimes(2);
    expect(setSpeed).toHaveBeenLastCalledWith(4.0);
  });
});
