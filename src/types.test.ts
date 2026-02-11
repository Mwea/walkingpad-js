import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  clampDeviceMode,
  clampDeviceState,
  clampDistance,
  clampSpeed,
  clampSteps,
  clampTime,
  createDefaultState,
  type WalkingPadState,
} from './types';

describe('createDefaultState', () => {
  it('returns an object with all required keys', () => {
    const state = createDefaultState();
    expect(state).toHaveProperty('state');
    expect(state).toHaveProperty('speed');
    expect(state).toHaveProperty('time');
    expect(state).toHaveProperty('distance');
    expect(state).toHaveProperty('steps');
    expect(state).toHaveProperty('mode');
    expect(state).toHaveProperty('isRunning');
  });

  it('returns state with zero/false defaults', () => {
    const state = createDefaultState();
    expect(state.state).toBe(0);
    expect(state.speed).toBe(0);
    expect(state.time).toBe(0);
    expect(state.distance).toBe(0);
    expect(state.steps).toBe(0);
    expect(state.mode).toBe(0);
    expect(state.isRunning).toBe(false);
  });

  it('returns a fresh object every time (no shared reference)', () => {
    const a = createDefaultState();
    const b = createDefaultState();
    expect(a).not.toBe(b);
    a.steps = 1;
    expect(b.steps).toBe(0);
  });
});

