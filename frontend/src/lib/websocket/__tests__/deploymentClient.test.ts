import { beforeEach, describe, expect, it, vi } from 'vitest';

const getStateMock = vi.hoisted(() => vi.fn(() => ({ accessToken: null })));
const isDemoModeMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: getStateMock,
  },
}));

vi.mock('@/lib/demoMode', () => ({
  isDemoMode: isDemoModeMock,
}));

import { DeploymentWSClient } from '../deploymentClient';

describe('DeploymentWSClient', () => {
  const webSocketCtorMock = vi.fn();

  beforeEach(() => {
    getStateMock.mockClear();
    isDemoModeMock.mockReset();
    isDemoModeMock.mockReturnValue(false);
    webSocketCtorMock.mockReset();

    class MockWebSocket {
      static OPEN = 1;
      readyState = 0;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor() {
        webSocketCtorMock();
      }

      send() {}
      close() {}
    }

    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  it('skips opening a websocket when demo mode is enabled', () => {
    isDemoModeMock.mockReturnValue(true);

    const client = new DeploymentWSClient('http://localhost:4000/api');

    void client.connect();

    expect(webSocketCtorMock).not.toHaveBeenCalled();
    expect(client.isConnected).toBe(false);
  });
});
