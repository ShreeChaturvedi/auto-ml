/**
 * App - Main application component with routing
 *
 * Routes:
 * - / : Home page (project selection)
 * - /project/:id : Redirects to current phase
 * - /project/:id/:phase : Project workspace with phase content
 * - /profile : User profile settings
 * - /docs : Documentation page
 * - /login, /signup, /forgot-password, /reset-password : Auth flows
 */

import { lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useProjectStore } from '@/stores/projectStore';
import { Button } from '@/components/ui/button';
import { ProjectRedirect, ProjectWorkspace } from '@/pages/ProjectWorkspace';
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';
import { useTokenRefreshTimer } from '@/hooks/useTokenRefreshTimer';

const ForgotPasswordForm = lazy(() =>
  import('@/components/auth/ForgotPasswordForm').then((m) => ({ default: m.ForgotPasswordForm }))
);
const GoogleOAuthCallback = lazy(() =>
  import('@/components/auth/GoogleOAuthCallback').then((m) => ({ default: m.GoogleOAuthCallback }))
);
const LoginForm = lazy(() =>
  import('@/components/auth/LoginForm').then((m) => ({ default: m.LoginForm }))
);
const ResetPasswordForm = lazy(() =>
  import('@/components/auth/ResetPasswordForm').then((m) => ({ default: m.ResetPasswordForm }))
);
const SignupForm = lazy(() =>
  import('@/components/auth/SignupForm').then((m) => ({ default: m.SignupForm }))
);
const VerifyEmailPage = lazy(() =>
  import('@/components/auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage }))
);
const VerifyEmailPendingPage = lazy(() =>
  import('@/components/auth/VerifyEmailPendingPage').then((m) => ({ default: m.VerifyEmailPendingPage }))
);
const DocsPage = lazy(() =>
  import('@/components/docs/DocsPage').then((m) => ({ default: m.DocsPage }))
);
const ProfileSettings = lazy(() =>
  import('@/components/auth/ProfileSettings').then((m) => ({ default: m.ProfileSettings }))
);
const HomePage = lazy(() =>
  import('@/pages/HomePage').then((m) => ({ default: m.HomePage }))
);

function MainApp() {
  const isInitialized = useProjectStore((state) => state.isInitialized);
  const isLoading = useProjectStore((state) => state.isLoading);
  const error = useProjectStore((state) => state.error);
  const projects = useProjectStore((state) => state.projects);

  useEffect(() => {
    void useProjectStore.getState().initialize();
  }, []);

  let content: ReactNode;

  if (!isInitialized && isLoading && projects.length === 0) {
    content = (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Connecting to backend...</p>
      </div>
    );
  } else if (!isInitialized && error && projects.length === 0) {
    content = (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-2 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void useProjectStore.getState().initialize();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  } else {
    content = (
      <Routes>
        <Route path="/" element={<Suspense fallback={null}><HomePage /></Suspense>} />
        <Route path="/project/:projectId" element={<ProjectRedirect />} />
        <Route path="/project/:projectId/:phase" element={<ProjectWorkspace />} />
      </Routes>
    );
  }

  return (
    <AppShell>{content}</AppShell>
  );
}

function App() {
  const authReady = useAuthBootstrap();
  useTokenRefreshTimer();

  if (!authReady) {
    return (
      <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Checking session...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen w-full bg-background text-foreground">
        <Routes>
          {/* Auth routes share AuthLayout so background persists across navigation */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Suspense fallback={null}><LoginForm /></Suspense>} />
            <Route path="/signup" element={<Suspense fallback={null}><SignupForm /></Suspense>} />
            <Route path="/forgot-password" element={<Suspense fallback={null}><ForgotPasswordForm /></Suspense>} />
            <Route path="/reset-password" element={<Suspense fallback={null}><ResetPasswordForm /></Suspense>} />
            <Route path="/verify-email" element={<Suspense fallback={null}><VerifyEmailPage /></Suspense>} />
            <Route path="/verify-email/pending" element={<Suspense fallback={null}><VerifyEmailPendingPage /></Suspense>} />
            <Route path="/auth/google/callback" element={<Suspense fallback={null}><GoogleOAuthCallback /></Suspense>} />
          </Route>
          {/* Profile is a dedicated full-page route outside AppShell */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}><ProfileSettings /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/docs"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}><DocsPage /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <MainApp />
              </ProtectedRoute>
            }
          />
        </Routes>
        <Toaster />
      </div>
    </BrowserRouter>
  );
}

export default App;
