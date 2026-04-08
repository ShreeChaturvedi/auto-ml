/**
 * Authentication Store - Manages user session and tokens
 *
 * Features:
 * - User state management
 * - JWT access and refresh token storage
 * - Persisted to localStorage for session continuity
 * - Loading and error states
 */

import type { SafeUser } from '../types/user';
import { createPersistedStore } from './utils/createPersistedStore';

interface AuthState {
  user: SafeUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: SafeUser | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setEmailVerified: (verified: boolean) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = createPersistedStore<AuthState>(
  'auth',
  (set) => ({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,

    setUser: (user) =>
      set({
        user,
        isAuthenticated: !!user,
        error: null
      }),

    setTokens: (accessToken, refreshToken) =>
      set({ accessToken, refreshToken }),

    setEmailVerified: (verified) =>
      set((state) => ({
        user: state.user ? { ...state.user, email_verified: verified } : null
      })),

    clearAuth: () =>
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        error: null
      }),

    setLoading: (loading) => set({ isLoading: loading }),

    setError: (error) => set({ error })
  }),
  (state) => ({
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    user: state.user
  }),
  {
    fullName: 'auth-storage',
    merge: (persistedState, currentState) => {
      const persisted = persistedState as Partial<AuthState> | undefined;
      return {
        ...currentState,
        ...persisted,
        isAuthenticated: !!persisted?.user
      };
    }
  }
);
