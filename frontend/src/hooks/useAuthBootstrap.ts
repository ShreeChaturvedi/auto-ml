import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { getCurrentUser } from '@/lib/api/auth';
import { refreshAccessToken } from '@/lib/api/client';
import { isJwtExpired } from '@/lib/auth/jwt';

/**
 * Waits for Zustand auth store hydration, then validates the persisted
 * session (access-token + /me fetch). Returns `authReady` once bootstrap
 * completes so the caller can gate rendering.
 */
export function useAuthBootstrap() {
  const [authReady, setAuthReady] = useState(false);
  const setUser = useAuthStore((state) => state.setUser);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeHydration: (() => void) | null = null;

    const waitForAuthHydration = async () => {
      if (useAuthStore.persist.hasHydrated()) {
        return;
      }

      await new Promise<void>((resolve) => {
        unsubscribeHydration = useAuthStore.persist.onFinishHydration(() => {
          unsubscribeHydration?.();
          unsubscribeHydration = null;
          resolve();
        });
      });
    };

    const bootstrapAuth = async () => {
      await waitForAuthHydration();
      if (!isMounted) return;

      const { accessToken, refreshToken } = useAuthStore.getState();

      // No viable tokens — clear stale user state and finish.
      if ((!accessToken || isJwtExpired(accessToken)) && !refreshToken) {
        if (useAuthStore.getState().user) {
          clearAuth();
        }
        setLoading(false);
        setAuthReady(true);
        return;
      }

      setLoading(true);
      try {
        // If the access token is expired, refresh it before calling /me
        // to avoid a guaranteed-to-fail request followed by a retry.
        if (!accessToken || isJwtExpired(accessToken)) {
          const newToken = await refreshAccessToken(refreshToken);
          if (!newToken) {
            if (isMounted) clearAuth();
            return;
          }
        }

        const response = await getCurrentUser();
        if (isMounted) {
          setUser(response.user);
        }
      } catch {
        if (isMounted) {
          clearAuth();
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          setAuthReady(true);
        }
      }
    };

    void bootstrapAuth();

    return () => {
      isMounted = false;
      unsubscribeHydration?.();
      unsubscribeHydration = null;
    };
  }, [setUser, clearAuth, setLoading]);

  return authReady;
}
