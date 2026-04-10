import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listDatasets } from '../../lib/api/datasets';
import { listDocuments } from '../../lib/api/documents';
import type { UploadedFile } from '../../types/file';
import { useDataStore } from '../dataStore';

vi.mock('../../lib/api/datasets', () => ({
  listDatasets: vi.fn()
}));

vi.mock('../../lib/api/documents', () => ({
  listDocuments: vi.fn(),
  deleteDocument: vi.fn(),
  downloadDocument: vi.fn()
}));

const listDatasetsMock = vi.mocked(listDatasets);
const listDocumentsMock = vi.mocked(listDocuments);

function resetDataStore() {
  useDataStore.setState({
    files: [],
    previews: [],
    isProcessing: false,
    queryArtifacts: [],
    activeArtifactId: null,
    queryCounter: 0,
    activeFileTabId: null,
    fileTabType: null,
    openFileTabs: [],
    hydratedProjects: new Set<string>(),
    isHydrating: false,
    hydrationError: null
  });
}

describe('dataStore hydrateFromBackend', () => {
  beforeEach(() => {
    resetDataStore();
    listDatasetsMock.mockResolvedValue({ datasets: [] });
    listDocumentsMock.mockResolvedValue({ documents: [] });
  });

  it('keeps local in-flight uploads during hydration', async () => {
    const localFile: UploadedFile = {
      id: 'local-1',
      projectId: 'project-1',
      name: 'employees.csv',
      type: 'csv',
      size: 123,
      uploadedAt: new Date(),
      metadata: {}
    };

    useDataStore.setState({
      files: [localFile],
      previews: [
        {
          fileId: 'local-1',
          headers: ['id'],
          rows: [{ id: 1 }],
          totalRows: 1,
          previewRows: 1
        }
      ],
      openFileTabs: [{ id: 'local-1', type: 'file' }]
    });

    await useDataStore.getState().hydrateFromBackend('project-1');

    const state = useDataStore.getState();
    expect(state.files.some((file) => file.id === 'local-1')).toBe(true);
    expect(state.openFileTabs.some((tab) => tab.id === 'local-1' && tab.type === 'file')).toBe(true);
  });

  it('replaces matching local in-flight upload when backend has canonical dataset', async () => {
    const localFile: UploadedFile = {
      id: 'local-1',
      projectId: 'project-1',
      name: 'employees.csv',
      type: 'csv',
      size: 123,
      uploadedAt: new Date(),
      metadata: {}
    };

    useDataStore.setState({
      files: [localFile],
      previews: [
        {
          fileId: 'local-1',
          headers: ['id'],
          rows: [{ id: 1 }],
          totalRows: 1,
          previewRows: 1
        }
      ],
      openFileTabs: [{ id: 'local-1', type: 'file' }]
    });

    listDatasetsMock.mockResolvedValue({
      datasets: [
        {
          datasetId: 'dataset-1',
          projectId: 'project-1',
          filename: 'employees.csv',
          fileType: 'csv',
          size: 123,
          nRows: 2,
          nCols: 2,
          columns: [
            { name: 'id', dtype: 'integer', nullCount: 0 },
            { name: 'name', dtype: 'string', nullCount: 0 }
          ],
          sample: [
            { id: 1, name: 'A' },
            { id: 2, name: 'B' }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tableName: 'employees_abcd1234'
        }
      ]
    });

    await useDataStore.getState().hydrateFromBackend('project-1', { force: true });

    const state = useDataStore.getState();
    const projectFiles = state.files.filter((file) => file.projectId === 'project-1');
    expect(projectFiles.some((file) => file.id === 'local-1')).toBe(false);
    expect(projectFiles.some((file) => file.id === 'dataset-1')).toBe(true);
    expect(state.previews.some((preview) => preview.fileId === 'local-1')).toBe(false);
  });
});
