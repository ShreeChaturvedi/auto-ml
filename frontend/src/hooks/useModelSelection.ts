import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  buildInlineModelOptions,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  normalizeAssistantModelValue,
  type ReasoningEffort
} from '@/components/llm/modelOptions';
import { useLlmModelCatalog } from '@/hooks/useLlmModelCatalog';
import { useLlmModelStore } from '@/stores/llmModelStore';

export interface UseModelSelectionReturn {
  /** The currently selected model ID. */
  selectedModel: string;
  /** The current reasoning effort level. */
  reasoningEffort: ReasoningEffort;
  /** Featured model options formatted for the inline picker. */
  inlineModelOptions: ReturnType<typeof buildInlineModelOptions>;
  /** Reasoning effort options for the currently selected model. */
  reasoningEffortOptions: ReturnType<typeof getReasoningEffortOptions>;
  /**
   * Dismissed model switch error string. When non-null, the model switch
   * prompt for the given error message has been dismissed by the user.
   * Only relevant when a model switch error is present. Intentionally
   * ephemeral — resets on component unmount.
   */
  dismissedModelPromptFor: string | null;
  /** Set dismissedModelPromptFor manually (e.g. to reset on new errors). */
  setDismissedModelPromptFor: (value: string | null) => void;
  /**
   * Change the selected model. Preserves the current reasoning effort if the
   * new model supports it; otherwise falls back to the new model's default.
   */
  handleModelChange: (model: string) => void;
  /** Direct setter for reasoningEffort (e.g. from the effort picker). */
  setReasoningEffort: (effort: ReasoningEffort) => void;
}

/**
 * Encapsulates model selection state shared by PlanningStage and AgenticShell.
 *
 * Backed by the persisted `useLlmModelStore` so the selection survives
 * AgenticShell remounts (caused by FE draft switches, tab navigation, page
 * reloads, etc). Previously this state lived in `useState` and silently reset
 * to the default on every remount.
 *
 * Responsibilities:
 * - Reads selectedModel + reasoningEffort from the persisted store.
 * - After catalog hydration, validates the selection against the catalog and
 *   falls back to defaults if the persisted model was removed.
 * - `dismissedModelPromptFor` stays as local state (ephemeral UI dismissal).
 */
export function useModelSelection(): UseModelSelectionReturn {
  const selectedModel = useLlmModelStore((state) => state.selectedModel);
  const reasoningEffort = useLlmModelStore((state) => state.reasoningEffort);
  const setSelectedModelInStore = useLlmModelStore((state) => state.setSelectedModel);
  const setReasoningEffortInStore = useLlmModelStore((state) => state.setReasoningEffort);

  const [dismissedModelPromptFor, setDismissedModelPromptFor] = useState<string | null>(null);

  const {
    featuredModelOptions,
    allModelOptions,
    defaultModel
  } = useLlmModelCatalog();

  // After the catalog loads, validate the selected model and reasoning effort.
  // If the persisted model is not in the catalog, fall back to the default.
  // If the reasoning effort is unsupported by the (possibly new) model, reset
  // it to that model's default.
  //
  // CRITICAL: do NOT touch reasoning effort while the catalog is still loading
  // — we'd overwrite the user's persisted preference with a pre-catalog guess
  // on every page load.
  useEffect(() => {
    if (!allModelOptions.length) {
      return;
    }

    const normalizedSelectedModel = normalizeAssistantModelValue(selectedModel);
    const nextModel = allModelOptions.some((option) => option.value === normalizedSelectedModel)
      ? normalizedSelectedModel
      : defaultModel;

    if (nextModel !== selectedModel) {
      setSelectedModelInStore(nextModel);
      // Let the next render pick up reasoning effort validation with the
      // updated model value.
      return;
    }

    const supportsCurrent = getReasoningEffortOptions(nextModel, allModelOptions)
      .some((option) => option.value === reasoningEffort);
    if (!supportsCurrent) {
      setReasoningEffortInStore(getDefaultReasoningEffort(nextModel, allModelOptions));
    }
  }, [allModelOptions, defaultModel, reasoningEffort, selectedModel, setReasoningEffortInStore, setSelectedModelInStore]);

  const handleModelChange = useCallback(
    (model: string) => {
      const normalizedModel = normalizeAssistantModelValue(model);
      setSelectedModelInStore(normalizedModel);
      // Preserve the user's reasoning effort across model switches when the
      // new model supports it — only fall back to the new model's default
      // when the current effort is unsupported.
      const supported = getReasoningEffortOptions(normalizedModel, allModelOptions)
        .some((option) => option.value === reasoningEffort);
      if (!supported) {
        setReasoningEffortInStore(getDefaultReasoningEffort(normalizedModel, allModelOptions));
      }
    },
    [allModelOptions, reasoningEffort, setReasoningEffortInStore, setSelectedModelInStore]
  );

  const inlineModelOptions = useMemo(
    () => buildInlineModelOptions(featuredModelOptions),
    [featuredModelOptions]
  );

  const reasoningEffortOptions = useMemo(
    () => getReasoningEffortOptions(selectedModel, allModelOptions),
    [allModelOptions, selectedModel]
  );

  return {
    selectedModel,
    reasoningEffort,
    inlineModelOptions,
    reasoningEffortOptions,
    dismissedModelPromptFor,
    setDismissedModelPromptFor,
    handleModelChange,
    setReasoningEffort: setReasoningEffortInStore
  };
}
