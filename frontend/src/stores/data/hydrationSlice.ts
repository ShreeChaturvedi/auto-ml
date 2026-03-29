/**
 * Hydration Slice — hydrateFromBackend logic for loading persisted datasets
 */

import type { StateCreator } from 'zustand';
import type { UploadedFile, DataPreview, EdaSummary } from '@/types/file';
import { listDatasets } from '@/lib/api/datasets';
import { listDocuments } from '@/lib/api/documents';
import { getFileType } from '@/lib/fileUtils';
import type { DataState } from '../dataStore';

export interface HydrationSlice {
  // State
  hydratedProjects: Set<string>;
  isHydrating: boolean;
  hydrationError: string | null;
  recentlyDeletedIds: Set<string>;

  // Actions
  hydrateFromBackend: (projectId: string, options?: { force?: boolean }) => Promise<void>;
  markDeleted: (datasetId: string) => void;
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

function buildFileIdentity(file: UploadedFile): string {
  return `${file.name}::${file.size}::${file.type}`;
}

export const createHydrationSlice: StateCreator<DataState, [], [], HydrationSlice> = (set, get) => ({
  hydratedProjects: new Set<string>(),
  isHydrating: false,
  hydrationError: null,
  recentlyDeletedIds: new Set<string>(),

  markDeleted(datasetId: string) {
    set((state) => {
      const next = new Set(state.recentlyDeletedIds);
      next.add(datasetId);
      return { recentlyDeletedIds: next };
    });
    // Auto-clear after 30 seconds — this is only a race-condition guard
    setTimeout(() => {
      set((state) => {
        const next = new Set(state.recentlyDeletedIds);
        next.delete(datasetId);
        return { recentlyDeletedIds: next };
      });
    }, 30_000);
  },

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

      // Filter out datasets that were recently deleted locally to prevent
      // race conditions where the backend hasn't processed the DELETE yet.
      const { recentlyDeletedIds } = get();

      for (const dataset of datasets) {
        if (recentlyDeletedIds.has(dataset.datasetId)) continue;
        const fileId = dataset.datasetId;

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
            derivedFrom: typeof dataset.metadata?.derivedFrom === 'string' ? dataset.metadata.derivedFrom : undefined,
            datasetProfile: {
              nRows: dataset.nRows,
              nCols: dataset.nCols,
              dtypes: Object.fromEntries(dataset.columns.map(c => [c.name, c.dtype])),
              nullCounts: Object.fromEntries(dataset.columns.map(c => [c.name, c.nullCount]))
            }
          }
        };

        const preview: DataPreview = {
          fileId,
          headers: dataset.columns.map(c => c.name),
          rows: dataset.sample,
          totalRows: dataset.nRows,
          previewRows: dataset.sample.length,
          eda: dataset.metadata?.eda as EdaSummary | undefined
        };

        hydratedFiles.push(file);
        hydratedPreviews.push(preview);
      }

      for (const document of documents) {
        if (recentlyDeletedIds.has(document.documentId)) continue;
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
        const hydratedProjectFiles = [...hydratedFiles, ...hydratedDocuments];
        const hydratedFileIdentity = new Set(hydratedProjectFiles.map((file) => buildFileIdentity(file)));

        // Preserve local in-flight files during hydration to avoid false upload failure states.
        const pendingLocalFiles = state.files.filter((file) => (
          file.projectId === projectId
          && !file.metadata?.datasetId
          && !file.metadata?.documentId
        ));
        const retainedPendingFiles = pendingLocalFiles.filter(
          (file) => !hydratedFileIdentity.has(buildFileIdentity(file))
        );
        const droppedPendingFileIds = new Set(
          pendingLocalFiles
            .filter((file) => hydratedFileIdentity.has(buildFileIdentity(file)))
            .map((file) => file.id)
        );

        const hydratedIds = new Set([...hydratedFiles, ...hydratedDocuments].map((file) => file.id));
        const retainedProjectIds = new Set([...hydratedIds, ...retainedPendingFiles.map((file) => file.id)]);
        const nextOpenFileTabs = state.openFileTabs.filter((tabId) => {
          if (!previousProjectFileIds.has(tabId)) return true;
          return retainedProjectIds.has(tabId);
        });
        const nextOpenSet = new Set(nextOpenFileTabs);
        hydratedFiles.forEach((file) => {
          if (!existingDatasetIds.has(file.id)) {
            nextOpenSet.add(file.id);
          }
        });

        // Auto-select the first data file tab when no tab is currently active.
        // Only act when activeFileTabId is null — if it points to another
        // project's file, the DataViewerTab effect handles project-scoped selection.
        const finalOpenTabs = Array.from(nextOpenSet);
        const activeTabUpdate: Partial<DataState> = {};
        if (state.activeFileTabId == null && finalOpenTabs.length > 0) {
          activeTabUpdate.activeFileTabId = finalOpenTabs[0];
          activeTabUpdate.fileTabType = 'file';
        }

        return {
          files: [
            ...state.files.filter((file) => file.projectId !== projectId),
            ...hydratedFiles,
            ...hydratedDocuments,
            ...retainedPendingFiles
          ],
          previews: [
            ...state.previews.filter(p =>
              !hydratedFiles.some(f => f.id === p.fileId)
              && !droppedPendingFileIds.has(p.fileId)
            ),
            ...hydratedPreviews
          ],
          hydratedProjects: newHydratedProjects,
          openFileTabs: finalOpenTabs,
          isHydrating: false,
          ...activeTabUpdate
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
});
