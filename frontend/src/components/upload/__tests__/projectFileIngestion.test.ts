import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ingestProjectFile, isProjectFileReady } from '../projectFileIngestion';
import { uploadDatasetFile } from '@/lib/api/datasets';
import { uploadDocument } from '@/lib/api/documents';

vi.mock('@/lib/api/datasets', () => ({
  uploadDatasetFile: vi.fn(),
}));

vi.mock('@/lib/api/documents', () => ({
  uploadDocument: vi.fn(),
}));

describe('projectFileIngestion', () => {
  const addFile = vi.fn();
  const addPreview = vi.fn();
  const setFileMetadata = vi.fn();
  const hydrateFromBackend = vi.fn().mockResolvedValue(undefined);
  const refreshProjectSuggestions = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps dataset ingestion side effects consistent across callers', async () => {
    vi.mocked(uploadDatasetFile).mockResolvedValue({
      dataset: {
        datasetId: 'dataset-1',
        filename: 'orders.csv',
        fileType: 'csv',
        size: 10,
        n_rows: 2,
        n_cols: 2,
        columns: ['id', 'amount'],
        dtypes: { id: 'integer', amount: 'float' },
        null_counts: { id: 0, amount: 0 },
        sample: [{ id: 1, amount: 12.5 }],
        createdAt: '2026-03-31T00:00:00.000Z',
        tableName: 'orders_table',
        eda: { numericColumns: [], categoricalColumns: [], dataQuality: [] },
      },
    });

    const file = new File(['id,amount\n1,12.5'], 'orders.csv', { type: 'text/csv' });
    const result = await ingestProjectFile({
      projectId: 'project-1',
      file,
      addFileWhen: 'after-upload',
      addFile,
      addPreview,
      setFileMetadata,
      hydrateFromBackend,
      refreshProjectSuggestions,
    });

    expect(addFile).toHaveBeenCalledTimes(1);
    expect(setFileMetadata).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        datasetId: 'dataset-1',
        tableName: 'orders_table',
        rowCount: 2,
        columnCount: 2,
      }),
    );
    expect(addPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ['id', 'amount'],
        totalRows: 2,
        eda: { numericColumns: [], categoricalColumns: [], dataQuality: [] },
      }),
    );
    expect(hydrateFromBackend).toHaveBeenCalledWith('project-1', { force: true });
    expect(refreshProjectSuggestions).toHaveBeenCalledWith('project-1', { force: true });
    expect(result.summary).toEqual(
      expect.objectContaining({
        kind: 'dataset',
        nRows: 2,
        nCols: 2,
      }),
    );
  });

  it('stores document mime and parse metadata during ingestion', async () => {
    vi.mocked(uploadDocument).mockResolvedValue({
      document: {
        documentId: 'document-1',
        projectId: 'project-1',
        filename: 'notes.md',
        mimeType: 'text/markdown',
        chunkCount: 4,
        embeddingDimension: 384,
        parseWarning: 'Minor formatting issue',
      },
    });

    const file = new File(['hello'], 'notes.md', { type: 'text/markdown' });
    const result = await ingestProjectFile({
      projectId: 'project-1',
      file,
      addFileWhen: 'after-upload',
      addFile,
      addPreview,
      setFileMetadata,
      hydrateFromBackend,
      refreshProjectSuggestions,
    });

    expect(addPreview).not.toHaveBeenCalled();
    expect(setFileMetadata).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        documentId: 'document-1',
        mimeType: 'text/markdown',
        parseWarning: 'Minor formatting issue',
      }),
    );
    expect(result.summary).toEqual(
      expect.objectContaining({
        kind: 'document',
        fileType: 'text/markdown',
        chunkCount: 4,
      }),
    );
  });

  it('uses shared file readiness rules', () => {
    expect(isProjectFileReady({ type: 'csv', metadata: { datasetId: 'dataset-1' } })).toBe(true);
    expect(isProjectFileReady({ type: 'csv', metadata: {} })).toBe(false);
    expect(isProjectFileReady({ type: 'markdown', metadata: { documentId: 'document-1' } })).toBe(true);
    expect(isProjectFileReady({ type: 'markdown', metadata: {} })).toBe(false);
    expect(isProjectFileReady({ type: 'other', metadata: {} })).toBe(true);
  });
});
