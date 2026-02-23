/**
 * ProtectedRoute - Wrapper for routes that require authentication
 *
 * Redirects to /login if user is not authenticated
 * Shows loading state while checking authentication
 * 
 * DEV MODE: Set VITE_DEV_BYPASS_AUTH=true to bypass auth for testing
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

// Dev mode bypass for testing without auth
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  // Allow bypassing auth in development
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

  if (!isAuthenticated) {
    // Redirect to login, saving the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
