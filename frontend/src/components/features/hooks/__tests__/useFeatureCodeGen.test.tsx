import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatureCodeGen } from '../useFeatureCodeGen';

const mockNotebookState = vi.hoisted(() => ({
  activeNotebookId: null as string | null,
  cells: [] as Array<{
    cellId: string;
    cellType: 'code' | 'markdown';
    title?: string | null;
    content: string;
  }>,
  createCell: vi.fn(async () => ({ cellId: 'created-cell' })),
  updateCell: vi.fn(async () => ({ cellId: 'updated-cell' })),
  setActiveNotebook: vi.fn(async () => undefined)
}));

vi.mock('@/stores/notebookStore', () => ({
  useNotebookStore: (selector: (state: typeof mockNotebookState) => unknown) => selector(mockNotebookState)
}));

vi.mock('@/lib/features/codeGenerator', () => ({
  generateFeatureEngineeringCode: vi.fn(() => 'import pandas as pd\nprint("preview")')
}));

describe('useFeatureCodeGen', () => {
  beforeEach(() => {
    mockNotebookState.activeNotebookId = null;
    mockNotebookState.cells = [];
    mockNotebookState.createCell.mockReset();
    mockNotebookState.updateCell.mockReset();
    mockNotebookState.setActiveNotebook.mockReset();
  });

  it('does not mutate the global active notebook before the FE notebook is active', async () => {
    renderHook(() => useFeatureCodeGen(
      [
        {
          id: 'feature-1',
          projectId: 'project-1',
          sourceColumn: 'value',
          featureName: 'value_scaled',
          description: 'scale value',
          method: 'min_max_scale',
          category: 'numeric_transform',
          params: {},
          enabled: true,
          createdAt: new Date('2026-04-01T00:00:00.000Z').toISOString()
        }
      ],
      {
        id: 'file-1',
        name: 'dataset.csv',
        type: 'csv',
        size: 10,
        uploadedAt: new Date('2026-04-01T00:00:00.000Z'),
        projectId: 'project-1',
        metadata: {
          datasetId: 'dataset-1',
          columns: ['value']
        }
      },
      'fe-notebook-1'
    ));

    await waitFor(() => {
      expect(mockNotebookState.setActiveNotebook).not.toHaveBeenCalled();
    });

    expect(mockNotebookState.createCell).not.toHaveBeenCalled();
    expect(mockNotebookState.updateCell).not.toHaveBeenCalled();
  });

  it('does not create a preview cell implicitly when the resolved FE notebook is already active', async () => {
    mockNotebookState.activeNotebookId = 'fe-notebook-1';

    renderHook(() => useFeatureCodeGen(
      [
        {
          id: 'feature-1',
          projectId: 'project-1',
          sourceColumn: 'value',
          featureName: 'value_scaled',
          description: 'scale value',
          method: 'min_max_scale',
          category: 'numeric_transform',
          params: {},
          enabled: true,
          createdAt: new Date('2026-04-01T00:00:00.000Z').toISOString()
        }
      ],
      {
        id: 'file-1',
        name: 'dataset.csv',
        type: 'csv',
        size: 10,
        uploadedAt: new Date('2026-04-01T00:00:00.000Z'),
        projectId: 'project-1',
        metadata: {
          datasetId: 'dataset-1',
          columns: ['value']
        }
      },
      'fe-notebook-1'
    ));

    await waitFor(() => {
      expect(mockNotebookState.createCell).not.toHaveBeenCalled();
    });
  });

  it('updates an existing preview cell when one already exists', async () => {
    mockNotebookState.activeNotebookId = 'fe-notebook-1';
    mockNotebookState.cells = [
      {
        cellId: 'preview-cell-1',
        cellType: 'code',
        title: 'Feature Pipeline Preview',
        content: 'old preview'
      }
    ];

    renderHook(() => useFeatureCodeGen(
      [
        {
          id: 'feature-1',
          projectId: 'project-1',
          sourceColumn: 'value',
          featureName: 'value_scaled',
          description: 'scale value',
          method: 'min_max_scale',
          category: 'numeric_transform',
          params: {},
          enabled: true,
          createdAt: new Date('2026-04-01T00:00:00.000Z').toISOString()
        }
      ],
      {
        id: 'file-1',
        name: 'dataset.csv',
        type: 'csv',
        size: 10,
        uploadedAt: new Date('2026-04-01T00:00:00.000Z'),
        projectId: 'project-1',
        metadata: {
          datasetId: 'dataset-1',
          columns: ['value']
        }
      },
      'fe-notebook-1'
    ));

    await waitFor(() => {
      expect(mockNotebookState.updateCell).toHaveBeenCalledWith('preview-cell-1', expect.objectContaining({
        title: 'Feature Pipeline Preview'
      }));
    });
  });
});
