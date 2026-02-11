/**
 * Re-export common errors from web-ble-kit.
 */
export {
  AbortError,
  NotConnectedError,
  raceWithAbort,
  TimeoutError,
  withTimeout,
} from 'web-ble-kit';

/**
 * Error thrown when speed value is outside valid range.
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
