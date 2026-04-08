/**
 * ProtectedRoute - Wrapper for routes that require authentication
 *
 * Redirects to /login if user is not authenticated
 * Shows loading state while checking authentication
 * Attempts a silent token refresh before redirecting on session expiry
 *
 * DEV MODE: Set VITE_DEV_BYPASS_AUTH=true to bypass auth for testing
 */

import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { refreshAccessToken } from '@/lib/api/client';

// Dev mode bypass for testing without auth
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

const REDIRECT_DELAY_MS = 1500;

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const [expired, setExpired] = useState(false);
  const [redirectNow, setRedirectNow] = useState(false);

  useEffect(() => {
    if (isLoading || isAuthenticated || !refreshToken) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setExpired(true);

    refreshAccessToken(refreshToken).then((token) => {
      if (cancelled) return;
      if (!token) {
        timer = setTimeout(() => {
          if (!cancelled) setRedirectNow(true);
        }, REDIRECT_DELAY_MS);
      } else {
        setExpired(false);
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isAuthenticated, isLoading, refreshToken]);

  if (DEV_BYPASS_AUTH) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated && !expired) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (expired && !isAuthenticated) {
    if (redirectNow) {
      return <Navigate to="/login" state={{ from: location }} replace />;
    }
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Session expired — redirecting to login…</p>
      </div>
    );
  }

  // Email verification gate — redirect unverified users to pending page
  if (isAuthenticated && user && !user.email_verified) {
    return <Navigate to="/verify-email/pending" replace />;
  }

  return <>{children}</>;
}
