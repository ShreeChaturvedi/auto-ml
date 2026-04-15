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
  KNOWN_REASONING_EFFORTS,
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
        // Validate against the known reasoning effort enum. Any caller writing
        // a garbage value (stale type, test leakage, external mutation) falls
        // back to the safe default instead of poisoning the persisted store.
        const next = (KNOWN_REASONING_EFFORTS as readonly string[]).includes(effort)
          ? effort
          : DEFAULT_REASONING_EFFORT;
        if (state.reasoningEffort === next) return state;
        return { ...state, reasoningEffort: next };
      })
    }),
    {
      name: 'automl-llm-model-selection-v1',
      version: 1,
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        reasoningEffort: state.reasoningEffort
      }),
      // Normalize at hydration time so the store always contains canonical
      // values, even for users who persisted stale data from a past code
      // version. This covers:
      //   - Legacy model aliases (gpt-5-mini → gpt-5.4-mini)
      //   - Unknown reasoning efforts (e.g. 'minimal' leaked from a past
      //     build or a stray external mutation) — coerced to the default
      onRehydrateStorage: () => (rehydrated) => {
        if (!rehydrated) return;
        const canonicalModel = normalizeAssistantModelValue(rehydrated.selectedModel);
        if (canonicalModel !== rehydrated.selectedModel) {
          rehydrated.selectedModel = canonicalModel;
        }
        if (!(KNOWN_REASONING_EFFORTS as readonly string[]).includes(rehydrated.reasoningEffort)) {
          rehydrated.reasoningEffort = DEFAULT_REASONING_EFFORT;
        }
      }
    }
  )
);
