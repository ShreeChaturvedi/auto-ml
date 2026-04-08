/**
 * File Slice — file CRUD, metadata, previews, tab management
 */

import type { StateCreator } from 'zustand';
import type {
  UploadedFile,
  DataPreview,
  FileMetadata,
  ColumnDataType
} from '@/types/file';
import { deleteDataset, updateDatasetColumnType } from '@/lib/api/datasets';
import { deleteDocument } from '@/lib/api/documents';
import { useNlSuggestionStore } from '@/stores/nlSuggestionStore';
import type { DataState } from '../dataStore';

export interface FileSlice {
  // State
  files: UploadedFile[];
  previews: DataPreview[];
  isProcessing: boolean;
  activeFileTabId: string | null;
  fileTabType: 'file' | 'artifact' | 'plan' | null;
  openFileTabs: string[];

  // Actions
  addFile: (file: UploadedFile) => void;
  removeFile: (id: string) => void;
  deleteFile: (id: string) => Promise<void>;
  getFilesByProject: (projectId: string) => UploadedFile[];
  addPreview: (preview: DataPreview) => void;
  appendPreviewPage: (
    fileId: string,
    page: {
      offset: number;
      rows: Record<string, unknown>[];
      rowCount: number;
    }
  ) => void;
  removePreview: (fileId: string) => void;
  getPreviewByFileId: (fileId: string) => DataPreview | undefined;
  setProcessing: (processing: boolean) => void;
  clearProjectData: (projectId: string) => void;
  setFileMetadata: (fileId: string, metadata: Partial<FileMetadata>) => void;
  updateColumnType: (datasetId: string, columnName: string, newType: ColumnDataType) => Promise<void>;
  setActiveFileTab: (id: string | null, type: 'file' | 'artifact' | 'plan' | null) => void;
  openFileTab: (id: string) => void;
  closeFileTab: (id: string) => void;
}

export const MAX_PREVIEW_ROWS = 2000;

export const createFileSlice: StateCreator<DataState, [], [], FileSlice> = (set, get) => ({
  files: [],
  previews: [],
  isProcessing: false,
  activeFileTabId: null,
  fileTabType: null,
  openFileTabs: [],

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

    // Mark as recently deleted to guard against hydration races
    if (file.metadata?.datasetId) get().markDeleted(file.metadata.datasetId);
    if (file.metadata?.documentId) get().markDeleted(file.metadata.documentId);

    if (file.metadata?.datasetId) {
      try {
        await deleteDataset(file.metadata.datasetId);
      } catch (error) {
        console.error('[dataStore] Failed to delete dataset from backend:', error);
        throw error;
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

    get().removeFile(id);

    const promises: Promise<unknown>[] = [];
    if (file.metadata?.datasetId && file.projectId) {
      promises.push(useNlSuggestionStore.getState().fetchProjectSuggestions(file.projectId, { force: true }));
    }
    // Re-hydrate to reconcile local state with backend's post-delete state
    if (file.projectId) {
      promises.push(get().hydrateFromBackend(file.projectId, { force: true }));
    }
    await Promise.all(promises);
  },

  getFilesByProject: (projectId: string) => {
    return get().files.filter((f) => f.projectId === projectId);
  },

  addPreview: (preview: DataPreview) => {
    set((state) => ({
      previews: [...state.previews.filter((p) => p.fileId !== preview.fileId), preview]
    }));
  },

  appendPreviewPage: (fileId, page) => {
    const { offset, rows, rowCount } = page;
    if (rows.length === 0) {
      return;
    }

    set((state) => ({
      previews: state.previews.map((preview) => {
        if (preview.fileId !== fileId) {
          return preview;
        }

        const overlap = Math.max(0, preview.rows.length - offset);
        const nextRows = overlap >= rows.length
          ? preview.rows
          : [...preview.rows, ...rows.slice(overlap)];
        const clamped = nextRows.length > MAX_PREVIEW_ROWS ? nextRows.slice(0, MAX_PREVIEW_ROWS) : nextRows;

        return {
          ...preview,
          rows: clamped,
          totalRows: rowCount,
          previewRows: clamped.length
        };
      })
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

  updateColumnType: async (datasetId: string, columnName: string, newType: ColumnDataType) => {
    const file = get().files.find((candidate) => candidate.metadata?.datasetId === datasetId);
    if (!file) {
      throw new Error(`Dataset ${datasetId} is not loaded in the data store`);
    }

    await updateDatasetColumnType(datasetId, columnName, newType);
    await Promise.all([
      get().hydrateFromBackend(file.projectId, { force: true }),
      useNlSuggestionStore.getState().fetchProjectSuggestions(file.projectId, { force: true })
    ]);
  },

  setActiveFileTab: (id: string | null, type: 'file' | 'artifact' | 'plan' | null) => {
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
  }
});
