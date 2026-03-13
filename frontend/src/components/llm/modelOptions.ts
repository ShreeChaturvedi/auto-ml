export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export type ReasoningIcon = 'zap' | 'gauge' | 'brain' | 'flame' | 'rocket';

export type AssistantModelKind = 'base' | 'codex' | 'mini' | 'nano';

export const DEFAULT_ASSISTANT_MODEL = 'gpt-5.4';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'high';

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

const DEFAULT_MODEL_OPTION: AssistantModelOption = {
  value: DEFAULT_ASSISTANT_MODEL,
  label: 'GPT 5.4',
  kind: 'base',
  description: 'Strongest model for complex planning, tool orchestration, and high-stakes work.',
  supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  defaultReasoningEffort: DEFAULT_REASONING_EFFORT,
  featured: true
};

const REASONING_EFFORT_META: Record<ReasoningEffort, { label: string; icon: ReasoningIcon }> = {
  minimal: { label: 'Minimal', icon: 'zap' },
  low: { label: 'Low', icon: 'gauge' },
  medium: { label: 'Medium', icon: 'brain' },
  high: { label: 'High', icon: 'flame' },
  xhigh: { label: 'Extra High', icon: 'rocket' }
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
  return modelOptions.find((option) => option.value === modelValue)
    ?? modelOptions.find((option) => option.value === DEFAULT_ASSISTANT_MODEL)
    ?? modelOptions[0]
    ?? DEFAULT_MODEL_OPTION;
}

export function buildInlineModelOptions(
  featuredModelOptions: readonly AssistantModelOption[]
): AssistantModelOption[] {
  return [...featuredModelOptions];
}
