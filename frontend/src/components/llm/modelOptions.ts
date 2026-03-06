export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export type ReasoningIcon = 'slash' | 'zap' | 'gauge' | 'brain' | 'flame' | 'rocket';

export type AssistantModelKind = 'base' | 'chat' | 'codex' | 'mini' | 'nano' | 'pro' | 'search';

export const DEFAULT_ASSISTANT_MODEL = 'gpt-5.4';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'high';
export const OTHER_ASSISTANT_MODEL_VALUE = '__other__';

export interface AssistantModelOption {
  value: string;
  label: string;
  kind: AssistantModelKind;
  description: string;
  supportedReasoningEfforts: readonly ReasoningEffort[];
  defaultReasoningEffort: ReasoningEffort;
  featured?: boolean;
}

export interface ReasoningEffortOption {
  value: ReasoningEffort;
  label: string;
  icon: ReasoningIcon;
}

export const OTHER_MODEL_OPTION: AssistantModelOption = {
  value: OTHER_ASSISTANT_MODEL_VALUE,
  label: 'Other…',
  kind: 'search',
  description: 'Browse the full GPT-5 catalog.',
  supportedReasoningEfforts: [],
  defaultReasoningEffort: DEFAULT_REASONING_EFFORT,
  featured: true
};

const REASONING_EFFORT_META: Record<ReasoningEffort, { label: string; icon: ReasoningIcon }> = {
  none: { label: 'None', icon: 'slash' },
  minimal: { label: 'Minimal', icon: 'zap' },
  low: { label: 'Low', icon: 'gauge' },
  medium: { label: 'Medium', icon: 'brain' },
  high: { label: 'High', icon: 'flame' },
  xhigh: { label: 'X-High', icon: 'rocket' }
};

export function getReasoningEffortOptions(
  modelValue: string,
  modelOptions: readonly AssistantModelOption[]
): ReasoningEffortOption[] {
  const modelOption = getModelOption(modelValue, modelOptions);

  return modelOption.supportedReasoningEfforts.map((effort) => ({
    value: effort,
    label: REASONING_EFFORT_META[effort].label,
    icon: REASONING_EFFORT_META[effort].icon
  }));
}

export function getDefaultReasoningEffort(
  modelValue: string,
  modelOptions: readonly AssistantModelOption[]
): ReasoningEffort {
  const modelOption = getModelOption(modelValue, modelOptions);
  return modelOption.defaultReasoningEffort;
}

export function getModelOption(
  modelValue: string,
  modelOptions: readonly AssistantModelOption[]
): AssistantModelOption {
  return modelOptions.find((option) => option.value === modelValue) ?? modelOptions[0] ?? OTHER_MODEL_OPTION;
}

export function buildInlineModelOptions(
  featuredModelOptions: readonly AssistantModelOption[],
  allModelOptions: readonly AssistantModelOption[],
  selectedModel: string
): AssistantModelOption[] {
  const inlineOptions = [...featuredModelOptions];
  const isSelectedFeatured = featuredModelOptions.some((option) => option.value === selectedModel);

  if (!isSelectedFeatured) {
    const selectedOption = allModelOptions.find((option) => option.value === selectedModel);
    if (selectedOption) {
      inlineOptions.unshift(selectedOption);
    }
  }

  if (!inlineOptions.some((option) => option.value === OTHER_ASSISTANT_MODEL_VALUE)) {
    inlineOptions.push(OTHER_MODEL_OPTION);
  }

  return inlineOptions;
}
