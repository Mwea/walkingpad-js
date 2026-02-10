import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toFullUuid } from '../constants';
import { resetLogger, setLogger } from '../logger';
import {
  createMemoryStorage,
  createNoOpStorage,
  type DeviceStorage,
} from '../storage';
import { createWebBluetoothAdapter } from './web-bluetooth';

// Mock navigator.bluetooth
interface MockBluetoothDevice {
  id?: string;
  name?: string;
  gatt?: {
    connect: () => Promise<MockGattServer>;
  };
}

interface MockGattServer {
  getPrimaryServices: () => Promise<unknown[]>;
  disconnect: () => void;
}

let mockRequestDevice: ReturnType<typeof vi.fn>;
let mockGetDevices: ReturnType<typeof vi.fn>;

function createMockDevice(
  options: {
    id?: string;
    name?: string;
    connectDelay?: number;
    connectShouldFail?: boolean;
  } = {},
): MockBluetoothDevice {
  const {
    id = 'device-123',
    name = 'WalkingPad',
    connectDelay = 0,
    connectShouldFail = false,
  } = options;

  return {
    id,
    name,
    gatt: {
      connect: async () => {
        if (connectDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, connectDelay));
        }
        if (connectShouldFail) {
          throw new Error('Connect failed');
        }
        return {
          getPrimaryServices: async () => [],
          disconnect: () => {},
        };
      },
    },
  };
}

function setupNavigatorBluetooth(
  device: MockBluetoothDevice | null = null,
): void {
  mockRequestDevice = vi.fn().mockImplementation(async () => {
    if (!device) {
      throw new Error('User cancelled');
    }
    return device;
  });

  mockGetDevices = vi.fn().mockImplementation(async () => {
    return device ? [device] : [];
  });

  Object.defineProperty(navigator, 'bluetooth', {
    value: {
      requestDevice: mockRequestDevice,
      getDevices: mockGetDevices,
    },
    configurable: true,
    writable: true,
  });
}

function clearNavigatorBluetooth(): void {
  Object.defineProperty(navigator, 'bluetooth', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

describe('createWebBluetoothAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    clearNavigatorBluetooth();
    vi.unstubAllGlobals();
  });

  describe('connect', () => {
    it('throws when Web Bluetooth is not available', async () => {
      clearNavigatorBluetooth();
      const adapter = createWebBluetoothAdapter();

      await expect(adapter.connect({})).rejects.toThrow(
        'Web Bluetooth not available',
      );
    });

    it('requests device with default name prefixes', async () => {
      const device = createMockDevice();
      setupNavigatorBluetooth(device);
      const adapter = createWebBluetoothAdapter();

      await adapter.connect({});

      expect(mockRequestDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            { namePrefix: 'Walking' },
            { namePrefix: 'KS' },
          ]),
        }),
      );
    });

    it('uses custom filters when provided', async () => {
      const device = createMockDevice();
      setupNavigatorBluetooth(device);
      const adapter = createWebBluetoothAdapter();

      await adapter.connect({
        filters: [{ name: 'MyDevice' }],
      });

      expect(mockRequestDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: [{ name: 'MyDevice' }],
        }),
      );
    });

    it('includes optional services for both protocols', async () => {
      const device = createMockDevice();
      setupNavigatorBluetooth(device);
      const adapter = createWebBluetoothAdapter();

      await adapter.connect({});

      const call = mockRequestDevice.mock.calls[0]![0]! as {
        optionalServices?: string[];
      };
      expect(call.optionalServices).toBeDefined();
      // Should include FTMS and standard services
      expect(call.optionalServices).toContainEqual(
        expect.stringContaining('1826'),
      ); // FTMS
      expect(call.optionalServices).toContainEqual(
        expect.stringContaining('fe00'),
      ); // Standard
    });

    it('throws when no GATT server on device', async () => {
      const device = { id: 'test', name: 'WalkingPad' }; // No gatt
      setupNavigatorBluetooth(device as unknown as MockBluetoothDevice);
      const adapter = createWebBluetoothAdapter();

      await expect(adapter.connect({})).rejects.toThrow('No GATT server');
    });

    it('saves device ID when rememberDevice is true', async () => {
      const device = createMockDevice({ id: 'remembered-device' });
      setupNavigatorBluetooth(device);

      // Use explicit memory storage to verify behavior
      const storage = createMemoryStorage();
      const adapter = createWebBluetoothAdapter({ storage });

      await adapter.connect({ rememberDevice: true });

      expect(storage.get()).toBe('remembered-device');
    });

    it('does not save device ID when rememberDevice is false', async () => {
      const device = createMockDevice({ id: 'not-remembered' });
      setupNavigatorBluetooth(device);
      const adapter = createWebBluetoothAdapter();

      await adapter.connect({ rememberDevice: false });

      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('handles localStorage errors gracefully', async () => {
      const device = createMockDevice();
      setupNavigatorBluetooth(device);
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('Storage disabled');
        },
        setItem: () => {
          throw new Error('Storage disabled');
        },
      });
      const adapter = createWebBluetoothAdapter();

      // Should not throw
      await expect(
        adapter.connect({ rememberDevice: true }),
      ).resolves.toBeDefined();
    });
  });

  describe('reconnect', () => {
    it('returns null when getDevices is not available', async () => {
      setupNavigatorBluetooth(createMockDevice());
      // Remove getDevices
      (navigator.bluetooth as unknown as { getDevices?: unknown }).getDevices =
        undefined;
      const adapter = createWebBluetoothAdapter();

      const result = await adapter.reconnect!();

      expect(result).toBeNull();
    });

    it('connects to remembered device when available', async () => {
      const device = createMockDevice({
        id: 'remembered-123',
        name: 'WalkingPad R1',
      });
      setupNavigatorBluetooth(device);
      vi.mocked(localStorage.getItem).mockReturnValue('remembered-123');
      const adapter = createWebBluetoothAdapter();

      const result = await adapter.reconnect!();

      expect(result).not.toBeNull();
    });

    it('falls back to WalkingPad-named device when no remembered device', async () => {
      const device = createMockDevice({
        id: 'walking-456',
        name: 'WalkingPad A1',
      });
      setupNavigatorBluetooth(device);
      vi.mocked(localStorage.getItem).mockReturnValue(null);
      const adapter = createWebBluetoothAdapter();

      const result = await adapter.reconnect!();

      expect(result).not.toBeNull();
    });

    it('matches devices starting with KS prefix', async () => {
      const device = createMockDevice({ id: 'ks-device', name: 'KS-FIT-1234' });
      setupNavigatorBluetooth(device);
      vi.mocked(localStorage.getItem).mockReturnValue(null);
      const adapter = createWebBluetoothAdapter();

      const result = await adapter.reconnect!();

      expect(result).not.toBeNull();
    });

    it('returns null when no matching devices found', async () => {
      const device = createMockDevice({ id: 'other', name: 'SomeOtherDevice' });
      setupNavigatorBluetooth(device);
      vi.mocked(localStorage.getItem).mockReturnValue(null);
      const adapter = createWebBluetoothAdapter();

      const result = await adapter.reconnect!();

      expect(result).toBeNull();
    });

    it('returns null when connection fails', async () => {
      // Use mock logger to prevent stderr output
      const mockLogger = { warn: vi.fn(), error: vi.fn() };
      setLogger(mockLogger);

      const device = createMockDevice({
        id: 'failing',
        name: 'WalkingPad',
        connectShouldFail: true,
      });
      setupNavigatorBluetooth(device);
      vi.mocked(localStorage.getItem).mockReturnValue('failing');
      const adapter = createWebBluetoothAdapter();

      const result = await adapter.reconnect!();

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Reconnect failed'),
        expect.any(String),
      );

      resetLogger();
    });
  });
});

