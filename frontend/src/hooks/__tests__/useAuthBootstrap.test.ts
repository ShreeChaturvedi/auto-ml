import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useAuthStore } from '@/stores/authStore';
import { TEST_USER } from '@/tests/fixtures';
import { useAuthBootstrap } from '../useAuthBootstrap';

// ── Helpers ────────────────────────────────────────────────────

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

function validToken() {
  return makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
}

function expiredToken() {
  return makeJwt({ exp: Math.floor(Date.now() / 1000) - 60 });
}

// ── Mocks ──────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockRefreshAccessToken = vi.fn();

vi.mock('@/lib/api/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

vi.mock('@/lib/api/client', () => ({
  refreshAccessToken: (...args: unknown[]) => mockRefreshAccessToken(...args),
}));

// ── Setup / Teardown ───────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────

describe('useAuthBootstrap', () => {
  it('resolves immediately when no tokens exist', async () => {
    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current).toBe(true));

    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it('fetches /me with a valid access token (no refresh needed)', async () => {
    mockGetCurrentUser.mockResolvedValue({ user: TEST_USER });

    useAuthStore.setState({
      accessToken: validToken(),
      refreshToken: 'rt-abc',
    });

    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current).toBe(true));

    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    expect(mockGetCurrentUser).toHaveBeenCalledOnce();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(TEST_USER);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('refreshes token when access token is expired and refresh token exists', async () => {
    const newAccessToken = validToken();
    mockRefreshAccessToken.mockResolvedValue(newAccessToken);
    mockGetCurrentUser.mockResolvedValue({ user: TEST_USER });

    useAuthStore.setState({
      accessToken: expiredToken(),
      refreshToken: 'rt-abc',
    });

    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current).toBe(true));

    expect(mockRefreshAccessToken).toHaveBeenCalledWith('rt-abc');
    expect(mockGetCurrentUser).toHaveBeenCalledOnce();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(TEST_USER);
    expect(state.isAuthenticated).toBe(true);
  });

  it('clears auth when expired access token and NO refresh token', async () => {
    useAuthStore.setState({
      accessToken: expiredToken(),
      refreshToken: null,
      user: TEST_USER as never,
    });

    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current).toBe(true));

    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    expect(mockGetCurrentUser).not.toHaveBeenCalled();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('clears auth and resolves loading when refresh fails', async () => {
    mockRefreshAccessToken.mockResolvedValue(null);

    useAuthStore.setState({
      accessToken: expiredToken(),
      refreshToken: 'rt-expired',
      user: TEST_USER as never,
    });

    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current).toBe(true));

    expect(mockRefreshAccessToken).toHaveBeenCalledWith('rt-expired');
    expect(mockGetCurrentUser).not.toHaveBeenCalled();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    // Critical: loading must be false, not stuck
    expect(state.isLoading).toBe(false);
  });

  it('clears auth when getCurrentUser fails (e.g. revoked token)', async () => {
    mockGetCurrentUser.mockRejectedValue(new Error('Unauthorized'));

    useAuthStore.setState({
      accessToken: validToken(),
      refreshToken: 'rt-abc',
    });

    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current).toBe(true));

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('refreshes when access token is null but refresh token exists', async () => {
    const newAccessToken = validToken();
    mockRefreshAccessToken.mockResolvedValue(newAccessToken);
    mockGetCurrentUser.mockResolvedValue({ user: TEST_USER });

    useAuthStore.setState({
      accessToken: null,
      refreshToken: 'rt-abc',
    });

    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current).toBe(true));

    expect(mockRefreshAccessToken).toHaveBeenCalledWith('rt-abc');
    expect(mockGetCurrentUser).toHaveBeenCalledOnce();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(TEST_USER);
    expect(state.isAuthenticated).toBe(true);
  });
});
