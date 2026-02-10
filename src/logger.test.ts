import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enableDebugLogging,
  getLogger,
  type Logger,
  resetLogger,
  setLogger,
} from './logger';

describe('Logger', () => {
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    resetLogger();
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    resetLogger();
  });

  it('default logger uses console methods', () => {
    const mockWarn = vi.fn();
    const mockError = vi.fn();
    console.warn = mockWarn;
    console.error = mockError;

    const logger = getLogger();
    logger.warn('test warning', 'extra');
    logger.error('test error', 'extra');

    expect(mockWarn).toHaveBeenCalledWith('test warning', 'extra');
    expect(mockError).toHaveBeenCalledWith('test error', 'extra');
  });

  it('setLogger replaces global logger', () => {
    const customLogger: Logger = {
      warn: vi.fn(),
      error: vi.fn(),
    };

    setLogger(customLogger);

    const logger = getLogger();
    expect(logger).toBe(customLogger);
  });

  it('getLogger returns current logger', () => {
    const logger1 = getLogger();
    const logger2 = getLogger();

    expect(logger1).toBe(logger2);
  });

  it('custom logger receives all log calls', () => {
    const customLogger: Logger = {
      warn: vi.fn(),
      error: vi.fn(),
    };

    setLogger(customLogger);
    const logger = getLogger();

    logger.warn('warning message', { data: 123 });
    logger.error('error message', new Error('test'));

    expect(customLogger.warn).toHaveBeenCalledWith('warning message', {
      data: 123,
    });
    expect(customLogger.error).toHaveBeenCalledWith(
      'error message',
      expect.any(Error),
    );
  });

  it('logger methods receive formatted messages', () => {
    const customLogger: Logger = {
      warn: vi.fn(),
      error: vi.fn(),
    };

    setLogger(customLogger);
    const logger = getLogger();

    logger.warn('[WalkingPadBLE] Test message:', 'value');
    logger.error('[WalkingPadBLE] Error:', 'details');

    expect(customLogger.warn).toHaveBeenCalledWith(
      '[WalkingPadBLE] Test message:',
      'value',
    );
    expect(customLogger.error).toHaveBeenCalledWith(
      '[WalkingPadBLE] Error:',
      'details',
    );
  });

  it('resetLogger restores default logger', () => {
    const customLogger: Logger = {
      warn: vi.fn(),
      error: vi.fn(),
    };

    setLogger(customLogger);
    expect(getLogger()).toBe(customLogger);

    resetLogger();
    const logger = getLogger();
    expect(logger).not.toBe(customLogger);

    // Verify default logger still works
    const mockWarn = vi.fn();
    console.warn = mockWarn;
    logger.warn('test');
    expect(mockWarn).toHaveBeenCalledWith('test');
  });

  describe('debug logging', () => {
    let originalConsoleDebug: typeof console.debug;

    beforeEach(() => {
      originalConsoleDebug = console.debug;
    });

    afterEach(() => {
      console.debug = originalConsoleDebug;
    });

    it('default logger has debug as no-op', () => {
      const mockDebug = vi.fn();
      console.debug = mockDebug;

      const logger = getLogger();
      logger.debug?.('test debug');

      // Debug should be silently dropped by default
      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('enableDebugLogging enables debug output', () => {
      const mockDebug = vi.fn();
      console.debug = mockDebug;

      enableDebugLogging();
      const logger = getLogger();
      logger.debug?.('test debug', 'extra');

      expect(mockDebug).toHaveBeenCalledWith('test debug', 'extra');
    });

    it('custom logger can provide debug method', () => {
      const customLogger: Logger = {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      setLogger(customLogger);
      const logger = getLogger();
      logger.debug?.('debug message', { data: 123 });

      expect(customLogger.debug).toHaveBeenCalledWith('debug message', {
        data: 123,
      });
    });

    it('custom logger without debug method works', () => {
      const customLogger: Logger = {
        warn: vi.fn(),
        error: vi.fn(),
      };

      setLogger(customLogger);
      const logger = getLogger();

      // Should not throw when debug is undefined
      expect(() => logger.debug?.('test')).not.toThrow();
    });

    it('enableDebugLogging preserves existing warn and error', () => {
      const mockWarn = vi.fn();
      const mockError = vi.fn();
      console.warn = mockWarn;
      console.error = mockError;

      enableDebugLogging();
      const logger = getLogger();

      logger.warn('warning');
      logger.error('error');

      expect(mockWarn).toHaveBeenCalledWith('warning');
      expect(mockError).toHaveBeenCalledWith('error');
    });
  });
});
