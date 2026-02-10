import type {
  BLEAdapter,
  BLEConnectedSession,
  BLEGATTCharacteristic,
  BLEGATTService,
  ConnectOptions,
  TransportSession,
} from './types';

export interface MockCharacteristicOptions {
  uuid?: string;
  properties?: {
    notify?: boolean;
    indicate?: boolean;
    write?: boolean;
    writeWithoutResponse?: boolean;
  };
  writeDelay?: number;
  writeShouldFail?: boolean;
  writeFailError?: Error;
  startNotificationsShouldFail?: boolean;
  startNotificationsFailError?: Error;
}

export interface MockCharacteristic extends BLEGATTCharacteristic {
  simulateNotification(data: ArrayBuffer): void;
  getWrittenValues(): Array<ArrayBuffer | Uint8Array | DataView>;
  getListenerCount(): number;
  wasStartNotificationsCalled(): boolean;
  wasStopNotificationsCalled(): boolean;
  /** Set a dynamic write delay (number in ms or Promise to await) */
  setWriteDelay(delay: number | Promise<void>): void;
}

export function createMockCharacteristic(
  options: MockCharacteristicOptions = {},
): MockCharacteristic {
  const {
    uuid = '0000fe01-0000-1000-8000-00805f9b34fb',
    properties = { notify: true, write: true },
    writeDelay = 0,
    writeShouldFail = false,
    writeFailError = new Error('Write failed'),
    startNotificationsShouldFail = false,
    startNotificationsFailError = new Error('startNotifications failed'),
  } = options;

  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const writtenValues: Array<ArrayBuffer | Uint8Array | DataView> = [];
  let currentValue: DataView | undefined;
  let startNotificationsCalled = false;
  let stopNotificationsCalled = false;
  let dynamicWriteDelay: number | Promise<void> = writeDelay;

  return {
    uuid,
    properties,

    get value(): DataView | undefined {
      return currentValue;
    },

    async writeValueWithResponse(
      value: ArrayBuffer | Uint8Array | DataView,
    ): Promise<void> {
      const delay = dynamicWriteDelay;
      if (typeof delay === 'number' && delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (delay instanceof Promise) {
        await delay;
      }
      if (writeShouldFail) {
        throw writeFailError;
      }
      writtenValues.push(value);
    },

    setWriteDelay(delay: number | Promise<void>): void {
      dynamicWriteDelay = delay;
    },

    async startNotifications(): Promise<void> {
      startNotificationsCalled = true;
      if (startNotificationsShouldFail) {
        throw startNotificationsFailError;
      }
    },

    async stopNotifications(): Promise<void> {
      stopNotificationsCalled = true;
    },

    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
    ): void {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(listener);
    },

    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
    ): void {
      listeners.get(type)?.delete(listener);
    },

    simulateNotification(data: ArrayBuffer): void {
      currentValue = new DataView(data);
      const typeListeners = listeners.get('characteristicvaluechanged');
      if (typeListeners) {
        const event = { target: this } as unknown as Event;
        for (const listener of typeListeners) {
          if (typeof listener === 'function') {
            listener(event);
          } else {
            listener.handleEvent(event);
          }
        }
      }
    },

    getWrittenValues(): Array<ArrayBuffer | Uint8Array | DataView> {
      return [...writtenValues];
    },

    getListenerCount(): number {
      let count = 0;
      for (const set of listeners.values()) {
        count += set.size;
      }
      return count;
    },

    wasStartNotificationsCalled(): boolean {
      return startNotificationsCalled;
    },

    wasStopNotificationsCalled(): boolean {
      return stopNotificationsCalled;
    },
  };
}

export interface MockServiceOptions {
  uuid?: string;
  characteristics?: BLEGATTCharacteristic[];
}

export function createMockService(
  options: MockServiceOptions = {},
): BLEGATTService {
  const {
    uuid = '0000fe00-0000-1000-8000-00805f9b34fb',
    characteristics = [],
  } = options;

  return {
    uuid,
    async getCharacteristics(): Promise<BLEGATTCharacteristic[]> {
      return characteristics;
    },
  };
}

export interface MockSessionOptions {
  services?: BLEGATTService[];
  disconnectShouldFail?: boolean;
  disconnectFailError?: Error;
}

export interface MockConnectedSession extends BLEConnectedSession {
  wasDisconnectCalled(): boolean;
}

export function createMockConnectedSession(
  options: MockSessionOptions = {},
): MockConnectedSession {
  const {
    services = [],
    disconnectShouldFail = false,
    disconnectFailError = new Error('Disconnect failed'),
  } = options;

  let disconnectCalled = false;

  return {
    async getPrimaryServices(): Promise<BLEGATTService[]> {
      return services;
    },

    async disconnect(): Promise<void> {
      disconnectCalled = true;
      if (disconnectShouldFail) {
        throw disconnectFailError;
      }
    },

    wasDisconnectCalled(): boolean {
      return disconnectCalled;
    },
  };
}

export interface MockAdapterOptions {
  connectShouldFail?: boolean;
  connectFailError?: Error;
  connectDelay?: number;
  reconnectShouldFail?: boolean;
  reconnectReturnsNull?: boolean;
  session?: BLEConnectedSession;
}

export interface MockAdapter extends BLEAdapter {
  getConnectCallCount(): number;
  getReconnectCallCount(): number;
  getLastConnectOptions(): ConnectOptions | undefined;
  setSession(session: BLEConnectedSession): void;
}

