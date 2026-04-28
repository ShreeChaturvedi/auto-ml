import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAuthStore } from '@/stores/authStore';

const authApiMocks = vi.hoisted(() => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  loginUser: (...args: unknown[]) => authApiMocks.loginUser(...args),
  registerUser: (...args: unknown[]) => authApiMocks.registerUser(...args),
}));

import { LoginForm } from '../LoginForm';
import { SignupForm } from '../SignupForm';

describe('beta auth forms', () => {
  beforeEach(() => {
    authApiMocks.loginUser.mockReset();
    authApiMocks.registerUser.mockReset();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('shows the verification success banner on the login page', () => {
    render(
      <MemoryRouter initialEntries={['/login?verified=1']}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Email verified. Sign in to continue.')).toBeInTheDocument();
  });

  it('renders a disabled Google login CTA marked as coming soon', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
        </Routes>
      </MemoryRouter>
    );

    const button = screen.getByRole('button', { name: /continue with google/i });
    expect(button).toBeDisabled();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();

    await user.click(button);
    expect(authApiMocks.loginUser).not.toHaveBeenCalled();
    expect(authApiMocks.registerUser).not.toHaveBeenCalled();
  });

  it('renders a disabled Google signup CTA marked as coming soon', () => {
    render(
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignupForm />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /sign up with google/i })).toBeDisabled();
    expect(screen.getByText('Google sign-up is disabled for the beta. Create an email/password account instead.')).toBeInTheDocument();
  });
});
