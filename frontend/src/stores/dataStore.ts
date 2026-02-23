/**
 * Data Store - Zustand state management for uploaded files and datasets
 *
 * Manages:
 * - File uploads and storage
 * - Data preview and statistics
 * - Current active dataset
 * - Query artifacts (saved query results)
 * - Backend hydration for persisted datasets
 */

import { create } from 'zustand';
import type { UploadedFile, DataPreview, QueryArtifact, QueryMode, FileMetadata } from '@/types/file';
import { listDatasets, deleteDataset } from '@/lib/api/datasets';
import { listDocuments, deleteDocument } from '@/lib/api/documents';
import { getFileType } from '@/types/file';

interface DataState {
  files: UploadedFile[];
  previews: DataPreview[];
  isProcessing: boolean;

  // Query artifacts
  queryArtifacts: QueryArtifact[];
  activeArtifactId: string | null;
  queryCounter: number; // For auto-naming artifacts

  // File tab management (for Data Viewer phase)
  activeFileTabId: string | null; // Can be fileId or artifactId
  fileTabType: 'file' | 'artifact' | null; // Track what type of tab is active
  openFileTabs: string[];

  // Hydration state (per project)
  hydratedProjects: Set<string>;
  isHydrating: boolean;
  hydrationError: string | null;

  // File actions
  addFile: (file: UploadedFile) => void;
  removeFile: (id: string) => void;
  deleteFile: (id: string) => Promise<void>; // Delete from backend + state
  getFilesByProject: (projectId: string) => UploadedFile[];
  addPreview: (preview: DataPreview) => void;
  removePreview: (fileId: string) => void;
  getPreviewByFileId: (fileId: string) => DataPreview | undefined;
  setProcessing: (processing: boolean) => void;
  clearProjectData: (projectId: string) => void;
  setFileMetadata: (fileId: string, metadata: Partial<FileMetadata>) => void;

  // Hydration actions
  hydrateFromBackend: (projectId: string, options?: { force?: boolean }) => Promise<void>;

  // Query artifact actions
  createArtifact: (
    query: string,
    mode: QueryMode,
    result: DataPreview,
    projectId: string,
    metadata?: Partial<
      Pick<
        QueryArtifact,
        'eda' | 'cached' | 'executionMs' | 'generatedSql' | 'rationale' | 'name' | 'cacheTimestamp'
      >
    >
  ) => string;
  updateArtifact: (id: string, updates: Partial<QueryArtifact>) => void;
  removeArtifact: (id: string) => void;
  setActiveArtifact: (id: string | null) => void;
  // NOTE: Use getArtifactsByProject() sparingly - it returns a new array reference.
  // In components, prefer: const all = useDataStore(s => s.queryArtifacts) + useMemo filter
  getArtifactsByProject: (projectId: string) => QueryArtifact[];
  clearProjectArtifacts: (projectId: string) => void;

  // File tab actions
  setActiveFileTab: (id: string | null, type: 'file' | 'artifact' | null) => void;
  openFileTab: (id: string) => void;
  closeFileTab: (id: string) => void;
}

function sanitizeTableName(filename: string, datasetId: string): string {
  const baseName = filename.replace(/\.[^/.]+$/, '');
  let safe = baseName
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[^a-zA-Z]/, 'table_')
    .toLowerCase();

  if (!safe) {
    safe = 'table_data';
  }

  const suffix = datasetId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  const separator = suffix ? `_${suffix}` : '';
  const maxBaseLength = 63 - separator.length;
  const trimmed = safe.slice(0, maxBaseLength);

  return `${trimmed || 'table_data'}${separator}`;
}

