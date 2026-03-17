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

  // Actions
  hydrateFromBackend: (projectId: string, options?: { force?: boolean }) => Promise<void>;
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
});
