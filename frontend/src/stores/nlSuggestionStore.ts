import { create } from 'zustand';

import { fetchNlSuggestions, type NlSuggestion, type WorkflowPlaceholders } from '@/lib/api/query';

export interface ProjectNlSuggestionEntry {
  suggestions: NlSuggestion[];
  schemaFingerprint: string;
  workflowPlaceholders?: WorkflowPlaceholders;
}

interface NlSuggestionState {
  byProject: Record<string, ProjectNlSuggestionEntry>;
  fetchProjectSuggestions: (projectId: string, options?: { force?: boolean }) => Promise<ProjectNlSuggestionEntry | null>;
  reset: () => void;
}

const inflightRequests = new Map<string, Promise<ProjectNlSuggestionEntry | null>>();

function emptyEntry(): ProjectNlSuggestionEntry {
  return {
    suggestions: [],
    schemaFingerprint: ''
  };
}

function hasSameSuggestions(left: NlSuggestion[], right: NlSuggestion[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((suggestion, index) => {
    const other = right[index];
    return Boolean(other)
      && suggestion.id === other.id
      && suggestion.prompt === other.prompt
      && suggestion.label === other.label
      && suggestion.category === other.category
      && suggestion.rationale === other.rationale
      && suggestion.tables.length === other.tables.length
      && suggestion.tables.every((table, tableIndex) => table === other.tables[tableIndex]);
  });
}

function hasSameEntry(left: ProjectNlSuggestionEntry | undefined, right: ProjectNlSuggestionEntry) {
  if (!left) {
    return false;
  }

  return left.schemaFingerprint === right.schemaFingerprint
    && hasSameSuggestions(left.suggestions, right.suggestions);
}

export const useNlSuggestionStore = create<NlSuggestionState>()((set, get) => ({
  byProject: {},

  async fetchProjectSuggestions(projectId, options) {
    if (!projectId) {
      return null;
    }

    const existing = get().byProject[projectId];
    if (existing && !options?.force) {
      return existing;
    }

    // Always respect an inflight request — avoids duplicate concurrent fetches
    const running = inflightRequests.get(projectId);
    if (running) {
      return running;
    }

    const request = fetchNlSuggestions(projectId, 8)
      .then((response) => {
        const nextEntry: ProjectNlSuggestionEntry = {
          suggestions: response.suggestions,
          schemaFingerprint: response.schemaFingerprint,
          workflowPlaceholders: response.workflowPlaceholders
        };
        set((state) => ({
          byProject: hasSameEntry(state.byProject[projectId], nextEntry)
            ? state.byProject
            : {
                ...state.byProject,
                [projectId]: nextEntry
              }
        }));
        return nextEntry;
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to load NL suggestions.';
        console.error('[nlSuggestionStore] Failed to load NL suggestions:', message);
        return get().byProject[projectId] ?? emptyEntry();
      })
      .finally(() => {
        inflightRequests.delete(projectId);
      });

    inflightRequests.set(projectId, request);
    return request;
  },

  reset() {
    inflightRequests.clear();
    set({ byProject: {} });
  }
}));