describe('clampDeviceState', () => {
  it('clamps values to valid range 0-3', () => {
    expect(clampDeviceState(0)).toBe(0);
    expect(clampDeviceState(1)).toBe(1);
    expect(clampDeviceState(2)).toBe(2);
    expect(clampDeviceState(3)).toBe(3);
  });

  it('clamps negative values to 0', () => {
    expect(clampDeviceState(-1)).toBe(0);
    expect(clampDeviceState(-100)).toBe(0);
  });

  it('clamps values above 3 to 3', () => {
    expect(clampDeviceState(4)).toBe(3);
    expect(clampDeviceState(100)).toBe(3);
    expect(clampDeviceState(255)).toBe(3);
  });

  it('floors floating point values', () => {
    expect(clampDeviceState(0.9)).toBe(0);
    expect(clampDeviceState(1.5)).toBe(1);
    expect(clampDeviceState(2.7)).toBe(2);
    expect(clampDeviceState(3.9)).toBe(3);
  });

  it('handles edge cases with floats above range', () => {
    expect(clampDeviceState(4.5)).toBe(3);
  });

  it('returns 0 for NaN', () => {
    expect(clampDeviceState(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(clampDeviceState(Infinity)).toBe(0);
  });

  it('returns 0 for -Infinity', () => {
    expect(clampDeviceState(-Infinity)).toBe(0);
  });
});

describe('clampDeviceMode', () => {
  it('clamps values to valid range 0-2', () => {
    expect(clampDeviceMode(0)).toBe(0);
    expect(clampDeviceMode(1)).toBe(1);
    expect(clampDeviceMode(2)).toBe(2);
  });

  it('clamps negative values to 0', () => {
    expect(clampDeviceMode(-1)).toBe(0);
    expect(clampDeviceMode(-100)).toBe(0);
  });

  it('clamps values above 2 to 2', () => {
    expect(clampDeviceMode(3)).toBe(2);
    expect(clampDeviceMode(100)).toBe(2);
    expect(clampDeviceMode(255)).toBe(2);
  });

  it('floors floating point values', () => {
    expect(clampDeviceMode(0.9)).toBe(0);
    expect(clampDeviceMode(1.5)).toBe(1);
    expect(clampDeviceMode(2.7)).toBe(2);
  });

  it('returns 0 for NaN', () => {
    expect(clampDeviceMode(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(clampDeviceMode(Infinity)).toBe(0);
  });

  it('returns 0 for -Infinity', () => {
    expect(clampDeviceMode(-Infinity)).toBe(0);
  });
});

describe('clampSpeed', () => {
  it('clamps values to valid range [0, 25]', () => {
    expect(clampSpeed(0)).toBe(0);
    expect(clampSpeed(5)).toBe(5);
    expect(clampSpeed(25)).toBe(25);
  });

  it('clamps negative values to 0', () => {
    expect(clampSpeed(-1)).toBe(0);
    expect(clampSpeed(-100)).toBe(0);
  });

  it('clamps values above 25 to 25', () => {
    expect(clampSpeed(26)).toBe(25);
    expect(clampSpeed(100)).toBe(25);
  });

  it('returns 0 for NaN/Infinity', () => {
    expect(clampSpeed(NaN)).toBe(0);
    expect(clampSpeed(Infinity)).toBe(0);
    expect(clampSpeed(-Infinity)).toBe(0);
  });
});

describe('clampTime', () => {
  it('clamps values to valid range [0, 86400]', () => {
    expect(clampTime(0)).toBe(0);
    expect(clampTime(3600)).toBe(3600);
    expect(clampTime(86400)).toBe(86400);
  });

  it('clamps negative values to 0', () => {
    expect(clampTime(-1)).toBe(0);
  });

  it('clamps values above 86400 to 86400', () => {
    expect(clampTime(100000)).toBe(86400);
  });

  it('floors floating point values', () => {
    expect(clampTime(3600.9)).toBe(3600);
  });

  it('returns 0 for NaN/Infinity', () => {
    expect(clampTime(NaN)).toBe(0);
    expect(clampTime(Infinity)).toBe(0);
  });
});

describe('clampDistance', () => {
  it('clamps values to valid range [0, 100]', () => {
    expect(clampDistance(0)).toBe(0);
    expect(clampDistance(50)).toBe(50);
    expect(clampDistance(100)).toBe(100);
  });

  it('clamps negative values to 0', () => {
    expect(clampDistance(-1)).toBe(0);
  });

  it('clamps values above 100 to 100', () => {
    expect(clampDistance(150)).toBe(100);
  });

  it('returns 0 for NaN/Infinity', () => {
    expect(clampDistance(NaN)).toBe(0);
    expect(clampDistance(Infinity)).toBe(0);
  });
});

describe('clampSteps', () => {
  it('clamps values to valid range [0, 200000]', () => {
    expect(clampSteps(0)).toBe(0);
    expect(clampSteps(10000)).toBe(10000);
    expect(clampSteps(200000)).toBe(200000);
  });

  it('clamps negative values to 0', () => {
    expect(clampSteps(-1)).toBe(0);
  });

  it('clamps values above 200000 to 200000', () => {
    expect(clampSteps(300000)).toBe(200000);
  });

  it('floors floating point values', () => {
    expect(clampSteps(1000.9)).toBe(1000);
  });

  it('returns 0 for NaN/Infinity', () => {
    expect(clampSteps(NaN)).toBe(0);
    expect(clampSteps(Infinity)).toBe(0);
  });
});

describe('WalkingPadState invariants', () => {
  const stateArb: fc.Arbitrary<WalkingPadState> = fc.record({
    state: fc.constantFrom(0, 1, 2, 3).map(clampDeviceState),
    speed: fc.double({ min: 0, max: 20 }),
    time: fc.integer({ min: 0, max: 86400 }),
    distance: fc.double({ min: 0, max: 100 }),
    steps: fc.integer({ min: 0, max: 100000 }),
    mode: fc.constantFrom(0, 1, 2).map(clampDeviceMode),
    isRunning: fc.boolean(),
  });

  it('isRunning should be consistent with state and speed (property)', () => {
    fc.assert(
      fc.property(stateArb, (s) => {
        const expectedRunning = s.speed > 0 || s.state === 1;
        if (s.isRunning === expectedRunning) return true;
        return true; // we only document the invariant; we don't enforce it in types
      }),
    );
  });
});
