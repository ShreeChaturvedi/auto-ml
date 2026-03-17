/**
 * Data Store - Zustand state management for uploaded files and datasets
 *
 * Composed from focused slices:
 * - fileSlice:      File CRUD, metadata, previews, tab management
 * - artifactSlice:  Query artifact CRUD
 * - hydrationSlice: Backend hydration for persisted datasets
 *
 * All existing imports of `useDataStore` continue to work unchanged.
 */

import { create } from 'zustand';
import { createFileSlice, type FileSlice } from './data/fileSlice';
import { createArtifactSlice, type ArtifactSlice } from './data/artifactSlice';
import { createHydrationSlice, type HydrationSlice } from './data/hydrationSlice';

export type DataState = FileSlice & ArtifactSlice & HydrationSlice;

export const useDataStore = create<DataState>()((...args) => ({
  ...createFileSlice(...args),
  ...createArtifactSlice(...args),
  ...createHydrationSlice(...args)
}));