export const useDataStore = create<DataState>((set, get) => ({
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
  hydrationError: null,

  // File actions
  addFile: (file: UploadedFile) => {
    set((state) => ({
      files: [...state.files, file],
      openFileTabs:
        ['csv', 'json', 'excel'].includes(file.type) && !state.openFileTabs.includes(file.id)
          ? [...state.openFileTabs, file.id]
          : state.openFileTabs
    }));
  },

  removeFile: (id: string) => {
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
      previews: state.previews.filter((p) => p.fileId !== id),
      openFileTabs: state.openFileTabs.filter((tabId) => tabId !== id),
      ...(() => {
        if (state.activeFileTabId !== id || state.fileTabType !== 'file') {
          return {};
        }
        const remainingTabs = state.openFileTabs.filter((tabId) => tabId !== id);
        if (remainingTabs.length > 0) {
          return { activeFileTabId: remainingTabs[0], fileTabType: 'file' as const };
        }
        if (state.queryArtifacts.length > 0) {
          return { activeFileTabId: state.queryArtifacts[0].id, fileTabType: 'artifact' as const };
        }
        return { activeFileTabId: null, fileTabType: null };
      })()
    }));
  },

  deleteFile: async (id: string) => {
    const file = get().files.find((f) => f.id === id);
    if (!file) return;

    // If file has been uploaded to backend, delete it there first
    if (file.metadata?.datasetId) {
      try {
        await deleteDataset(file.metadata.datasetId);
      } catch (error) {
        console.error('[dataStore] Failed to delete dataset from backend:', error);
        throw error; // Re-throw so UI can handle it
      }
    }
    if (file.metadata?.documentId) {
      try {
        await deleteDocument(file.metadata.documentId);
      } catch (error) {
        console.error('[dataStore] Failed to delete document from backend:', error);
        throw error;
      }
    }

    // Remove from local state
    get().removeFile(id);
  },

  getFilesByProject: (projectId: string) => {
    return get().files.filter((f) => f.projectId === projectId);
  },

  addPreview: (preview: DataPreview) => {
    set((state) => ({
      previews: [...state.previews.filter((p) => p.fileId !== preview.fileId), preview]
    }));
  },

  removePreview: (fileId: string) => {
    set((state) => ({
      previews: state.previews.filter((p) => p.fileId !== fileId)
    }));
  },

  getPreviewByFileId: (fileId: string) => {
    return get().previews.find((p) => p.fileId === fileId);
  },

  setProcessing: (processing: boolean) => {
    set({ isProcessing: processing });
  },

  clearProjectData: (projectId: string) => {
    const filesToRemove = get().files.filter((f) => f.projectId === projectId);
    const fileIdsToRemove = filesToRemove.map((f) => f.id);

    set((state) => ({
      files: state.files.filter((f) => f.projectId !== projectId),
      previews: state.previews.filter((p) => !fileIdsToRemove.includes(p.fileId)),
      openFileTabs: state.openFileTabs.filter((tabId) => !fileIdsToRemove.includes(tabId)),
      ...(() => {
        if (!state.activeFileTabId || !fileIdsToRemove.includes(state.activeFileTabId)) {
          return {};
        }
        return { activeFileTabId: null, fileTabType: null };
      })()
    }));
  },

  setFileMetadata: (fileId: string, metadata: Partial<FileMetadata>) => {
    set((state) => ({
      files: state.files.map((file) =>
        file.id === fileId
          ? {
              ...file,
              metadata: {
                ...(file.metadata ?? {}),
                ...metadata
              }
            }
          : file
      )
    }));
  },

  // Query artifact actions
  createArtifact: (
    query: string,
    mode: QueryMode,
    result: DataPreview,
    projectId: string,
    metadata?
  ) => {
    const state = get();
    const id = `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const counter = state.queryCounter + 1;
    const name = metadata?.name || `Query ${counter}`;

    const artifact: QueryArtifact = {
      id,
      name,
      query,
      mode,
      result,
      timestamp: new Date(),
      isSaved: false,
      projectId,
      eda: metadata?.eda,
      cached: metadata?.cached,
      executionMs: metadata?.executionMs,
      cacheTimestamp: metadata?.cacheTimestamp,
      generatedSql: metadata?.generatedSql,
      rationale: metadata?.rationale
    };

    set((state) => ({
      queryArtifacts: [...state.queryArtifacts, artifact],
      activeArtifactId: id,
      queryCounter: counter
    }));

    return id;
  },

  updateArtifact: (id: string, updates: Partial<QueryArtifact>) => {
    set((state) => ({
      queryArtifacts: state.queryArtifacts.map((artifact) =>
        artifact.id === id ? { ...artifact, ...updates } : artifact
      )
    }));
  },

  removeArtifact: (id: string) => {
    set((state) => ({
      queryArtifacts: state.queryArtifacts.filter((artifact) => artifact.id !== id),
      activeArtifactId: state.activeArtifactId === id ? null : state.activeArtifactId
    }));
  },

  setActiveArtifact: (id: string | null) => {
    set({ activeArtifactId: id });
  },

  getArtifactsByProject: (projectId: string) => {
    return get().queryArtifacts.filter((artifact) => artifact.projectId === projectId);
  },

  clearProjectArtifacts: (projectId: string) => {
    set((state) => ({
      queryArtifacts: state.queryArtifacts.filter((artifact) => artifact.projectId !== projectId),
      activeArtifactId:
        state.queryArtifacts.find((a) => a.id === state.activeArtifactId)?.projectId === projectId
          ? null
          : state.activeArtifactId
    }));
  },

  // File tab actions
  setActiveFileTab: (id: string | null, type: 'file' | 'artifact' | null) => {
    set({ activeFileTabId: id, fileTabType: type });
  },
  openFileTab: (id: string) => {
    set((state) => ({
      openFileTabs: state.openFileTabs.includes(id)
        ? state.openFileTabs
        : [...state.openFileTabs, id],
      activeFileTabId: id,
      fileTabType: 'file'
    }));
  },
  closeFileTab: (id: string) => {
    set((state) => {
      const remainingTabs = state.openFileTabs.filter((tabId) => tabId !== id);
      if (state.activeFileTabId !== id || state.fileTabType !== 'file') {
        return { openFileTabs: remainingTabs };
      }
      if (remainingTabs.length > 0) {
        return {
          openFileTabs: remainingTabs,
          activeFileTabId: remainingTabs[0],
          fileTabType: 'file'
        };
      }
      if (state.queryArtifacts.length > 0) {
        return {
          openFileTabs: remainingTabs,
          activeFileTabId: state.queryArtifacts[0].id,
          fileTabType: 'artifact'
        };
      }
      return {
        openFileTabs: remainingTabs,
        activeFileTabId: null,
        fileTabType: null
      };
    });
  },

  // Hydration - Load persisted datasets from backend
  async hydrateFromBackend(projectId: string, options) {
    const state = get();
    const force = options?.force ?? false;

    // Skip if already hydrated for this project or currently hydrating
    if ((!force && state.hydratedProjects.has(projectId)) || state.isHydrating) {
      return;
    }

    set({ isHydrating: true, hydrationError: null });

    try {
      const { datasets } = await listDatasets(projectId);
      const { documents } = await listDocuments(projectId).catch((error) => {
        console.warn('[dataStore] Failed to list documents:', error);
        return { documents: [] };
      });

      const hydratedFiles: UploadedFile[] = [];
      const hydratedPreviews: DataPreview[] = [];
      const hydratedDocuments: UploadedFile[] = [];
      const previousProjectFileIds = new Set(
        state.files.filter((file) => file.projectId === projectId).map((file) => file.id)
      );
      const existingDatasetIds = new Set(
        state.files
          .filter((file) => file.projectId === projectId && file.metadata?.datasetId)
          .map((file) => file.id)
      );

      for (const dataset of datasets) {
        const fileId = dataset.datasetId;

        // Create UploadedFile entry
        const file: UploadedFile = {
          id: fileId,
          name: dataset.filename,
          type: getFileType({ name: dataset.filename } as File),
          size: dataset.size,
          uploadedAt: new Date(dataset.createdAt),
          projectId,
          metadata: {
            datasetId: dataset.datasetId,
            rowCount: dataset.nRows,
            columnCount: dataset.nCols,
            columns: dataset.columns.map(c => c.name),
            tableName: dataset.tableName ?? dataset.metadata?.tableName ?? sanitizeTableName(dataset.filename, dataset.datasetId),
            datasetProfile: {
              nRows: dataset.nRows,
              nCols: dataset.nCols,
              dtypes: Object.fromEntries(dataset.columns.map(c => [c.name, c.dtype])),
              nullCounts: Object.fromEntries(dataset.columns.map(c => [c.name, c.nullCount]))
            }
          }
        };

        // Create DataPreview entry
        const preview: DataPreview = {
          fileId,
          headers: dataset.columns.map(c => c.name),
          rows: dataset.sample,
          totalRows: dataset.nRows,
          previewRows: dataset.sample.length
        };

        hydratedFiles.push(file);
        hydratedPreviews.push(preview);
      }

      for (const document of documents) {
        hydratedDocuments.push({
          id: document.documentId,
          name: document.filename,
          type: getFileType({ name: document.filename } as File),
          size: document.byteSize ?? 0,
          uploadedAt: document.createdAt ? new Date(document.createdAt) : new Date(),
          projectId: document.projectId ?? projectId,
          metadata: {
            documentId: document.documentId,
            mimeType: document.mimeType,
            parseWarning:
              typeof document.metadata?.parseError === 'string'
                ? document.metadata.parseError
                : (document.metadata?.parseWarning as string | undefined),
            ...(document.metadata ?? {})
          }
        });
      }

      set((state) => {
        const newHydratedProjects = new Set(state.hydratedProjects);
        newHydratedProjects.add(projectId);
        const hydratedIds = new Set([...hydratedFiles, ...hydratedDocuments].map((file) => file.id));
        const nextOpenFileTabs = state.openFileTabs.filter((tabId) => {
          if (!previousProjectFileIds.has(tabId)) return true;
          return hydratedIds.has(tabId);
        });
        const nextOpenSet = new Set(nextOpenFileTabs);
        hydratedFiles.forEach((file) => {
          if (!existingDatasetIds.has(file.id)) {
            nextOpenSet.add(file.id);
          }
        });

        return {
          files: [
            ...state.files.filter((file) => file.projectId !== projectId),
            ...hydratedFiles,
            ...hydratedDocuments
          ],
          previews: [
            ...state.previews.filter(p =>
              !hydratedFiles.some(f => f.id === p.fileId)
            ),
            ...hydratedPreviews
          ],
          hydratedProjects: newHydratedProjects,
          openFileTabs: Array.from(nextOpenSet),
          isHydrating: false
        };
      });

      console.log(
        `[dataStore] Hydrated ${hydratedFiles.length} datasets and ${hydratedDocuments.length} documents for project ${projectId}`
      );
    } catch (error) {
      console.error('[dataStore] Failed to hydrate from backend:', error);
      set((state) => {
        const newHydratedProjects = new Set(state.hydratedProjects);
        newHydratedProjects.add(projectId); // Mark as attempted to prevent retry loops

        return {
          hydratedProjects: newHydratedProjects,
          isHydrating: false,
          hydrationError: error instanceof Error ? error.message : 'Failed to load datasets'
        };
      });
    }
  }
}));
