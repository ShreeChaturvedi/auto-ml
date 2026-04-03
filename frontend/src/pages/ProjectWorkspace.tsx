import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { UploadArea } from '@/components/upload/UploadArea';
import { DataViewerTab } from '@/components/data/DataViewerTab';
import { PreprocessingPanel } from '@/components/preprocessing/PreprocessingPanel';
import { FeatureEngineeringPanel } from '@/components/features/FeatureEngineeringPanel';
import { TrainingPanel } from '@/components/training/TrainingPanel';
import { ExperimentsDashboard } from '@/components/experiments/ExperimentsDashboard';
import { DeploymentDashboard } from '@/components/deployment/DeploymentDashboard';
import { NotebookPage } from '@/components/notebook/NotebookPage';
import { useProjectStore } from '@/stores/projectStore';
import { isAuxiliaryPhase } from '@/types/phase';
import type { Phase } from '@/types/phase';

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
      return <ExperimentsDashboard />;

    case 'deployment':
      return <DeploymentDashboard />;

    case 'notebook':
      return <NotebookPage projectId={projectId!} />;

    default:
      return <Navigate to={`/project/${project.id}/upload`} replace />;
  }
}
