import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { refreshAccessToken } from '@/lib/api/client';
import { decodeJwtPayload } from '@/lib/auth/jwt';
import { toast } from 'sonner';

const RETRY_DELAY_MS = 30_000;
/** Idle threshold before a failed refresh surfaces the "Session expiring" toast. */
export const SESSION_IDLE_WARN_MS = 5 * 60_000;

/**
 * Proactively refreshes the access token at 80% of its TTL so users never
 * experience a session expiry during active use.
 *
 * Activity (pointer / keyboard / scroll / touch / visibility / API traffic)
 * resets the idle clock. The "Session expiring soon" warning only fires
 * after true idle — not while the user is actively interacting.
 */
export function useTokenRefreshTimer() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastActivityRef = useRef<number>(Date.now());

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'mousemove',
      'scroll',
      'touchstart',
    ];
    for (const evt of events) {
      window.addEventListener(evt, markActivity, { passive: true });
    }
    window.addEventListener('automl:api-activity', markActivity as EventListener);
    const onVis = () => {
      if (document.visibilityState === 'visible') markActivity();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, markActivity);
      }
      window.removeEventListener('automl:api-activity', markActivity as EventListener);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [markActivity]);

  useEffect(() => {
    if (!accessToken || !refreshToken) return;

    const payload = decodeJwtPayload(accessToken);
    if (!payload?.exp) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const ttl = payload.exp - nowSec;
    if (ttl <= 0) return;

    const refreshInMs = Math.max(ttl * 0.8 * 1000, 5000);

    const scheduleRefresh = (delayMs: number, isRetry = false) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const currentRefresh = useAuthStore.getState().refreshToken;
        const newToken = await refreshAccessToken(currentRefresh);
        if (newToken) {
          markActivity();
          return;
        }
        if (!isRetry) {
          scheduleRefresh(RETRY_DELAY_MS, true);
        } else {
          const idleFor = Date.now() - lastActivityRef.current;
          if (idleFor >= SESSION_IDLE_WARN_MS) {
            toast.warning('Session expiring soon — please save your work', {
              duration: 8000,
            });
          }
          // Keep retrying quietly while the tab is active.
          scheduleRefresh(RETRY_DELAY_MS, true);
        }
      }, delayMs);
    };

    scheduleRefresh(refreshInMs);

    return () => clearTimeout(timerRef.current);
  }, [accessToken, refreshToken, markActivity]);
}

/** Test helper: whether the idle warn should fire. */
export function shouldWarnSessionExpiring(
  lastActivityMs: number,
  nowMs: number,
  idleWarnMs = SESSION_IDLE_WARN_MS
): boolean {
  return nowMs - lastActivityMs >= idleWarnMs;
}
