import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../authStore';
import type { SafeUser } from '../../types/user';

describe('authStore', () => {
  const mockUser: SafeUser = {
    user_id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    email_verified: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_login_at: null
  };

  beforeEach(() => {
    // Reset store to initial state before each test
    useAuthStore.getState().clearAuth();
  });

  describe('initial state', () => {
    it('starts with null user', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
    });

    it('starts with null tokens', () => {
      const state = useAuthStore.getState();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
    });

    it('starts as not authenticated', () => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
    });

    it('starts with no loading', () => {
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('starts with no error', () => {
      const state = useAuthStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('setUser', () => {
    it('sets user and marks as authenticated', () => {
      useAuthStore.getState().setUser(mockUser);
      const state = useAuthStore.getState();

      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
    });

    it('clears error when setting user', () => {
      useAuthStore.getState().setError('Some error');
      useAuthStore.getState().setUser(mockUser);

      expect(useAuthStore.getState().error).toBeNull();
    });

    it('sets user to null and marks as not authenticated', () => {
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().setUser(null);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('setTokens', () => {
    it('sets access and refresh tokens', () => {
      useAuthStore.getState().setTokens('access-token-123', 'refresh-token-456');

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('access-token-123');
      expect(state.refreshToken).toBe('refresh-token-456');
    });

    it('overwrites existing tokens', () => {
      useAuthStore.getState().setTokens('old-access', 'old-refresh');
      useAuthStore.getState().setTokens('new-access', 'new-refresh');

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('new-access');
      expect(state.refreshToken).toBe('new-refresh');
    });
  });

  describe('clearAuth', () => {
    it('clears user and tokens', () => {
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().setTokens('access', 'refresh');
      useAuthStore.getState().clearAuth();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
    });

    it('sets isAuthenticated to false', () => {
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('clears error', () => {
      useAuthStore.getState().setError('Some error');
      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('sets loading to true', () => {
      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);
    });

    it('sets loading to false', () => {
      useAuthStore.getState().setLoading(true);
      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('setError', () => {
    it('sets error message', () => {
      useAuthStore.getState().setError('Login failed');
      expect(useAuthStore.getState().error).toBe('Login failed');
    });

    it('clears error when set to null', () => {
      useAuthStore.getState().setError('Some error');
      useAuthStore.getState().setError(null);
      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe('full auth flow', () => {
    it('handles login flow', () => {
      // Start loading
      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);

      // Set user and tokens
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().setTokens('access-token', 'refresh-token');

      // Stop loading
      useAuthStore.getState().setLoading(false);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
      expect(state.accessToken).toBe('access-token');
      expect(state.refreshToken).toBe('refresh-token');
      expect(state.isLoading).toBe(false);
    });

    it('handles logout flow', () => {
      // Setup authenticated state
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().setTokens('access', 'refresh');

      // Logout
      useAuthStore.getState().clearAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
    });

    it('handles login error flow', () => {
      useAuthStore.getState().setLoading(true);
      useAuthStore.getState().setError('Invalid credentials');
      useAuthStore.getState().setLoading(false);

      const state = useAuthStore.getState();
      expect(state.error).toBe('Invalid credentials');
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });
});
