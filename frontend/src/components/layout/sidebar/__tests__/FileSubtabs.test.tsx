import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { FileSubtabs } from '../FileSubtabs';

const mockState = vi.hoisted(() => ({
  hydrateFromBackendMock: vi.fn(() => Promise.resolve()),
  openFileTabMock: vi.fn(),
  removeFileMock: vi.fn(),
  files: [] as Array<{
    id: string;
    name: string;
    type: 'csv';
    size: number;
    uploadedAt: Date;
    projectId: string;
    metadata?: Record<string, unknown>;
  }>,
}));

vi.mock('@/stores/dataStore', () => {
  const storeState = () => ({
    files: mockState.files,
    activeFileTabId: null,
    hydrateFromBackend: mockState.hydrateFromBackendMock,
    openFileTab: mockState.openFileTabMock,
    removeFile: mockState.removeFileMock,
    markDeleted: vi.fn(),
  });

  return {
    useDataStore: Object.assign(
      (selector: (state: unknown) => unknown) => selector(storeState()),
      { getState: storeState }
    ),
  };
});

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      projects: [{
        id: 'p1',
        currentPhase: 'upload',
      }],
      isPhaseUnlocked: () => true,
    }),
}));

describe('FileSubtabs', () => {
  beforeEach(() => {
    mockState.hydrateFromBackendMock.mockClear();
    mockState.openFileTabMock.mockClear();
    mockState.removeFileMock.mockClear();

    mockState.files = [{
      id: 'file-1',
      name: 'employees.csv',
      type: 'csv',
      size: 128,
      uploadedAt: new Date('2026-02-24T00:00:00.000Z'),
      projectId: 'p1',
      metadata: { datasetId: 'dataset-1' },
    }];
  });

  it('renders existing files without hydrating on mount', () => {
    render(
      <TooltipProvider>
        <MemoryRouter initialEntries={['/project/p1/upload']}>
          <Routes>
            <Route path="/project/:projectId/upload" element={<FileSubtabs projectId="p1" />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    );

    expect(screen.getByText('employees.csv')).toBeInTheDocument();
    expect(mockState.hydrateFromBackendMock).not.toHaveBeenCalled();
  });
});
