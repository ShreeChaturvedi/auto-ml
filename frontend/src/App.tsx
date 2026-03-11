/**
 * App - Main application component with routing
 *
 * Routes:
 * - / : Home page (project selection)
 * - /project/:id : Redirects to current phase
 * - /project/:id/:phase : Project workspace with phase content
 *
 * TODO: Add more routes as features are built (settings, profile, etc.)
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { GoogleOAuthCallback } from '@/components/auth/GoogleOAuthCallback';
import { LoginForm } from '@/components/auth/LoginForm';
import { ProfileSettings } from '@/components/auth/ProfileSettings';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { SignupForm } from '@/components/auth/SignupForm';
import { DocsPage } from '@/components/docs/DocsPage';
import { useProjectStore } from '@/stores/projectStore';
import { Button } from '@/components/ui/button';
import { HomePage } from '@/pages/HomePage';
import { ProjectRedirect, ProjectWorkspace } from '@/pages/ProjectWorkspace';
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';
import { initMonaco } from '@/lib/monaco/preloader';

// Pre-load Monaco editor in the background to eliminate flash on code cells
initMonaco().catch(console.error);

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
        <Route path="/" element={<HomePage />} />
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
            <Route path="/login" element={<LoginForm />} />
            <Route path="/signup" element={<SignupForm />} />
            <Route path="/forgot-password" element={<ForgotPasswordForm />} />
            <Route path="/reset-password" element={<ResetPasswordForm />} />
            <Route path="/auth/google/callback" element={<GoogleOAuthCallback />} />
          </Route>
          {/* Profile is a dedicated full-page route outside AppShell */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfileSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/docs"
            element={
              <ProtectedRoute>
                <DocsPage />
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
