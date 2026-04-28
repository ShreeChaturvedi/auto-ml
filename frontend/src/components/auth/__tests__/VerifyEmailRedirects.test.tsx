import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAuthStore } from '@/stores/authStore';

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const authApiMocks = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  getVerificationStatus: vi.fn(),
}));

vi.mock('@/lib/api/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/auth')>('@/lib/api/auth');
  return {
    ...actual,
    verifyEmail: (...args: unknown[]) => authApiMocks.verifyEmail(...args),
    getVerificationStatus: (...args: unknown[]) => authApiMocks.getVerificationStatus(...args),
  };
});

const toastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: vi.fn(),
  }
}));

import { VerifyEmailPage } from '../VerifyEmailPage';
import { VerifyEmailPendingPage } from '../VerifyEmailPendingPage';

describe('verification redirect flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigateMock.mockReset();
    toastSuccessMock.mockReset();
    authApiMocks.verifyEmail.mockReset();
    authApiMocks.getVerificationStatus.mockReset();
    useAuthStore.setState({
      user: {
        user_id: 'user-1',
        email: 'beta@example.com',
        name: 'Beta User',
        role: 'user',
        email_verified: false,
        created_at: new Date('2026-04-22T12:00:00Z').toISOString(),
        updated_at: new Date('2026-04-22T12:00:00Z').toISOString(),
        last_login_at: null,
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('clears auth and redirects verified users to login from the email link page', async () => {
    authApiMocks.verifyEmail.mockResolvedValue({ message: 'ok' });

    render(
      <MemoryRouter initialEntries={['/verify-email?token=abc123']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(navigateMock).toHaveBeenCalledWith('/login?verified=1', { replace: true });
  });

  it('clears auth and redirects verified users to login from the pending page poller', async () => {
    authApiMocks.getVerificationStatus.mockResolvedValue({ emailVerified: true });

    render(
      <MemoryRouter initialEntries={['/verify-email/pending']}>
        <Routes>
          <Route path="/verify-email/pending" element={<VerifyEmailPendingPage />} />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(toastSuccessMock).toHaveBeenCalledWith('Email verified!');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(navigateMock).toHaveBeenCalledWith('/login?verified=1', { replace: true });
  });
});