export function createMockAdapter(
  options: MockAdapterOptions = {},
): MockAdapter {
  const {
    connectShouldFail = false,
    connectFailError = new Error('Connect failed'),
    connectDelay = 0,
    reconnectShouldFail = false,
    reconnectReturnsNull = false,
  } = options;

  let session = options.session ?? createMockConnectedSession();
  let connectCallCount = 0;
  let reconnectCallCount = 0;
  let lastConnectOptions: ConnectOptions | undefined;

  return {
    async connect(opts: ConnectOptions): Promise<BLEConnectedSession> {
      connectCallCount++;
      lastConnectOptions = opts;

      if (connectDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, connectDelay));
      }

      if (connectShouldFail) {
        throw connectFailError;
      }

      return session;
    },

    async reconnect(): Promise<BLEConnectedSession | null> {
      reconnectCallCount++;

      if (reconnectShouldFail) {
        throw new Error('Reconnect failed');
      }

      if (reconnectReturnsNull) {
        return null;
      }

      return session;
    },

    getConnectCallCount(): number {
      return connectCallCount;
    },

    getReconnectCallCount(): number {
      return reconnectCallCount;
    },

    getLastConnectOptions(): ConnectOptions | undefined {
      return lastConnectOptions;
    },

    setSession(newSession: BLEConnectedSession): void {
      session = newSession;
    },
  };
}

export interface MockTransportSessionOptions {
  serviceUuids?: string[];
  writeChar?: MockCharacteristic;
  notifyChar?: MockCharacteristic;
  controlPointChar?: MockCharacteristic | null;
}

export interface MockTransportSession extends TransportSession {
  writeChar: MockCharacteristic;
  notifyChar: MockCharacteristic;
  controlPointChar: MockCharacteristic | null;
  wasDisconnectCalled(): boolean;
}

export function createMockTransportSession(
  options: MockTransportSessionOptions = {},
): MockTransportSession {
  const {
    serviceUuids = ['0000fe00-0000-1000-8000-00805f9b34fb'],
    writeChar = createMockCharacteristic({
      uuid: '0000fe01-0000-1000-8000-00805f9b34fb',
    }),
    notifyChar = createMockCharacteristic({
      uuid: '0000fe02-0000-1000-8000-00805f9b34fb',
      properties: { notify: true },
    }),
    controlPointChar = null,
  } = options;

  let disconnectCalled = false;

  return {
    serviceUuids,
    writeChar,
    notifyChar,
    controlPointChar,

    async disconnect(): Promise<void> {
      disconnectCalled = true;
    },

    wasDisconnectCalled(): boolean {
      return disconnectCalled;
    },
  };
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export interface MockConsoleError {
  install(): void;
  restore(): void;
  getCalls(): unknown[][];
  getCallCount(): number;
}

export function createMockConsoleError(): MockConsoleError {
  const calls: unknown[][] = [];
  let originalError: typeof console.error;

  return {
    install(): void {
      originalError = console.error;
      console.error = (...args: unknown[]) => {
        calls.push(args);
      };
    },

    restore(): void {
      console.error = originalError;
    },

    getCalls(): unknown[][] {
      return [...calls];
    },

    getCallCount(): number {
      return calls.length;
    },
  };
}

export interface StandardProtocolMockSetup {
  adapter: MockAdapter;
  session: MockConnectedSession;
  service: BLEGATTService;
  writeChar: MockCharacteristic;
  notifyChar: MockCharacteristic;
}

export function createStandardProtocolMocks(): StandardProtocolMockSetup {
  const writeChar = createMockCharacteristic({
    uuid: '0000fe01-0000-1000-8000-00805f9b34fb',
    properties: { write: true },
  });

  const notifyChar = createMockCharacteristic({
    uuid: '0000fe02-0000-1000-8000-00805f9b34fb',
    properties: { notify: true },
  });

  const service = createMockService({
    uuid: '0000fe00-0000-1000-8000-00805f9b34fb',
    characteristics: [writeChar, notifyChar],
  });

  const session = createMockConnectedSession({
    services: [service],
  });

  const adapter = createMockAdapter({
    session,
  });

  return { adapter, session, service, writeChar, notifyChar };
}

export interface FTMSProtocolMockSetup {
  adapter: MockAdapter;
  session: MockConnectedSession;
  service: BLEGATTService;
  writeChar: MockCharacteristic;
  notifyChar: MockCharacteristic;
  controlPointChar: MockCharacteristic;
}

export function createFTMSProtocolMocks(): FTMSProtocolMockSetup {
  const notifyChar = createMockCharacteristic({
    uuid: '00002acd-0000-1000-8000-00805f9b34fb',
    properties: { notify: true },
  });

  const controlPointChar = createMockCharacteristic({
    uuid: '00002ad9-0000-1000-8000-00805f9b34fb',
    properties: { write: true, indicate: true },
  });

  const service = createMockService({
    uuid: '00001826-0000-1000-8000-00805f9b34fb',
    characteristics: [notifyChar, controlPointChar],
  });

  const session = createMockConnectedSession({
    services: [service],
  });

  const adapter = createMockAdapter({
    session,
  });

  return {
    adapter,
    session,
    service,
    writeChar: controlPointChar,
    notifyChar,
    controlPointChar,
  };
}
