/**
 * Preprocessing Store
 * 
 * Manages state for preprocessing analysis and user selections.
 */

import { create } from 'zustand';
import type { 
  PreprocessingAnalysis, 
  PreprocessingSuggestion,
  AvailableTable 
} from '@/types/preprocessing';
import { analyzeForPreprocessing, listAvailableTables } from '@/lib/api/preprocessing';

interface PreprocessingState {
  // Data
  analysis: PreprocessingAnalysis | null;
  tables: AvailableTable[];
  selectedDatasetId: string | null;
  
  // User selections (which suggestions are enabled and their parameters)
  suggestionStates: Record<string, {
    enabled: boolean;
    method: string;
    parameters: Record<string, unknown>;
  }>;
  
  // Loading states
  isLoadingTables: boolean;
  isAnalyzing: boolean;
  error: string | null;
  
  // Metadata
  metadata: {
    tableName: string;
    totalRows: number;
    sampledRows: number;
    samplePercentage: number;
  } | null;

  // Actions
  loadTables: (projectId: string) => Promise<void>;
  selectDataset: (datasetId: string) => void;
  analyze: (projectId: string, datasetId: string) => Promise<void>;
  
  // Suggestion management
  toggleSuggestion: (suggestionId: string) => void;
  updateSuggestionMethod: (suggestionId: string, method: string) => void;
  updateSuggestionParameter: (suggestionId: string, key: string, value: unknown) => void;
  enableAllSuggestions: () => void;
  disableAllSuggestions: () => void;
  resetToDefaults: () => void;
  
  // Computed
  getEnabledSuggestions: () => PreprocessingSuggestion[];
  getSuggestionState: (suggestionId: string) => { enabled: boolean; method: string; parameters: Record<string, unknown> } | undefined;
  
  // Cleanup
  reset: () => void;
}

const initialState = {
  analysis: null,
  tables: [],
  selectedDatasetId: null,
  suggestionStates: {},
  isLoadingTables: false,
  isAnalyzing: false,
  error: null,
  metadata: null
};

export const usePreprocessingStore = create<PreprocessingState>((set, get) => ({
  ...initialState,

  loadTables: async (projectId: string) => {
    set({ isLoadingTables: true, error: null });
    try {
      const { tables } = await listAvailableTables(projectId);
      set({ tables, isLoadingTables: false });
    } catch (error) {
      console.error('[preprocessingStore] Failed to load tables:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load tables',
        isLoadingTables: false 
      });
    }
  },

  selectDataset: (datasetId: string) => {
    set({ selectedDatasetId: datasetId });
  },

  analyze: async (projectId: string, datasetId: string) => {
    set({ isAnalyzing: true, error: null });
    try {
      const response = await analyzeForPreprocessing({ projectId, datasetId });
      
      // Initialize suggestion states from analysis
      const suggestionStates: PreprocessingState['suggestionStates'] = {};
      for (const suggestion of response.analysis.suggestions) {
        suggestionStates[suggestion.id] = {
          enabled: suggestion.enabled,
          method: suggestion.method,
          parameters: { ...suggestion.parameters }
        };
      }
      
      set({ 
        analysis: response.analysis,
        metadata: response.metadata,
        suggestionStates,
        selectedDatasetId: datasetId,
        isAnalyzing: false 
      });
    } catch (error) {
      console.error('[preprocessingStore] Analysis failed:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Analysis failed',
        isAnalyzing: false 
      });
    }
  },

  toggleSuggestion: (suggestionId: string) => {
    set((state) => {
      const current = state.suggestionStates[suggestionId];
      if (!current) return state;
      
      return {
        suggestionStates: {
          ...state.suggestionStates,
          [suggestionId]: {
            ...current,
            enabled: !current.enabled
          }
        }
      };
    });
  },

  updateSuggestionMethod: (suggestionId: string, method: string) => {
    set((state) => {
      const current = state.suggestionStates[suggestionId];
      if (!current) return state;
      
      return {
        suggestionStates: {
          ...state.suggestionStates,
          [suggestionId]: {
            ...current,
            method
          }
        }
      };
    });
  },

  updateSuggestionParameter: (suggestionId: string, key: string, value: unknown) => {
    set((state) => {
      const current = state.suggestionStates[suggestionId];
      if (!current) return state;
      
      return {
        suggestionStates: {
          ...state.suggestionStates,
          [suggestionId]: {
            ...current,
            parameters: {
              ...current.parameters,
              [key]: value
            }
          }
        }
      };
    });
  },

  enableAllSuggestions: () => {
    set((state) => {
      const newStates = { ...state.suggestionStates };
      for (const id of Object.keys(newStates)) {
        newStates[id] = { ...newStates[id], enabled: true };
      }
      return { suggestionStates: newStates };
    });
  },

  disableAllSuggestions: () => {
    set((state) => {
      const newStates = { ...state.suggestionStates };
      for (const id of Object.keys(newStates)) {
        newStates[id] = { ...newStates[id], enabled: false };
      }
      return { suggestionStates: newStates };
    });
  },

  resetToDefaults: () => {
    const { analysis } = get();
    if (!analysis) return;
    
    const suggestionStates: PreprocessingState['suggestionStates'] = {};
    for (const suggestion of analysis.suggestions) {
      suggestionStates[suggestion.id] = {
        enabled: suggestion.enabled,
        method: suggestion.method,
        parameters: { ...suggestion.parameters }
      };
    }
    set({ suggestionStates });
  },

  getEnabledSuggestions: () => {
    const { analysis, suggestionStates } = get();
    if (!analysis) return [];
    
    return analysis.suggestions.filter(s => suggestionStates[s.id]?.enabled);
  },

  getSuggestionState: (suggestionId: string) => {
    return get().suggestionStates[suggestionId];
  },

  reset: () => {
    set(initialState);
  }
}));



