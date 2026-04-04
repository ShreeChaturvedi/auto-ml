import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_ASSISTANT_MODEL,
  DEFAULT_REASONING_EFFORT,
  type ReasoningEffort
} from '@/components/llm/modelOptions';
import { useLlmModelStore } from '@/stores/llmModelStore';

const STORAGE_KEY = 'automl-llm-model-selection-v1';

// Reset the store + localStorage between tests so cases don't bleed into
// each other via the persisted Zustand state.
function resetStore(): void {
  useLlmModelStore.setState({
    selectedModel: DEFAULT_ASSISTANT_MODEL,
    reasoningEffort: DEFAULT_REASONING_EFFORT
  });
  localStorage.removeItem(STORAGE_KEY);
}

function seedLocalStorage(state: {
  selectedModel: string;
  reasoningEffort: string;
}): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      state,
      version: 1
    })
  );
}

describe('llmModelStore', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  describe('default state', () => {
    it('initializes with the default model and reasoning effort', () => {
      const state = useLlmModelStore.getState();
      expect(state.selectedModel).toBe(DEFAULT_ASSISTANT_MODEL);
      expect(state.reasoningEffort).toBe(DEFAULT_REASONING_EFFORT);
    });
  });

  describe('setSelectedModel', () => {
    it('writes a canonical model id', () => {
      useLlmModelStore.getState().setSelectedModel('gpt-5.4-mini');
      expect(useLlmModelStore.getState().selectedModel).toBe('gpt-5.4-mini');
    });

    it('normalizes legacy aliases at write time', () => {
      useLlmModelStore.getState().setSelectedModel('gpt-5-mini');
      expect(useLlmModelStore.getState().selectedModel).toBe('gpt-5.4-mini');
    });

    it('short-circuits identical writes to avoid redundant rerenders', () => {
      let renderCount = 0;
      const unsubscribe = useLlmModelStore.subscribe(() => {
        renderCount += 1;
      });

      useLlmModelStore.getState().setSelectedModel('gpt-5.4-mini');
      expect(renderCount).toBe(1);
      useLlmModelStore.getState().setSelectedModel('gpt-5.4-mini');
      expect(renderCount).toBe(1); // no second notification

      unsubscribe();
    });
  });

  describe('setReasoningEffort', () => {
    it('writes a valid reasoning effort', () => {
      useLlmModelStore.getState().setReasoningEffort('medium');
      expect(useLlmModelStore.getState().reasoningEffort).toBe('medium');
    });

    it('falls back to the default when given an unknown effort', () => {
      // Intentionally cast a bogus value to ReasoningEffort — this simulates
      // a stray external mutation (test leakage, stale type, etc.)
      useLlmModelStore.getState().setReasoningEffort('minimal' as unknown as ReasoningEffort);
      expect(useLlmModelStore.getState().reasoningEffort).toBe(DEFAULT_REASONING_EFFORT);
    });

    it('short-circuits identical writes to avoid redundant rerenders', () => {
      useLlmModelStore.getState().setReasoningEffort('medium');
      let renderCount = 0;
      const unsubscribe = useLlmModelStore.subscribe(() => {
        renderCount += 1;
      });

      useLlmModelStore.getState().setReasoningEffort('medium');
      expect(renderCount).toBe(0);

      unsubscribe();
    });
  });

  describe('persistence round-trip', () => {
    it('persists selectedModel and reasoningEffort to localStorage', () => {
      useLlmModelStore.getState().setSelectedModel('gpt-5.4-nano');
      useLlmModelStore.getState().setReasoningEffort('low');

      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw ?? '{}') as { state: { selectedModel: string; reasoningEffort: string } };
      expect(parsed.state.selectedModel).toBe('gpt-5.4-nano');
      expect(parsed.state.reasoningEffort).toBe('low');
    });

    it('rehydrates a legacy model alias into its canonical form', async () => {
      seedLocalStorage({ selectedModel: 'gpt-5-mini', reasoningEffort: 'medium' });

      // Force the store to re-hydrate from the seeded localStorage.
      await useLlmModelStore.persist.rehydrate();

      expect(useLlmModelStore.getState().selectedModel).toBe('gpt-5.4-mini');
      expect(useLlmModelStore.getState().reasoningEffort).toBe('medium');
    });

    it('rehydrates an unknown reasoning effort to the default', async () => {
      // Simulates a past code version that wrote 'minimal' to the store.
      seedLocalStorage({ selectedModel: 'gpt-5.4-mini', reasoningEffort: 'minimal' });

      await useLlmModelStore.persist.rehydrate();

      expect(useLlmModelStore.getState().selectedModel).toBe('gpt-5.4-mini');
      expect(useLlmModelStore.getState().reasoningEffort).toBe(DEFAULT_REASONING_EFFORT);
    });

    it('preserves valid state through rehydration', async () => {
      seedLocalStorage({ selectedModel: 'gpt-5.4', reasoningEffort: 'high' });

      await useLlmModelStore.persist.rehydrate();

      expect(useLlmModelStore.getState().selectedModel).toBe('gpt-5.4');
      expect(useLlmModelStore.getState().reasoningEffort).toBe('high');
    });
  });
});
