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
import type { OpenTab, TabType } from '@/types/dataViewer';
import { deleteDataset, updateDatasetColumnType } from '@/lib/api/datasets';
import { deleteDocument } from '@/lib/api/documents';
import { useNlSuggestionStore } from '@/stores/nlSuggestionStore';
import { useNotebookStore } from '@/stores/notebookStore';
import type { DataState } from '../dataStore';

export interface FileSlice {
  // State
  files: UploadedFile[];
  previews: DataPreview[];
  isProcessing: boolean;
  activeFileTabId: string | null;
  fileTabType: TabType | 'plan' | null;
  openFileTabs: OpenTab[];

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
  setActiveFileTab: (id: string | null, type: TabType | 'plan' | null) => void;
  openFileTab: (id: string) => void;
  openNotebookTab: (notebookId: string) => void;
  closeFileTab: (id: string, type: TabType) => void;
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
    set((state) => {
      const alreadyOpen = state.openFileTabs.some(
        (tab) => tab.type === 'file' && tab.id === file.id
      );
      const shouldOpen = ['csv', 'json', 'excel'].includes(file.type) && !alreadyOpen;
      return {
        files: [...state.files, file],
        openFileTabs: shouldOpen
          ? [...state.openFileTabs, { id: file.id, type: 'file' as const }]
          : state.openFileTabs
      };
    });
  },

  removeFile: (id: string) => {
    set((state) => {
      const nextOpenTabs = state.openFileTabs.filter(
        (tab) => !(tab.id === id && tab.type === 'file')
      );

      const activeIsRemovedFile =
        state.activeFileTabId === id && state.fileTabType === 'file';

      let activeUpdate: Partial<DataState> = {};
      if (activeIsRemovedFile) {
        const nextFileTab = nextOpenTabs.find((tab) => tab.type === 'file');
        if (nextFileTab) {
          activeUpdate = {
            activeFileTabId: nextFileTab.id,
            fileTabType: 'file' as const
          };
        } else if (state.queryArtifacts.length > 0) {
          activeUpdate = {
            activeFileTabId: state.queryArtifacts[0].id,
            fileTabType: 'artifact' as const
          };
        } else {
          activeUpdate = { activeFileTabId: null, fileTabType: null };
        }
      }

      return {
        files: state.files.filter((f) => f.id !== id),
        previews: state.previews.filter((p) => p.fileId !== id),
        openFileTabs: nextOpenTabs,
        ...activeUpdate
      };
    });
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
    const fileIdsToRemove = new Set(filesToRemove.map((f) => f.id));

    const notebookIdsInProject = new Set(
      useNotebookStore
        .getState()
        .notebooks.filter((n) => n.projectId === projectId)
        .map((n) => n.notebookId)
    );
    const artifactIdsInProject = new Set(
      get()
        .queryArtifacts.filter((a) => a.projectId === projectId)
        .map((a) => a.id)
    );

    set((state) => {
      const nextOpenTabs = state.openFileTabs.filter((tab) => {
        if (tab.type === 'file') return !fileIdsToRemove.has(tab.id);
        if (tab.type === 'artifact') return !artifactIdsInProject.has(tab.id);
        if (tab.type === 'notebook') return !notebookIdsInProject.has(tab.id);
        return true;
      });

      let activeUpdate: Partial<DataState> = {};
      if (state.activeFileTabId) {
        const stillActive = nextOpenTabs.some(
          (tab) => tab.id === state.activeFileTabId && tab.type === state.fileTabType
        );
        if (!stillActive) {
          activeUpdate = { activeFileTabId: null, fileTabType: null };
        }
      }

      return {
        files: state.files.filter((f) => f.projectId !== projectId),
        previews: state.previews.filter((p) => !fileIdsToRemove.has(p.fileId)),
        openFileTabs: nextOpenTabs,
        ...activeUpdate
      };
    });
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

  setActiveFileTab: (id: string | null, type: TabType | 'plan' | null) => {
    const state = get();
    if (state.activeFileTabId === id && state.fileTabType === type) {
      return;
    }
    set({ activeFileTabId: id, fileTabType: type });
  },

  openFileTab: (id: string) => {
    set((state) => {
      const alreadyOpen = state.openFileTabs.some(
        (tab) => tab.id === id && tab.type === 'file'
      );
      const alreadyActive =
        state.activeFileTabId === id && state.fileTabType === 'file';
      if (alreadyOpen && alreadyActive) {
        return state;
      }
      return {
        openFileTabs: alreadyOpen
          ? state.openFileTabs
          : [...state.openFileTabs, { id, type: 'file' as const }],
        activeFileTabId: id,
        fileTabType: 'file' as const
      };
    });
  },

  openNotebookTab: (notebookId: string) => {
    set((state) => {
      const alreadyOpen = state.openFileTabs.some(
        (tab) => tab.id === notebookId && tab.type === 'notebook'
      );
      const alreadyActive =
        state.activeFileTabId === notebookId && state.fileTabType === 'notebook';
      if (alreadyOpen && alreadyActive) {
        return state;
      }
      return {
        openFileTabs: alreadyOpen
          ? state.openFileTabs
          : [...state.openFileTabs, { id: notebookId, type: 'notebook' as const }],
        activeFileTabId: notebookId,
        fileTabType: 'notebook' as const
      };
    });
  },

  closeFileTab: (id: string, type: TabType) => {
    set((state) => {
      const nextOpenTabs = state.openFileTabs.filter(
        (tab) => !(tab.id === id && tab.type === type)
      );
      const isClosingActive =
        state.activeFileTabId === id && state.fileTabType === type;

      if (!isClosingActive) {
        return { openFileTabs: nextOpenTabs };
      }

      // Fall-through: prefer next tab of any type preserving its type; then
      // any remaining query artifact; else null.
      if (nextOpenTabs.length > 0) {
        const nextTab = nextOpenTabs[0];
        return {
          openFileTabs: nextOpenTabs,
          activeFileTabId: nextTab.id,
          fileTabType: nextTab.type
        };
      }
      if (state.queryArtifacts.length > 0) {
        return {
          openFileTabs: nextOpenTabs,
          activeFileTabId: state.queryArtifacts[0].id,
          fileTabType: 'artifact' as const
        };
      }
      return {
        openFileTabs: nextOpenTabs,
        activeFileTabId: null,
        fileTabType: null
      };
    });
  }
});
