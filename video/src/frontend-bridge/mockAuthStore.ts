/**
 * Frame-deterministic replacement for `frontend/src/stores/authStore.ts`.
 *
 * Real store uses `createPersistedStore` (localStorage) which is off-limits
 * inside Remotion — it would leak cross-render state and break reproducibility.
 * This shim preserves the public API (shape + action names) but lives entirely
 * in memory. Scenes drive state via `setAuthFixture(user)` at frame boundaries.
 *
 * ## SSR-safe `useAuthStore` via `useSyncExternalStore`
 *
 * Zustand v5's React binding (`useStore`) calls
 * `useSyncExternalStore(subscribe, getSnapshot, getInitialState)`. The 3rd
 * argument is the *server snapshot* — used by `renderToStaticMarkup` and
 * friends — and it's a closure over the store's literal `initialState`
 * captured at creation time. That means `setState` after creation updates
 * `getSnapshot` (CSR) but not `getInitialState` (SSR), so smoke tests that
 * seed the store via `setAuthFixture` still see the empty creation-time
 * state during SSR.
 *
 * Rather than rely on zustand's default binding, we implement our own
 * `useAuthStore` on top of `useSyncExternalStore` with an explicit
 * `getServerSnapshot` that reads `api.getState()`. This way both CSR and
 * SSR paths pull from the same live store and `setAuthFixture` becomes a
 * simple `setState` call — no seed trickery, no `Object.defineProperty`.
 */

import React from "react";
import { createStore } from "zustand/vanilla";
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

const authApi = createStore<AuthState>((set) => ({
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

const identity = <T,>(x: T): T => x;

/**
 * Hook replacement for zustand's default `useBoundStore`. `getSnapshot`
 * and `getServerSnapshot` both return `api.getState()` so SSR renders
 * reflect live `setAuthFixture` mutations.
 */
function useAuthStoreImpl<T = AuthState>(
  selector: (state: AuthState) => T = identity as (state: AuthState) => T,
): T {
  const snapshot = React.useCallback(
    () => selector(authApi.getState()),
    [selector],
  );
  return React.useSyncExternalStore(authApi.subscribe, snapshot, snapshot);
}

// Expose the vanilla api surface (getState/setState/subscribe) on the hook
// itself, matching zustand's default `useBoundStore` shape so real code
// paths like `useAuthStore.getState()` keep working.
export const useAuthStore: typeof useAuthStoreImpl & typeof authApi =
  Object.assign(useAuthStoreImpl, authApi);

/**
 * Scene-side helper: stamp the store into the authenticated state with the
 * provided fixture. Used by scene code to "pretend" the user just finished
 * a login / signup flow on a specific frame.
 */
export function setAuthFixture(user: SafeUser): void {
  authApi.setState({
    user,
    accessToken: "mock-access",
    refreshToken: "mock-refresh",
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
}
