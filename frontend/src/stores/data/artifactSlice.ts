/**
 * Artifact Slice — query artifact CRUD and management
 */

import type { StateCreator } from 'zustand';
import type {
  QueryArtifact,
  QueryMode,
  DataPreview
} from '@/types/file';
import type { DataState } from '../dataStore';

export interface ArtifactSlice {
  // State
  queryArtifacts: QueryArtifact[];
  activeArtifactId: string | null;
  queryCounter: number;

  // Actions
  createArtifact: (
    query: string,
    mode: QueryMode,
    result: DataPreview,
    projectId: string,
    metadata?: Partial<
      Pick<
        QueryArtifact,
        'eda' | 'cached' | 'executionMs' | 'generatedSql' | 'rationale' | 'explanation' | 'name' | 'cacheTimestamp'
      >
    >
  ) => string;
  updateArtifact: (id: string, updates: Partial<QueryArtifact>) => void;
  removeArtifact: (id: string) => void;
  setActiveArtifact: (id: string | null) => void;
  getArtifactsByProject: (projectId: string) => QueryArtifact[];
  clearProjectArtifacts: (projectId: string) => void;
}

const MAX_ARTIFACTS_PER_PROJECT = 30;

export const createArtifactSlice: StateCreator<DataState, [], [], ArtifactSlice> = (set, get) => ({
  queryArtifacts: [],
  activeArtifactId: null,
  queryCounter: 0,

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
      rationale: metadata?.rationale,
      explanation: metadata?.explanation
    };

    set((state) => {
      const allArtifacts = [...state.queryArtifacts, artifact];
      const projectArtifacts = allArtifacts.filter((a) => a.projectId === projectId);
      const evictIds = projectArtifacts.length > MAX_ARTIFACTS_PER_PROJECT
        ? new Set(
            projectArtifacts
              .filter((a) => !a.isSaved)
              .slice(0, projectArtifacts.length - MAX_ARTIFACTS_PER_PROJECT)
              .map((a) => a.id)
          )
        : null;
      return {
        queryArtifacts: evictIds ? allArtifacts.filter((a) => !evictIds.has(a.id)) : allArtifacts,
        activeArtifactId: id,
        queryCounter: counter
      };
    });

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
  }
});
