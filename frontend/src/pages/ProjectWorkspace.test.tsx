import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const notebookStoreMocks = vi.hoisted(() => ({
  disconnect: vi.fn()
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

vi.mock('@/components/notebook/NotebookPage', () => ({
  NotebookPage: () => <div>Notebook</div>
}));

import { ProjectWorkspace } from './ProjectWorkspace';

describe('ProjectWorkspace notebook session ownership', () => {
  beforeEach(() => {
    notebookStoreMocks.disconnect.mockReset();
    projectStoreState.setCurrentPhase.mockReset();
    projectStoreState.isPhaseUnlocked.mockClear();
    projectStoreState.setActiveProject.mockReset();
  });

  it('disconnects the notebook session when rendering a non-notebook-backed phase', () => {
    projectStoreState.projects[0].currentPhase = 'deployment';

    render(
      <MemoryRouter initialEntries={['/project/proj-1/deployment']}>
        <Routes>
          <Route path="/project/:projectId/:phase" element={<ProjectWorkspace />} />
        </Routes>
      </MemoryRouter>
    );

    expect(notebookStoreMocks.disconnect).toHaveBeenCalledTimes(1);
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
