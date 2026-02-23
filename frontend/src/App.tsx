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

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { UploadArea } from '@/components/upload/UploadArea';
import { DataViewerTab } from '@/components/data/DataViewerTab';
import { PreprocessingPanel } from '@/components/preprocessing/PreprocessingPanel';
import { FeatureEngineeringPanel } from '@/components/features/FeatureEngineeringPanel';
import { TrainingPanel } from '@/components/training/TrainingPanel';
import { ExperimentsPanel } from '@/components/experiments/ExperimentsPanel';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { GoogleOAuthCallback } from '@/components/auth/GoogleOAuthCallback';
import { LoginForm } from '@/components/auth/LoginForm';
import { ProfileSettings } from '@/components/auth/ProfileSettings';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { SignupForm } from '@/components/auth/SignupForm';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { ArrowUpRight, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectDialog } from '@/components/projects/ProjectDialog';
import type { Phase } from '@/types/phase';
import { getCurrentUser } from '@/lib/api/auth';
import { isJwtExpired } from '@/lib/auth/jwt';
import { initMonaco } from '@/lib/monaco/preloader';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';

// Pre-load Monaco editor in the background to eliminate flash on code cells
initMonaco().catch(console.error);

// Home page - shown when no project is selected
function HomePage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  // Fix: Use individual selectors to avoid creating new objects on every render
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const isInitialized = useProjectStore((state) => state.isInitialized);
  const isLoading = useProjectStore((state) => state.isLoading);
  const error = useProjectStore((state) => state.error);

  // Clear active project when HomePage mounts (fixes navigation bug)
  useEffect(() => {
    if (activeProjectId !== null) {
      setActiveProject(null);
    }
  }, [activeProjectId, setActiveProject]);

  if (!isInitialized && isLoading && projects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  if (error && projects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => setIsCreateDialogOpen(true)}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Create Project
          </Button>
          <ProjectDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
        </div>
      </div>
    );
  }

  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="rounded-lg">
          <FolderOpen />
        </EmptyMedia>
        <EmptyTitle>
          {projects.length === 0 ? 'No Projects Yet' : 'No Project Selected'}
        </EmptyTitle>
        <EmptyDescription>
          {projects.length === 0
            ? 'Start your first ML workflow by creating a new project or importing one.'
            : 'Select a project from the sidebar to continue working, or create/import a new one.'}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex gap-2">
          <Button onClick={() => setIsCreateDialogOpen(true)}>Create Project</Button>
          <Button variant="outline">Import Project</Button>
        </div>
      </EmptyContent>
      <Button
        variant="link"
        asChild
        className="text-muted-foreground"
        size="sm"
      >
        <a href="https://github.com/ShreeChaturvedi/AutoML" target="_blank" rel="noreferrer">
          Learn More <ArrowUpRight />
        </a>
      </Button>
      <ProjectDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
    </Empty>
  );
}

// Redirect to current phase
function ProjectRedirect() {
  const { projectId } = useParams();
  const projects = useProjectStore((state) => state.projects);
  const isInitialized = useProjectStore((state) => state.isInitialized);
  const isLoading = useProjectStore((state) => state.isLoading);

  if (!isInitialized) {
    return isLoading ? null : <Navigate to="/" replace />;
  }

  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;

  if (!project) {
    return <Navigate to="/" replace />;
  }

  // Redirect to current phase (or upload if not set)
  return <Navigate to={`/project/${project.id}/${project.currentPhase || 'upload'}`} replace />;
}

// Project workspace - shown when a project and phase are selected
function ProjectWorkspace() {
  const { projectId, phase } = useParams<{ projectId: string; phase: Phase }>();
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setCurrentPhase = useProjectStore((state) => state.setCurrentPhase);
  const isPhaseUnlocked = useProjectStore((state) => state.isPhaseUnlocked);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const isInitialized = useProjectStore((state) => state.isInitialized);

  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;

  useEffect(() => {
    if (!isInitialized || !projectId) return;
    if (projectId !== activeProjectId) {
      setActiveProject(projectId);
    }
  }, [isInitialized, projectId, activeProjectId, setActiveProject]);

  useEffect(() => {
    if (!isInitialized || !project || !phase) return;
    if (project.currentPhase !== phase) {
      setCurrentPhase(project.id, phase as Phase);
    }
  }, [isInitialized, project, phase, setCurrentPhase]);

  if (!isInitialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Loading project workspace...
        </p>
      </div>
    );
  }

  if (!project) {
    return <Navigate to="/" replace />;
  }

  if (!phase) {
    return <Navigate to={`/project/${project.id}/${project.currentPhase || 'upload'}`} replace />;
  }

  // Check if phase is unlocked
  if (!isPhaseUnlocked(project.id, phase as Phase)) {
    // Redirect to current phase if locked
    return <Navigate to={`/project/${project.id}/${project.currentPhase}`} replace />;
  }

  // Render content based on phase
  switch (phase as Phase) {
    case 'upload':
      return <UploadArea />;

    case 'data-viewer':
      return <DataViewerTab />;

    case 'preprocessing':
      return <PreprocessingPanel />;

    case 'feature-engineering':
      return <FeatureEngineeringPanel projectId={projectId!} />;

    case 'training':
      return <TrainingPanel />;

    case 'experiments':
      return <ExperimentsPanel />;

    case 'deployment':
      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Deployment</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Model deployment interface with containerization and API endpoint management.
            </p>
            <p className="text-xs text-muted-foreground italic">
              TODO: Implement deployment UI.
            </p>
          </div>
        </div>
      );

    default:
      return <Navigate to={`/project/${project.id}/upload`} replace />;
  }
}

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
  const [authReady, setAuthReady] = useState(false);
  const setUser = useAuthStore((state) => state.setUser);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    let isMounted = true;

    const bootstrapAuth = async () => {
      const { accessToken, refreshToken } = useAuthStore.getState();
      if (!accessToken && !refreshToken) {
        setLoading(false);
        setAuthReady(true);
        return;
      }
      if (!accessToken || isJwtExpired(accessToken)) {
        clearAuth();
        setLoading(false);
        setAuthReady(true);
        return;
      }

      setLoading(true);
      try {
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
    };
  }, [setUser, clearAuth, setLoading]);

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
