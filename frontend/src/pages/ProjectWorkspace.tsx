import React, { lazy, Suspense, useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/stores/projectStore';
import { useExperimentsStore, createInitialExperimentsState } from '@/stores/experimentsStore';
import { isAuxiliaryPhase } from '@/types/phase';
import type { Phase } from '@/types/phase';

const UploadArea = lazy(() => import('@/components/upload/UploadArea').then(m => ({ default: m.UploadArea })));
const DataViewerTab = lazy(() => import('@/components/data/DataViewerTab').then(m => ({ default: m.DataViewerTab })));
const PreprocessingPanel = lazy(() => import('@/components/preprocessing/PreprocessingPanel').then(m => ({ default: m.PreprocessingPanel })));
const FeatureEngineeringPanel = lazy(() => import('@/components/features/FeatureEngineeringPanel').then(m => ({ default: m.FeatureEngineeringPanel })));
const TrainingPanel = lazy(() => import('@/components/training/TrainingPanel').then(m => ({ default: m.TrainingPanel })));
const ExperimentsDashboard = lazy(() => import('@/components/experiments/ExperimentsDashboard').then(m => ({ default: m.ExperimentsDashboard })));
const DeploymentDashboard = lazy(() => import('@/components/deployment/DeploymentDashboard').then(m => ({ default: m.DeploymentDashboard })));
const NotebookPage = lazy(() => import('@/components/notebook/NotebookPage').then(m => ({ default: m.NotebookPage })));

// ---------------------------------------------------------------------------
// Phase-level ErrorBoundary — prevents a single phase crash from white-screening
// ---------------------------------------------------------------------------
class PhaseErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PhaseErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <p className="text-sm text-muted-foreground">Something went wrong in this phase.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              this.setState({ hasError: false, error: undefined });
              this.props.onReset?.();
            }}
          >
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Redirect to current phase
export function ProjectRedirect() {
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
export function ProjectWorkspace() {
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
      useExperimentsStore.setState(createInitialExperimentsState());
      setActiveProject(projectId);
    }
  }, [isInitialized, projectId, activeProjectId, setActiveProject]);

  useEffect(() => {
    if (!isInitialized || !project || !phase) return;
    // Auxiliary phases (e.g. notebook) aren't persisted as the user's current workflow phase.
    if (isAuxiliaryPhase(phase as Phase)) return;
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

  // Auxiliary phases (e.g. notebook) bypass the unlock check
  if (!isAuxiliaryPhase(phase as Phase) && !isPhaseUnlocked(project.id, phase as Phase)) {
    // Redirect to current phase if locked
    return <Navigate to={`/project/${project.id}/${project.currentPhase}`} replace />;
  }

  // Redirect common alias to canonical phase slug
  if ((phase as string) === 'processing') {
    return <Navigate to={`/project/${project.id}/preprocessing`} replace />;
  }

  // Render content based on phase
  switch (phase as Phase) {
    case 'upload':
      return (
        <PhaseErrorBoundary>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/50" />}>
            <UploadArea />
          </Suspense>
        </PhaseErrorBoundary>
      );

    case 'data-viewer':
      return (
        <PhaseErrorBoundary>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/50" />}>
            <DataViewerTab />
          </Suspense>
        </PhaseErrorBoundary>
      );

    case 'preprocessing':
      return (
        <PhaseErrorBoundary>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/50" />}>
            <PreprocessingPanel />
          </Suspense>
        </PhaseErrorBoundary>
      );

    case 'feature-engineering':
      return (
        <PhaseErrorBoundary>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/50" />}>
            <FeatureEngineeringPanel projectId={projectId!} />
          </Suspense>
        </PhaseErrorBoundary>
      );

    case 'training':
      return (
        <PhaseErrorBoundary>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/50" />}>
            <TrainingPanel />
          </Suspense>
        </PhaseErrorBoundary>
      );

    case 'experiments':
      return (
        <PhaseErrorBoundary>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/50" />}>
            <ExperimentsDashboard />
          </Suspense>
        </PhaseErrorBoundary>
      );

    case 'deployment':
      return (
        <PhaseErrorBoundary>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/50" />}>
            <DeploymentDashboard />
          </Suspense>
        </PhaseErrorBoundary>
      );

    case 'notebook':
      return (
        <PhaseErrorBoundary>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/50" />}>
            <NotebookPage projectId={projectId!} />
          </Suspense>
        </PhaseErrorBoundary>
      );

    default:
      return <Navigate to={`/project/${project.id}/upload`} replace />;
  }
}
