import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const notebookStoreMocks = vi.hoisted(() => ({
  disconnect: vi.fn()
}));

const phaseLoaderMocks = vi.hoisted(() => ({
  loadUploadArea: vi.fn(async () => ({ default: () => null })),
  loadDataViewerTab: vi.fn(async () => ({ default: () => null })),
  loadPreprocessingPanel: vi.fn(async () => ({ default: () => null })),
  loadFeatureEngineeringPanel: vi.fn(async () => ({ default: () => null })),
  loadTrainingPanel: vi.fn(async () => ({ default: () => null })),
  loadExperimentsDashboard: vi.fn(async () => ({ default: () => null })),
  loadDeploymentDashboard: vi.fn(async () => ({ default: () => null })),
}));

const projectStoreState = vi.hoisted(() => ({
  projects: [
    {
      id: 'proj-1',
      currentPhase: 'deployment'
    }
  ],
  activeProjectId: 'proj-1',
  setCurrentPhase: vi.fn(),
  isPhaseUnlocked: vi.fn(() => true),
  setActiveProject: vi.fn(),
  isInitialized: true,
  isLoading: false
}));

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: typeof projectStoreState) => unknown) => selector(projectStoreState)
}));

vi.mock('@/stores/notebookStore', () => ({
  useNotebookStore: (selector: (state: { disconnect: typeof notebookStoreMocks.disconnect }) => unknown) =>
    selector({ disconnect: notebookStoreMocks.disconnect })
}));

vi.mock('@/stores/experimentsStore', () => ({
  useExperimentsStore: { setState: vi.fn() },
  createInitialExperimentsState: vi.fn(() => ({}))
}));

vi.mock('./projectWorkspacePhaseLoaders', () => phaseLoaderMocks);

vi.mock('@/components/upload/UploadArea', () => ({
  UploadArea: () => <div>Upload</div>
}));

vi.mock('@/components/data/DataViewerTab', () => ({
  DataViewerTab: () => <div>Data Viewer</div>
}));

vi.mock('@/components/preprocessing/PreprocessingPanel', () => ({
  PreprocessingPanel: () => <div>Preprocessing</div>
}));

vi.mock('@/components/features/FeatureEngineeringPanel', () => ({
  FeatureEngineeringPanel: () => <div>Feature Engineering</div>
}));

vi.mock('@/components/training/TrainingPanel', () => ({
  TrainingPanel: () => <div>Training</div>
}));

vi.mock('@/components/experiments/ExperimentsDashboard', () => ({
  ExperimentsDashboard: () => <div>Experiments</div>
}));

vi.mock('@/components/deployment/DeploymentDashboard', () => ({
  DeploymentDashboard: () => <div>Deployment</div>
}));

import { ProjectWorkspace } from './ProjectWorkspace';

describe('ProjectWorkspace notebook session ownership', () => {
  beforeEach(() => {
    notebookStoreMocks.disconnect.mockReset();
    phaseLoaderMocks.loadUploadArea.mockClear();
    phaseLoaderMocks.loadDataViewerTab.mockClear();
    phaseLoaderMocks.loadPreprocessingPanel.mockClear();
    phaseLoaderMocks.loadFeatureEngineeringPanel.mockClear();
    phaseLoaderMocks.loadTrainingPanel.mockClear();
    phaseLoaderMocks.loadExperimentsDashboard.mockClear();
    phaseLoaderMocks.loadDeploymentDashboard.mockClear();
    projectStoreState.setCurrentPhase.mockReset();
    projectStoreState.isPhaseUnlocked.mockClear();
    projectStoreState.setActiveProject.mockReset();
  });

  it('keeps the notebook session alive while experiments is active', () => {
    projectStoreState.projects[0].currentPhase = 'experiments';

    render(
      <MemoryRouter initialEntries={['/project/proj-1/experiments']}>
        <Routes>
          <Route path="/project/:projectId/:phase" element={<ProjectWorkspace />} />
        </Routes>
      </MemoryRouter>
    );

    expect(notebookStoreMocks.disconnect).not.toHaveBeenCalled();
  });

  it('does not lazy-load the experiments dashboard route shell', () => {
    const source = readFileSync('src/pages/ProjectWorkspace.tsx', 'utf8');

    expect(source).toContain("import { ExperimentsDashboard } from '@/components/experiments/ExperimentsDashboard';");
    expect(source).not.toContain('const ExperimentsDashboard = lazy(loadExperimentsDashboard);');
  });

  it('keeps the notebook session alive while deployment is active', () => {
    projectStoreState.projects[0].currentPhase = 'deployment';

    render(
      <MemoryRouter initialEntries={['/project/proj-1/deployment']}>
        <Routes>
          <Route path="/project/:projectId/:phase" element={<ProjectWorkspace />} />
        </Routes>
      </MemoryRouter>
    );

    expect(notebookStoreMocks.disconnect).not.toHaveBeenCalled();
  });

  it('does not lazy-load the deployment dashboard route shell', () => {
    const source = readFileSync('src/pages/ProjectWorkspace.tsx', 'utf8');

    expect(source).toContain("import { DeploymentDashboard } from '@/components/deployment/DeploymentDashboard';");
    expect(source).not.toContain('const DeploymentDashboard = lazy(loadDeploymentDashboard);');
  });

  it('does not keep experiments or deployment in the lazy phase preload helper', () => {
    const source = readFileSync('src/pages/projectWorkspacePhaseLoaders.ts', 'utf8');

    expect(source).not.toContain('loadExperimentsDashboard');
    expect(source).not.toContain('loadDeploymentDashboard');
    expect(source).not.toContain("case 'experiments':");
    expect(source).not.toContain("case 'deployment':");
  });

  it('keeps the notebook session alive while a notebook-backed phase is active', () => {
    projectStoreState.projects[0].currentPhase = 'training';

    const view = render(
      <MemoryRouter initialEntries={['/project/proj-1/training']}>
        <Routes>
          <Route path="/project/:projectId/:phase" element={<ProjectWorkspace />} />
        </Routes>
      </MemoryRouter>
    );

    expect(notebookStoreMocks.disconnect).not.toHaveBeenCalled();

    view.unmount();

    expect(notebookStoreMocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not disconnect while redirecting the processing alias to preprocessing', () => {
    projectStoreState.projects[0].currentPhase = 'preprocessing';

    render(
      <MemoryRouter initialEntries={['/project/proj-1/processing']}>
        <Routes>
          <Route path="/project/:projectId/:phase" element={<ProjectWorkspace />} />
        </Routes>
      </MemoryRouter>
    );

    expect(notebookStoreMocks.disconnect).not.toHaveBeenCalled();
  });

  it('does not disconnect while redirecting a locked phase back to the current phase', () => {
    projectStoreState.projects[0].currentPhase = 'training';
    projectStoreState.isPhaseUnlocked.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/project/proj-1/deployment']}>
        <Routes>
          <Route path="/project/:projectId/:phase" element={<ProjectWorkspace />} />
        </Routes>
      </MemoryRouter>
    );

    expect(notebookStoreMocks.disconnect).not.toHaveBeenCalled();
  });
});
