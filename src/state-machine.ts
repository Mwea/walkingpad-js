import { getLogger } from './logger';
import type { ConnectionState } from './types';

export type TransitionCallback = (
  from: ConnectionState,
  to: ConnectionState,
) => void;

export interface StateMachine {
  getState(): ConnectionState;
  canTransition(to: ConnectionState): boolean;
  transition(to: ConnectionState): void;
  onTransition(callback: TransitionCallback): () => void;
}

/**
 * Valid state transitions:
 * - disconnected -> connecting
 * - connecting -> connected | error | disconnected (cancelled)
 * - connected -> disconnected
 * - error -> disconnected | connecting
 */
const VALID_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
  disconnected: ['connecting'],
  connecting: ['connected', 'error', 'disconnected'],
  connected: ['disconnected'],
  error: ['disconnected', 'connecting'],
};

/**
 * Creates a new state machine for connection management.
 * @param initialState The initial state (default: 'disconnected')
 */
export function createStateMachine(
  initialState: ConnectionState = 'disconnected',
): StateMachine {
  let state: ConnectionState = initialState;
  const callbacks = new Set<TransitionCallback>();

  function getState(): ConnectionState {
    return state;
  }

  function canTransition(to: ConnectionState): boolean {
    const validTargets = VALID_TRANSITIONS[state];
    return validTargets.includes(to);
  }

  function transition(to: ConnectionState): void {
    if (!canTransition(to)) {
      throw new Error(`Invalid state transition: ${state} -> ${to}`);
    }
    const from = state;
    state = to;

    for (const cb of callbacks) {
      try {
        cb(from, to);
      } catch (e) {
        getLogger().error('[StateMachine] Transition callback error:', e);
      }
    }
  }

  function onTransition(callback: TransitionCallback): () => void {
    callbacks.add(callback);
    return () => {
      callbacks.delete(callback);
    };
  }

  return {
    getState,
    canTransition,
    transition,
    onTransition,
  };
}
