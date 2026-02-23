import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UploadArea } from '../UploadArea';

const updateProjectMock = vi.fn(() => Promise.resolve(undefined));
const completePhaseMock = vi.fn();
const hydrateFromBackendMock = vi.fn(() => Promise.resolve());

let projectState: {
  activeProjectId: string | null;
  projects: Array<{
    id: string;
    title: string;
    description?: string;
    icon: string;
    color: 'blue';
    metadata?: Record<string, unknown>;
  }>;
};

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      ...projectState,
      updateProject: updateProjectMock,
      completePhase: completePhaseMock
    })
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      hydrateFromBackend: hydrateFromBackendMock,
      files: []
    })
}));

vi.mock('../ProjectHeader', () => ({
  ProjectHeader: () => <div data-testid="project-header" />
}));

vi.mock('../UploadStage', () => ({
  UploadStage: ({ onNext }: { onNext: () => void }) => (
    <button type="button" data-testid="upload-stage-next" onClick={onNext}>Upload Next</button>
  )
}));

vi.mock('../ProcessingStage', () => ({
  ProcessingStage: ({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) => (
    <div>
      <button type="button" data-testid="processing-complete" onClick={onComplete}>Processing Complete</button>
      <button type="button" data-testid="processing-back" onClick={onBack}>Processing Back</button>
    </div>
  )
}));

vi.mock('../PlanningStage', () => ({
  PlanningStage: ({ onPlanApproved, onBack }: { onPlanApproved: (plan: string, name: string) => void; onBack: () => void }) => (
    <div>
      <button type="button" data-testid="plan-approve" onClick={() => onPlanApproved('# Plan', 'bold-falcon-123')}>Approve</button>
      <button type="button" data-testid="plan-back" onClick={onBack}>Back</button>
    </div>
  )
}));

function renderUploadArea() {
  return render(
    <MemoryRouter initialEntries={[`/project/p1/upload`]}>
      <Routes>
        <Route path="/project/:projectId/upload" element={<UploadArea />} />
        <Route path="/project/:projectId/data-viewer" element={<div data-testid="data-viewer-route" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('UploadArea stage machine', () => {
  beforeEach(() => {
    updateProjectMock.mockClear();
    completePhaseMock.mockClear();
    hydrateFromBackendMock.mockClear();

    projectState = {
      activeProjectId: 'p1',
      projects: [{
        id: 'p1',
        title: 'Project 1',
        description: 'desc',
        icon: 'Folder',
        color: 'blue',
        metadata: {}
      }]
    };
  });

  it('transitions upload -> processing -> chat', async () => {
    renderUploadArea();

    expect(hydrateFromBackendMock).toHaveBeenCalledWith('p1');

    fireEvent.click(screen.getByTestId('upload-stage-next'));
    expect(screen.getByTestId('processing-complete')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('processing-complete'));
    expect(screen.getByTestId('plan-approve')).toBeInTheDocument();

    await waitFor(() => {
      expect(updateProjectMock).toHaveBeenCalled();
    });
  });

  it('restores saved chat stage and approves into data-viewer navigation', async () => {
    projectState.projects[0] = {
      ...projectState.projects[0],
      metadata: {
        uploadStage: 'chat'
      }
    };

    renderUploadArea();
    expect(screen.getByTestId('plan-approve')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('plan-approve'));

    await waitFor(() => {
      expect(completePhaseMock).toHaveBeenCalledWith('p1', 'upload');
      expect(screen.getByTestId('data-viewer-route')).toBeInTheDocument();
    });
  });
});
