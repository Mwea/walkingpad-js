import type { Logger } from './logger';
import * as transport from './transport';
import type { TransportSession, WalkingPadProtocol } from './types';

const supportsWeakRef = typeof WeakRef !== 'undefined';

export interface PollManagerOptions {
  /** Default polling interval in milliseconds */
  defaultIntervalMs: number;
  /** Timeout for write operations in milliseconds */
  writeTimeoutMs: number;
  /** Logger instance for error reporting */
  logger: Logger;
  /** Callback when a poll error occurs */
  onError: (error: Error) => void;
  /** Maximum consecutive errors before stopping polling */
  maxConsecutiveErrors?: number;
}

export interface PollStartOptions {
  /** Override the default polling interval */
  intervalMs?: number;
}

export interface PollManager {
  start(
    session: TransportSession,
    protocol: WalkingPadProtocol,
    options?: PollStartOptions,
  ): void;
  stop(): void;
  isPolling(): boolean;
}

/**
 * Creates a poll manager for standard protocol devices.
 *
 * @param options - Configuration options
 * @returns A poll manager instance
 */
export function createPollManager(options: PollManagerOptions): PollManager {
  const {
    defaultIntervalMs,
    writeTimeoutMs,
    logger,
    onError,
    maxConsecutiveErrors = 3,
  } = options;

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let sessionId = 0;

  function stop(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    sessionId = (sessionId + 1) % Number.MAX_SAFE_INTEGER;
  }

  function start(
    session: TransportSession,
    protocol: WalkingPadProtocol,
    startOptions: PollStartOptions = {},
  ): void {
    stop();

    const intervalMs = startOptions.intervalMs ?? defaultIntervalMs;

    const currentSessionId = sessionId;

    const sessionRef = supportsWeakRef
      ? new WeakRef(session)
      : { deref: () => session };
    const protocolRef = supportsWeakRef
      ? new WeakRef(protocol)
      : { deref: () => protocol };

    let consecutiveErrors = 0;

    pollTimer = setInterval(() => {
      if (currentSessionId !== sessionId) {
        return;
      }

      const currentSession = sessionRef.deref();
      const currentProtocol = protocolRef.deref();

      if (!currentSession || !currentProtocol) {
        stop();
        return;
      }

      const cmd = currentProtocol.cmdAskStats();
      if (cmd.byteLength === 0) {
        return;
      }

      transport
        .write(currentSession, cmd, writeTimeoutMs)
        .then(() => {
          consecutiveErrors = 0;
        })
        .catch((e: unknown) => {
          consecutiveErrors++;
          onError(e instanceof Error ? e : new Error(String(e)));

          if (consecutiveErrors >= maxConsecutiveErrors) {
            logger.warn(
              '[PollManager] Too many consecutive errors, stopping polling',
            );
            stop();
          }
        });
    }, intervalMs);
  }

  function isPolling(): boolean {
    return pollTimer !== null;
  }

  return {
    start,
    stop,
    isPolling,
  };
}