describe('toFullUuid consolidation', () => {
  it('toFullUuid works with number input', () => {
    const result = toFullUuid(0x1826);
    expect(result).toBe('00001826-0000-1000-8000-00805f9b34fb');
  });

  it('toFullUuid works with string input', () => {
    const result = toFullUuid('fe00');
    expect(result).toBe('0000fe00-0000-1000-8000-00805f9b34fb');
  });

  it('toFullUuid pads short hex strings', () => {
    const result = toFullUuid('abc');
    expect(result).toBe('00000abc-0000-1000-8000-00805f9b34fb');
  });
});

describe('custom storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    clearNavigatorBluetooth();
    vi.unstubAllGlobals();
  });

  it('uses custom storage for saving device ID', async () => {
    const device = createMockDevice({ id: 'custom-device-id' });
    setupNavigatorBluetooth(device);

    const storage = createMemoryStorage();
    const adapter = createWebBluetoothAdapter({ storage });

    await adapter.connect({ rememberDevice: true });

    expect(storage.get()).toBe('custom-device-id');
    // Should NOT use localStorage
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('uses custom storage for reconnection', async () => {
    const device = createMockDevice({
      id: 'stored-device',
      name: 'WalkingPad',
    });
    setupNavigatorBluetooth(device);

    const storage = createMemoryStorage();
    storage.set('stored-device');

    const adapter = createWebBluetoothAdapter({ storage });
    const result = await adapter.reconnect!();

    expect(result).not.toBeNull();
    // Should NOT read from localStorage
    expect(localStorage.getItem).not.toHaveBeenCalled();
  });

  it('adapter.forgetDevice clears custom storage', async () => {
    const device = createMockDevice();
    setupNavigatorBluetooth(device);

    const storage = createMemoryStorage();
    storage.set('device-to-forget');

    const adapter = createWebBluetoothAdapter({ storage });
    adapter.forgetDevice!();

    expect(storage.get()).toBeNull();
  });

  it('no-op storage disables persistence', async () => {
    const device = createMockDevice({ id: 'no-persistence' });
    setupNavigatorBluetooth(device);

    const adapter = createWebBluetoothAdapter({ storage: createNoOpStorage() });
    await adapter.connect({ rememberDevice: true });

    // No storage should have been called
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('no-op storage returns null for reconnect preference', async () => {
    // Create a device that would NOT match by name
    const device = createMockDevice({
      id: 'stored-id',
      name: 'SomeOtherDevice',
    });
    setupNavigatorBluetooth(device);

    const adapter = createWebBluetoothAdapter({ storage: createNoOpStorage() });

    // Without stored ID and non-matching name, should return null
    const result = await adapter.reconnect!();

    expect(result).toBeNull();
  });

  it('allows custom DeviceStorage implementation', async () => {
    const device = createMockDevice({ id: 'impl-device' });
    setupNavigatorBluetooth(device);

    const customImpl: DeviceStorage = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      remove: vi.fn(),
    };

    const adapter = createWebBluetoothAdapter({ storage: customImpl });
    await adapter.connect({ rememberDevice: true });

    expect(customImpl.set).toHaveBeenCalledWith('impl-device');
  });
});
