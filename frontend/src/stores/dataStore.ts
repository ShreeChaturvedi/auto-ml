/**
 * Data Store - Zustand state management for uploaded files and datasets
 *
 * Composed from focused slices:
 * - fileSlice:      File CRUD, metadata, previews, tab management
 * - artifactSlice:  Query artifact CRUD
 * - hydrationSlice: Backend hydration for persisted datasets
 *
 * All existing imports of `useDataStore` continue to work unchanged.
 *
 * The open tab set (openFileTabs + activeFileTabId + fileTabType) is
 * persisted to localStorage so the explorer restores the user's previous
 * view across reloads. Dangling tab IDs (for files / artifacts / notebooks
 * that no longer exist) are filtered out at render time by FileTabBar and
 * DataViewerContent — no synchronous cleanup is needed on rehydration.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createFileSlice, type FileSlice } from './data/fileSlice';
import { createArtifactSlice, type ArtifactSlice } from './data/artifactSlice';
import { createHydrationSlice, type HydrationSlice } from './data/hydrationSlice';

export type DataState = FileSlice & ArtifactSlice & HydrationSlice;

export const useDataStore = create<DataState>()(
  persist(
    (...args) => ({
      ...createFileSlice(...args),
      ...createArtifactSlice(...args),
      ...createHydrationSlice(...args)
    }),
    {
      name: 'automl-data-viewer-tabs-v1',
      version: 1,
      partialize: (state) => ({
        openFileTabs: state.openFileTabs,
        activeFileTabId: state.activeFileTabId,
        fileTabType: state.fileTabType
      }) as Partial<DataState>,
      migrate: (persistedState) => {
        // v1 is the initial version. Future migrations can drop old tab
        // shapes (e.g. the legacy `string[]` openFileTabs) here.
        return persistedState as Partial<DataState>;
      },
      onRehydrateStorage: () => {
        // Dangling tab IDs (stale files, artifacts, or notebooks) are
        // filtered out at render time by FileTabBar and DataViewerContent.
        // No synchronous cleanup needed here — the store rehydrates fast
        // and the renderers skip unknown references.
        return undefined;
      }
    }
  )
);
