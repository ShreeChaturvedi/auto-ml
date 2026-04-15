/**
 * Frame-deterministic replacement for `frontend/src/stores/authStore.ts`.
 *
 * Real store uses `createPersistedStore` (localStorage) which is off-limits
 * inside Remotion — it would leak cross-render state and break reproducibility.
 * This shim preserves the public API (shape + action names) but lives entirely
 * in memory. Scenes drive state via `setAuthFixture(user)` at frame boundaries.
 */

import { create } from "zustand";
import type { SafeUser } from "./types";

interface AuthState {
  user: SafeUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  setUser: (user: SafeUser | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setEmailVerified: (verified: boolean) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
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
      error: null,
    }),

  setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

  setEmailVerified: (verified) =>
    set((state) => ({
      user: state.user ? { ...state.user, email_verified: verified } : null,
    })),

  clearAuth: () =>
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      error: null,
    }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),
}));

/**
 * Scene-side helper: stamp the store into the authenticated state with the
 * provided fixture. Used by scene code to "pretend" the user just finished
 * a login / signup flow on a specific frame.
 */
export function setAuthFixture(user: SafeUser): void {
  useAuthStore.setState({
    user,
    accessToken: "mock-access",
    refreshToken: "mock-refresh",
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
}
