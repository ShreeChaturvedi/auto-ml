import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { refreshAccessToken } from '@/lib/api/client';
import { decodeJwtPayload } from '@/lib/auth/jwt';
import { toast } from 'sonner';

const RETRY_DELAY_MS = 30_000;

/**
 * Proactively refreshes the access token at 80% of its TTL so users never
 * experience a session expiry during active use.
 */
export function useTokenRefreshTimer() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!accessToken || !refreshToken) return;

    const payload = decodeJwtPayload(accessToken);
    if (!payload?.exp) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const ttl = payload.exp - nowSec;
    if (ttl <= 0) return;

    // Refresh at 80% of remaining TTL
    const refreshInMs = Math.max(ttl * 0.8 * 1000, 5000);

    const scheduleRefresh = (delayMs: number, isRetry = false) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const currentRefresh = useAuthStore.getState().refreshToken;
        const newToken = await refreshAccessToken(currentRefresh);
        if (newToken) {
          // Token refreshed — next cycle will schedule via the accessToken dep change
          return;
        }
        if (!isRetry) {
          // Retry once after 30s
          scheduleRefresh(RETRY_DELAY_MS, true);
        } else {
          toast.warning('Session expiring soon — please save your work', {
            duration: 8000,
          });
        }
      }, delayMs);
    };

    scheduleRefresh(refreshInMs);

    return () => clearTimeout(timerRef.current);
  }, [accessToken, refreshToken]);
}
