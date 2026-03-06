import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileExplorer } from '../FileExplorer';

const mockState = vi.hoisted(() => ({
  hydrateFromBackendMock: vi.fn(() => Promise.resolve()),
  openFileTabMock: vi.fn(),
  removeFileMock: vi.fn(),
  updateProjectMock: vi.fn(() => Promise.resolve(undefined)),
  toastInfoMock: vi.fn(),
  isDataViewerUnlocked: false,
  files: [] as Array<{
    id: string;
    name: string;
    type: 'csv';
    size: number;
    uploadedAt: Date;
    projectId: string;
  }>,
  projects: [] as Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    color: 'blue';
    createdAt: Date;
    updatedAt: Date;
    unlockedPhases: string[];
    currentPhase: string;
    completedPhases: string[];
    metadata: Record<string, unknown>;
  }>
}));

vi.mock('sonner', () => ({
  toast: {
    info: mockState.toastInfoMock
  }
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      files: mockState.files,
      activeFileTabId: null,
      hydrateFromBackend: mockState.hydrateFromBackendMock,
      openFileTab: mockState.openFileTabMock,
      removeFile: mockState.removeFileMock
    })
}));

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      projects: mockState.projects,
      updateProject: mockState.updateProjectMock,
      isPhaseUnlocked: (_projectId: string, phase: string) =>
        phase === 'data-viewer' ? mockState.isDataViewerUnlocked : true
    })
}));

function renderFileExplorer() {
  return render(
    <MemoryRouter initialEntries={['/project/p1/upload']}>
      <Routes>
        <Route path="/project/:projectId/upload" element={<FileExplorer projectId="p1" />} />
        <Route path="/project/:projectId/data-viewer" element={<div data-testid="data-viewer-route" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FileExplorer phase lock behavior', () => {
  beforeEach(() => {
    mockState.hydrateFromBackendMock.mockClear();
    mockState.openFileTabMock.mockClear();
    mockState.removeFileMock.mockClear();
    mockState.updateProjectMock.mockClear();
    mockState.toastInfoMock.mockClear();

    mockState.isDataViewerUnlocked = false;
    mockState.files = [{
      id: 'file-1',
      name: 'employees.csv',
      type: 'csv',
      size: 128,
      uploadedAt: new Date('2026-02-24T00:00:00.000Z'),
      projectId: 'p1'
    }];

    mockState.projects = [{
      id: 'p1',
      title: 'Project 1',
      description: 'desc',
      icon: 'Folder',
      color: 'blue',
      createdAt: new Date('2026-02-24T00:00:00.000Z'),
      updatedAt: new Date('2026-02-24T00:00:00.000Z'),
      unlockedPhases: ['upload'],
      currentPhase: 'upload',
      completedPhases: [],
      metadata: {}
    }];
  });

  it('shows a clear message instead of silently redirecting when explorer is locked', () => {
    renderFileExplorer();

    fireEvent.click(screen.getByText('employees.csv'));

    expect(mockState.toastInfoMock).toHaveBeenCalledWith(
      'Explorer is still locked',
      expect.objectContaining({
        description: 'Finish the Data Upload workflow to unlock Explorer.'
      })
    );
    expect(mockState.openFileTabMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('data-viewer-route')).not.toBeInTheDocument();
  });

  it('opens the file and navigates when explorer is unlocked', async () => {
    mockState.isDataViewerUnlocked = true;

    renderFileExplorer();

    fireEvent.click(screen.getByText('employees.csv'));

    expect(mockState.openFileTabMock).toHaveBeenCalledWith('file-1');
    await waitFor(() => {
      expect(screen.getByTestId('data-viewer-route')).toBeInTheDocument();
    });
    expect(mockState.toastInfoMock).not.toHaveBeenCalled();
  });

  it('does not crash when project currentPhase is stale or unknown', () => {
    mockState.projects = [{
      ...mockState.projects[0],
      currentPhase: 'feature'
    }];

    expect(() => renderFileExplorer()).not.toThrow();

    fireEvent.click(screen.getByText('employees.csv'));

    expect(mockState.toastInfoMock).toHaveBeenCalledWith(
      'Explorer is still locked',
      expect.objectContaining({
        description: 'Complete the current step to unlock Explorer.'
      })
    );
  });
});
