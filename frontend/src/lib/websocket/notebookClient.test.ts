import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotebookWSClient } from './notebookClient';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  send = vi.fn();
  close = vi.fn((code?: number, reason?: string) => {
    this.readyState = MockWebSocket.CLOSING;
    this.lastClose = { code, reason };
  });
  lastClose: { code?: number; reason?: string } | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  triggerOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  triggerClose(init: CloseEventInit = {}): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', init));
  }
}

describe('NotebookWSClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('backs off after repeated brief connections instead of retrying every second forever', async () => {
    const client = new NotebookWSClient('http://localhost:4000/api');

    const firstConnect = client.connect();
    const firstSocket = MockWebSocket.instances[0];
    firstSocket.triggerOpen();
    await firstConnect;

    firstSocket.triggerClose({ code: 1006, reason: 'network drop' });

    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(2);

    const secondSocket = MockWebSocket.instances[1];
    secondSocket.triggerOpen();
    secondSocket.triggerClose({ code: 1006, reason: 'network drop again' });

    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('ignores close events from a stale socket after a newer connection becomes active', async () => {
    const client = new NotebookWSClient('http://localhost:4000/api');
    const disconnected = vi.fn();

    client.on('disconnected', disconnected);

    const firstConnect = client.connect();
    const firstSocket = MockWebSocket.instances[0];
    firstSocket.triggerOpen();
    await firstConnect;

    client.disconnect();
    expect(firstSocket.close).toHaveBeenCalledWith(1000, 'Client disconnect');

    const secondConnect = client.connect();
    const secondSocket = MockWebSocket.instances[1];
    secondSocket.triggerOpen();
    await secondConnect;

    firstSocket.triggerClose({ code: 1000, reason: 'old socket finally closed' });

    expect(client.isConnected).toBe(true);
    expect(disconnected).not.toHaveBeenCalled();
  });

  it('restores reconnect attempts after an intentional disconnect and later manual reconnect', async () => {
    const client = new NotebookWSClient('http://localhost:4000/api');

    const firstConnect = client.connect();
    const firstSocket = MockWebSocket.instances[0];
    firstSocket.triggerOpen();
    await firstConnect;

    client.disconnect();

    const secondConnect = client.connect();
    const secondSocket = MockWebSocket.instances[1];
    secondSocket.triggerOpen();
    await secondConnect;

    secondSocket.triggerClose({ code: 1006, reason: 'network drop after manual reconnect' });

    await vi.advanceTimersByTimeAsync(1000);

    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('clears connection timers on intentional disconnect', async () => {
    const client = new NotebookWSClient('http://localhost:4000/api');

    const connectPromise = client.connect();
    const socket = MockWebSocket.instances[0];
    socket.triggerOpen();
    await connectPromise;

    client.disconnect();

    expect(vi.getTimerCount()).toBe(0);
  });
});
