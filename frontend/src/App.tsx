/**
 * App - Main application component with routing
 *
 * Routes:
 * - / : Home page (project selection)
 * - /project/:id : Redirects to current phase
 * - /project/:id/:phase : Project workspace with phase content
 * - /settings/:tab : Settings page (general, ai-models, editor, data, execution, profile)
 * - /settings : Redirects to /settings/general
 * - /profile : Redirects to /settings/profile
 * - /docs : Documentation page
 * - /login, /signup, /forgot-password, /reset-password : Auth flows
 */

import { lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
const SettingsPage = lazy(() =>
  import('@/components/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const HomePage = lazy(() =>
  import('@/pages/HomePage').then((m) => ({ default: m.HomePage }))
);
const DevToolsShowcase = lazy(() =>
  import('@/pages/DevToolsShowcase').then((m) => ({ default: m.DevToolsShowcase }))
);
const LandingPreviewCapturePage = lazy(() =>
  import('@/demo/landing/LandingPreviewCapturePage').then((m) => ({
    default: m.LandingPreviewCapturePage,
  }))
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
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/project/:projectId" element={<ProjectRedirect />} />
          <Route path="/project/:projectId/:phase" element={<ProjectWorkspace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <AppShell>{content}</AppShell>
  );
}

function App() {
  const authReady = useAuthBootstrap();
  useTokenRefreshTimer();

  // Dev-only route — bypasses auth bootstrap entirely, tree-shaken in production
  if (import.meta.env.DEV && window.location.pathname === '/dev/tools') {
    return (
      <BrowserRouter>
        <div className="min-h-screen w-full bg-background text-foreground">
          <Suspense fallback={null}>
            <Routes>
              <Route path="/dev/tools" element={<DevToolsShowcase />} />
            </Routes>
          </Suspense>
          <Toaster />
        </div>
      </BrowserRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname === '/dev/landing-preview') {
    return (
      <div className="min-h-screen w-full bg-background text-foreground">
        <Suspense fallback={null}>
          <LandingPreviewCapturePage />
        </Suspense>
        <Toaster />
      </div>
    );
  }

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
        <Suspense fallback={null}>
        <Routes>
          {/* Auth routes share AuthLayout so background persists across navigation */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginForm />} />
            <Route path="/signup" element={<SignupForm />} />
            <Route path="/forgot-password" element={<ForgotPasswordForm />} />
            <Route path="/reset-password" element={<ResetPasswordForm />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/verify-email/pending" element={<VerifyEmailPendingPage />} />
            <Route path="/auth/google/callback" element={<GoogleOAuthCallback />} />
          </Route>
          {/* Settings is a full-page route outside AppShell */}
          <Route
            path="/settings/:tab"
            element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}
          />
          <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
          <Route path="/profile" element={<Navigate to="/settings/profile" replace />} />
          <Route
            path="/docs"
            element={<ProtectedRoute><DocsPage /></ProtectedRoute>}
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
        </Suspense>
        <Toaster />
      </div>
    </BrowserRouter>
  );
}

export default App;
