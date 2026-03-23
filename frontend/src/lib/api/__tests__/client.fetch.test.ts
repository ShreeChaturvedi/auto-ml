import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '../client';
import { getRequestHeader } from './testUtils';
import { useAuthStore } from '@/stores/authStore';

describe('apiFetch', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setTokens('access-token', 'refresh-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
  });

  it('adds the bearer token to raw API fetches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await apiFetch('/workflows/turns/stream', {
      method: 'POST',
      headers: { Accept: 'application/x-ndjson' }
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0];
    expect(getRequestHeader(init, 'Authorization')).toBe('Bearer access-token');
    expect(getRequestHeader(init, 'Accept')).toBe('application/x-ndjson');
  });

  it('refreshes and retries raw API fetches after a 401', async () => {
    const authSnapshots: Array<string | null> = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockImplementation(async (_input, init) => {
        authSnapshots.push(getRequestHeader(init, 'Authorization'));

        if (authSnapshots.length === 1) {
          return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401 });
        }

        if (authSnapshots.length === 2) {
          return new Response(JSON.stringify({ accessToken: 'fresh-access-token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(null, { status: 200 });
      });

    const response = await apiFetch('/query/nl/stream', {
      method: 'POST',
      headers: { Accept: 'application/x-ndjson' }
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(authSnapshots[0]).toBe('Bearer access-token');
    expect(authSnapshots[2]).toBe('Bearer fresh-access-token');
    expect(useAuthStore.getState().accessToken).toBe('fresh-access-token');
  });

  it('clears stored auth if refresh fails for a protected raw API fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }));

    const response = await apiFetch('/experiments/project-1/insights', {
      method: 'POST',
      headers: { Accept: 'application/x-ndjson' }
    });

    expect(response.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});
