/**
 * Logger interface for customizable logging.
 * Allows library users to integrate with their own logging infrastructure.
 */
export interface Logger {
  /**
   * Log debug information for development troubleshooting.
   * Optional - if not provided, debug messages are silently dropped.
   */
  debug?(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noop = () => {};

const defaultLogger: Logger = {
  debug: noop,
  warn: (msg, ...args) => console.warn(msg, ...args),
  error: (msg, ...args) => console.error(msg, ...args),
};

let currentLogger: Logger = defaultLogger;

export function getLogger(): Logger {
  return currentLogger;
}

export function setLogger(logger: Logger): void {
  currentLogger = logger;
}

export function resetLogger(): void {
  currentLogger = defaultLogger;
}

export function enableDebugLogging(): void {
  const current = currentLogger;
  currentLogger = {
    ...current,
    debug: (msg, ...args) => console.debug(msg, ...args),
  };
}
