export type EventMap = { [key: string]: unknown };

export interface TypedEventEmitter<T extends EventMap> {
  on<K extends keyof T>(event: K, callback: (data: T[K]) => void): () => void;
  once<K extends keyof T>(event: K, callback: (data: T[K]) => void): () => void;
  off<K extends keyof T>(event: K, callback: (data: T[K]) => void): void;
  removeAllListeners<K extends keyof T>(event?: K): void;
  emit<K extends keyof T>(event: K, data: T[K]): void;
  listenerCount<K extends keyof T>(event: K): number;
}

export interface EventEmitterLogger {
  error(message: string, ...args: unknown[]): void;
}

export interface EventEmitterOptions {
  /** Logger for error reporting. Defaults to console. */
  logger?: EventEmitterLogger;
}

export function createEventEmitter<T extends EventMap>(
  options: EventEmitterOptions = {},
): TypedEventEmitter<T> {
  const logger = options.logger ?? { error: console.error.bind(console) };
  const listeners = new Map<keyof T, Set<(data: unknown) => void>>();

  function getListenerSet<K extends keyof T>(
    event: K,
  ): Set<(data: unknown) => void> {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    return set;
  }

  function on<K extends keyof T>(
    event: K,
    callback: (data: T[K]) => void,
  ): () => void {
    const set = getListenerSet(event);
    set.add(callback as (data: unknown) => void);
    return () => off(event, callback);
  }

  function once<K extends keyof T>(
    event: K,
    callback: (data: T[K]) => void,
  ): () => void {
    const wrapper = (data: T[K]) => {
      off(event, wrapper);
      callback(data);
    };
    return on(event, wrapper);
  }

  function off<K extends keyof T>(
    event: K,
    callback: (data: T[K]) => void,
  ): void {
    const set = listeners.get(event);
    if (set) {
      set.delete(callback as (data: unknown) => void);
    }
  }

  function removeAllListeners<K extends keyof T>(event?: K): void {
    if (event !== undefined) {
      listeners.delete(event);
    } else {
      listeners.clear();
    }
  }

  function emit<K extends keyof T>(event: K, data: T[K]): void {
    const set = listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(data);
        } catch (err) {
          queueMicrotask(() => {
            logger.error('[EventEmitter] Listener threw an error:', err);
          });
        }
      }
    }
  }

  function listenerCount<K extends keyof T>(event: K): number {
    const set = listeners.get(event);
    return set ? set.size : 0;
  }

  return {
    on,
    once,
    off,
    removeAllListeners,
    emit,
    listenerCount,
  };
}

export type WalkingPadEvents = {
  state: import('./types').WalkingPadState;
  error: Error;
  connectionStateChange: {
    from: import('./types').ConnectionState;
    to: import('./types').ConnectionState;
  };
};

/**
 * Adapts a TypedEventEmitter to an EventTarget for browser integration.
 * Allows using addEventListener/removeEventListener with the emitter.
 * Properly tracks listener references and unsubscribes from emitter when
 * the last listener for an event type is removed.
 */
export function toEventTarget<T extends EventMap>(
  emitter: TypedEventEmitter<T>,
): EventTarget {
  const target = new EventTarget();
  const subscriptions = new Map<keyof T, () => void>();
  // Track actual listener references per event type to handle deduplication correctly
  const trackedListeners = new Map<
    keyof T,
    Set<EventListenerOrEventListenerObject>
  >();

  // Proxy addEventListener to subscribe to the emitter
  const originalAddEventListener = target.addEventListener.bind(target);
  const originalRemoveEventListener = target.removeEventListener.bind(target);

  target.addEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (listener === null) {
      return; // EventTarget ignores null listeners
    }

    const eventKey = type as keyof T;
    let listeners = trackedListeners.get(eventKey);
    if (!listeners) {
      listeners = new Set();
      trackedListeners.set(eventKey, listeners);
    }

    // Check if this exact listener was already added (EventTarget deduplicates)
    const wasAlreadyAdded = listeners.has(listener);

    // Subscribe to emitter if this is the first listener for this event
    if (listeners.size === 0) {
      const unsubscribe = emitter.on(eventKey, (data) => {
        target.dispatchEvent(new CustomEvent(type, { detail: data }));
      });
      subscriptions.set(eventKey, unsubscribe);
    }

    // Only track if not already tracked (mirrors EventTarget deduplication)
    if (!wasAlreadyAdded) {
      listeners.add(listener);
    }

    originalAddEventListener(type, listener, options);
  };

  target.removeEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) => {
    if (listener === null) {
      return;
    }

    const eventKey = type as keyof T;
    const listeners = trackedListeners.get(eventKey);

    originalRemoveEventListener(type, listener, options);

    // Only decrement if we were actually tracking this listener
    if (listeners?.has(listener)) {
      listeners.delete(listener);

      // Unsubscribe from emitter when last listener is removed
      if (listeners.size === 0) {
        const unsubscribe = subscriptions.get(eventKey);
        if (unsubscribe) {
          unsubscribe();
          subscriptions.delete(eventKey);
        }
      }
    }
  };

  return target;
}
