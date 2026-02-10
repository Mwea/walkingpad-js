/**
 * Creates a throttled version of an async function.
 * Ensures the function is not called more than once per `intervalMs`.
 * If called while throttled, the latest call is queued and executed after the interval.
 *
 * @param fn - The async function to throttle
 * @param intervalMs - Minimum interval between calls in milliseconds
 * @returns A throttled version of the function
 */
export function throttleAsync<
  T extends (...args: Parameters<T>) => Promise<void>,
>(fn: T, intervalMs: number): T {
  let lastCallTime = 0;
  let pendingCall: {
    args: Parameters<T>;
    resolve: () => void;
    reject: (e: Error) => void;
  } | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttled = async (...args: Parameters<T>): Promise<void> => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall >= intervalMs) {
      lastCallTime = now;
      return fn(...args);
    }

    if (pendingCall) {
      pendingCall.reject(new Error('Superseded by newer call'));
    }

    return new Promise<void>((resolve, reject) => {
      pendingCall = { args, resolve, reject };

      if (!timeoutId) {
        const delay = intervalMs - timeSinceLastCall;
        timeoutId = setTimeout(() => {
          timeoutId = null;
          if (pendingCall) {
            const {
              args: pendingArgs,
              resolve: pendingResolve,
              reject: pendingReject,
            } = pendingCall;
            pendingCall = null;
            lastCallTime = Date.now();
            fn(...pendingArgs)
              .then(pendingResolve)
              .catch(pendingReject);
          }
        }, delay);
      }
    });
  };

  return throttled as T;
}

/**
 * Options for creating a throttled setSpeed function.
 */
export interface ThrottledSetSpeedOptions {
  /**
   * Minimum interval between setSpeed calls in milliseconds.
   * @default 100
   */
  intervalMs?: number;
}

/**
 * Creates a throttled version of a setSpeed function.
 * Useful for UI sliders that fire rapidly.
 *
 * @param setSpeed - The original setSpeed function
 * @param options - Throttling options
 * @returns A throttled setSpeed function
 *
 * @example
 * ```typescript
 * const throttledSetSpeed = createThrottledSetSpeed(
 *   (kmh) => manager.setSpeed(kmh),
 *   { intervalMs: 100 }
 * );
 *
 * // Safe to call rapidly from a slider
 * slider.oninput = (e) => {
 *   throttledSetSpeed(parseFloat(e.target.value));
 * };
 * ```
 */
export function createThrottledSetSpeed(
  setSpeed: (kmh: number) => Promise<void>,
  options: ThrottledSetSpeedOptions = {},
): (kmh: number) => Promise<void> {
  const { intervalMs = 100 } = options;
  return throttleAsync(setSpeed, intervalMs);
}
