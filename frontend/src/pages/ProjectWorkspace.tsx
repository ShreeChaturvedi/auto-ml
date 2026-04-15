import React, { lazy, Suspense, useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/stores/projectStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useExperimentsStore, createInitialExperimentsState } from '@/stores/experimentsStore';
import type { Phase } from '@/types/phase';
import {
  loadDataViewerTab,
  loadDeploymentDashboard,
  loadExperimentsDashboard,
  loadFeatureEngineeringPanel,
  loadPreprocessingPanel,
  loadTrainingPanel,
  loadUploadArea,
} from './projectWorkspacePhaseLoaders';

const UploadArea = lazy(loadUploadArea);
const DataViewerTab = lazy(loadDataViewerTab);
const PreprocessingPanel = lazy(loadPreprocessingPanel);
const FeatureEngineeringPanel = lazy(loadFeatureEngineeringPanel);
const TrainingPanel = lazy(loadTrainingPanel);
const ExperimentsDashboard = lazy(loadExperimentsDashboard);
const DeploymentDashboard = lazy(loadDeploymentDashboard);

const NOTEBOOK_SESSION_PRESERVED_PHASES = new Set<Phase>([
  'preprocessing',
  'feature-engineering',
  'training',
  // These routes do not render the notebook UI, but preserving the active
  // phase notebook session avoids a visible reconnect/repaint when the user
  // jumps back into FE or Training from them.
  'experiments',
  'deployment'
]);

function shouldPreserveNotebookSession(
  projectId: string,
  phase: Phase,
  isPhaseUnlocked: (projectId: string, phase: Phase) => boolean
): boolean {
  if ((phase as string) === 'processing') {
    return true;
  }

  if (!isPhaseUnlocked(projectId, phase)) {
    return true;
  }

  return NOTEBOOK_SESSION_PRESERVED_PHASES.has(phase);
}

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
  const disconnectNotebook = useNotebookStore((state) => state.disconnect);

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
    if (project.currentPhase !== phase) {
      setCurrentPhase(project.id, phase as Phase);
    }
  }, [isInitialized, project, phase, setCurrentPhase]);

  useEffect(() => {
    if (!project || !phase) {
      return;
    }

    if (!shouldPreserveNotebookSession(project.id, phase as Phase, isPhaseUnlocked)) {
      disconnectNotebook();
    }
  }, [disconnectNotebook, isPhaseUnlocked, phase, project]);

  useEffect(() => () => {
    disconnectNotebook();
  }, [disconnectNotebook]);

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

  if (!isPhaseUnlocked(project.id, phase as Phase)) {
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
          <ExperimentsDashboard />
        </PhaseErrorBoundary>
      );

    case 'deployment':
      return (
        <PhaseErrorBoundary>
          <DeploymentDashboard />
        </PhaseErrorBoundary>
      );

    default:
      return <Navigate to={`/project/${project.id}/upload`} replace />;
  }
}
