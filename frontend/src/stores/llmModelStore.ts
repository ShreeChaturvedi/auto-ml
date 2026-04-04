/**
 * Persisted store for the LLM assistant's model + reasoning effort selection.
 *
 * This is a GLOBAL selection shared across every agentic surface (FE chat,
 * preprocessing chat, training chat, onboarding planning). When the user picks
 * a model once, it applies everywhere and survives:
 *   - AgenticShell remounts (e.g. switching FE drafts, which re-keys the shell)
 *   - Tab navigation between phases
 *   - Page refreshes
 *
 * Previously this state lived in `useState` inside `useModelSelection`, which
 * silently reset to the default whenever the consuming component unmounted.
 * That caused users to hit rate limits on models they thought they'd switched
 * away from.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  DEFAULT_ASSISTANT_MODEL,
  DEFAULT_REASONING_EFFORT,
  normalizeAssistantModelValue,
  type ReasoningEffort
} from '@/components/llm/modelOptions';

interface LlmModelStore {
  selectedModel: string;
  reasoningEffort: ReasoningEffort;
  setSelectedModel: (model: string) => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
}

export const useLlmModelStore = create<LlmModelStore>()(
  persist(
    (set) => ({
      selectedModel: DEFAULT_ASSISTANT_MODEL,
      reasoningEffort: DEFAULT_REASONING_EFFORT,
      setSelectedModel: (model) => set((state) => {
        const next = normalizeAssistantModelValue(model);
        // Short-circuit: avoid spurious re-renders on identical writes.
        if (state.selectedModel === next) return state;
        return { ...state, selectedModel: next };
      }),
      setReasoningEffort: (effort) => set((state) => {
        if (state.reasoningEffort === effort) return state;
        return { ...state, reasoningEffort: effort };
      })
    }),
    {
      name: 'automl-llm-model-selection-v1',
      version: 1,
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        reasoningEffort: state.reasoningEffort
      }),
      // Normalize legacy aliases once at hydration time so the store always
      // contains canonical IDs, even for users who persisted old values.
      onRehydrateStorage: () => (rehydrated) => {
        if (!rehydrated) return;
        const canonical = normalizeAssistantModelValue(rehydrated.selectedModel);
        if (canonical !== rehydrated.selectedModel) {
          rehydrated.selectedModel = canonical;
        }
      }
    }
  )
);
