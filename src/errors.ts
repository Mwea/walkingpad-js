/**
 * Custom error class for timeout operations
 */
export class TimeoutError extends Error {
  constructor(
    public readonly operation: string,
    public readonly timeout: number,
  ) {
    super(`${operation} timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when speed value is outside valid range
 */
export class SpeedOutOfRangeError extends RangeError {
  constructor(
    public readonly value: number,
    public readonly min: number,
    public readonly max: number,
  ) {
    super(`Speed ${value} km/h is out of range [${min}, ${max}]`);
    this.name = 'SpeedOutOfRangeError';
  }
}

/**
 * Error thrown when attempting an operation that requires a connection
 * but the device is not connected.
 */
export class NotConnectedError extends Error {
  constructor() {
    super('Not connected to device');
    this.name = 'NotConnectedError';
  }
}

/**
 * Normalizes any thrown value into an Error instance.
 * Ensures consistent error handling throughout the codebase.
 */
export function normalizeError(e: unknown): Error {
  if (e instanceof Error) {
    return e;
  }

  if (e === null) {
    return new Error('null');
  }

  if (e === undefined) {
    return new Error('undefined');
  }

  if (typeof e === 'string') {
    return new Error(e);
  }

  if (typeof e === 'object') {
    try {
      return new Error(JSON.stringify(e));
    } catch {
      // Circular reference or other JSON error
      return new Error(String(e));
    }
  }

  return new Error(String(e));
}

/**
 * Wraps a promise with a timeout.
 * If the promise doesn't resolve/reject within the specified time,
 * rejects with a TimeoutError.
 *
 * **Important:** This does NOT cancel the underlying operation.
 * The original promise continues running in the background even after
 * timeout. For BLE operations, this means a write may still complete
 * after the timeout rejects. Callers should handle this if needed
 * (e.g., by checking connection state before processing results).
 *
 * @param promise - The promise to wrap with a timeout
 * @param ms - Timeout duration in milliseconds
 * @param label - Descriptive label for the operation (used in error message)
 * @returns A promise that rejects with TimeoutError if the timeout expires first
 * @throws {TimeoutError} If the operation times out
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(label, ms));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}
