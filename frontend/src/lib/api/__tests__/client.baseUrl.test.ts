import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadClientModule(envOverrides: Record<string, string | undefined>) {
  vi.resetModules();
  vi.unstubAllEnvs();

  for (const [key, value] of Object.entries(envOverrides)) {
    if (value !== undefined) {
      vi.stubEnv(key, value);
    }
  }

  return import('../client');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('API base URL resolution', () => {
  it('prefers VITE_API_BASE when both env vars are present', async () => {
    const { getApiBaseUrl } = await loadClientModule({
      VITE_API_BASE: 'https://preferred.example.com/api/',
      VITE_API_BASE_URL: 'https://legacy.example.com/api'
    });

    expect(getApiBaseUrl()).toBe('https://preferred.example.com/api');
  });

  it('derives websocket URLs from an explicit API base', async () => {
    const { getApiBaseUrl, getWebSocketUrl } = await loadClientModule({});

    expect(getApiBaseUrl('https://beta.duckdns.org/api/')).toBe('https://beta.duckdns.org/api');
    expect(getWebSocketUrl('/ws/notebook', 'https://beta.duckdns.org/api')).toBe('wss://beta.duckdns.org/ws/notebook');
  });
});
