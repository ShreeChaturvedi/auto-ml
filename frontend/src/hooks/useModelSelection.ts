import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  buildInlineModelOptions,
  DEFAULT_ASSISTANT_MODEL,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  normalizeAssistantModelValue,
  type ReasoningEffort
} from '@/components/llm/modelOptions';
import { useLlmModelCatalog } from '@/hooks/useLlmModelCatalog';

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
   * Only relevant when a model switch error is present.
   */
  dismissedModelPromptFor: string | null;
  /** Set dismissedModelPromptFor manually (e.g. to reset on new errors). */
  setDismissedModelPromptFor: (value: string | null) => void;
  /**
   * Change the selected model. Automatically resets reasoningEffort to the
   * new model's default.
   */
  handleModelChange: (model: string) => void;
  /** Direct setter for reasoningEffort (e.g. from the effort picker). */
  setReasoningEffort: (effort: ReasoningEffort) => void;
}

/**
 * Encapsulates model selection state shared by PlanningStage and AgenticShell.
 *
 * Handles:
 * - selectedModel + reasoningEffort state
 * - Catalog hydration: waits for useLlmModelCatalog to resolve then validates
 *   the selected model and reasoning effort against the available options.
 * - Fallback: if the current model is not in the catalog, falls back to
 *   defaultModel. If reasoning effort is unsupported, resets to model default.
 * - dismissedModelPromptFor: tracks which model-switch error the user has
 *   dismissed (used by AgenticShell's model availability prompt).
 */
export function useModelSelection(): UseModelSelectionReturn {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_ASSISTANT_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high');
  const [dismissedModelPromptFor, setDismissedModelPromptFor] = useState<string | null>(null);

  const {
    featuredModelOptions,
    allModelOptions,
    defaultModel,
    defaultReasoningEffort
  } = useLlmModelCatalog();

  // When the catalog default model arrives and no model has been explicitly
  // chosen yet, adopt the catalog default.
  useEffect(() => {
    if (!selectedModel && defaultModel) {
      setSelectedModel(defaultModel);
    }
  }, [defaultModel, selectedModel]);

  // After the catalog loads, validate the selected model and reasoning effort.
  // If the current model is not in the catalog, fall back to the default.
  // If the reasoning effort is unsupported by the (possibly new) model, reset
  // it to that model's default effort.
  useEffect(() => {
    if (!allModelOptions.length) {
      // Catalog not yet loaded — apply the pre-catalog default effort.
      setReasoningEffort(defaultReasoningEffort);
      return;
    }

    const normalizedSelectedModel = normalizeAssistantModelValue(selectedModel);
    const nextModel = allModelOptions.some((option) => option.value === normalizedSelectedModel)
      ? normalizedSelectedModel
      : defaultModel;

    if (nextModel !== selectedModel) {
      setSelectedModel(nextModel);
      // Don't also validate reasoning in this tick; let the next render pick
      // it up with the updated model value.
      return;
    }

    const supportsCurrent = getReasoningEffortOptions(nextModel, allModelOptions)
      .some((option) => option.value === reasoningEffort);
    if (!supportsCurrent) {
      setReasoningEffort(getDefaultReasoningEffort(nextModel, allModelOptions));
    }
  }, [allModelOptions, defaultModel, defaultReasoningEffort, reasoningEffort, selectedModel]);

  const handleModelChange = useCallback(
    (model: string) => {
      const normalizedModel = normalizeAssistantModelValue(model);
      setSelectedModel(normalizedModel);
      setReasoningEffort(getDefaultReasoningEffort(normalizedModel, allModelOptions));
    },
    [allModelOptions]
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
    setReasoningEffort
  };
}
