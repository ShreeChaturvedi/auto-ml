export type ReasoningEffort = 'dynamic' | 'low' | 'medium' | 'high';

export type ReasoningIcon = 'zap' | 'gauge' | 'brain' | 'flame';

export interface AssistantModelOption {
  value: string;
  label: string;
  icon: 'auto' | 'gemini';
  supportedReasoningEfforts: readonly ReasoningEffort[];
  defaultReasoningEffort: ReasoningEffort;
  /** Whether this model supports the thinking toggle / reasoning selector */
  supportsThinking: boolean;
  /** If true, thinking is always on and cannot be toggled off */
  thinkingAlwaysOn: boolean;
}

const GEMINI_3_1_REASONING_EFFORTS: readonly ReasoningEffort[] = [
  'dynamic',
  'low',
  'medium',
  'high'
];

export const ASSISTANT_MODEL_OPTIONS: readonly AssistantModelOption[] = [
  {
    value: 'auto',
    label: 'Auto',
    icon: 'auto',
    supportedReasoningEfforts: GEMINI_3_1_REASONING_EFFORTS,
    defaultReasoningEffort: 'dynamic',
    supportsThinking: false,
    thinkingAlwaysOn: false
  },
  {
    value: 'gemini-3.1-pro-preview-customtools',
    label: 'Gemini 3.1 Pro',
    icon: 'gemini',
    supportedReasoningEfforts: GEMINI_3_1_REASONING_EFFORTS,
    defaultReasoningEffort: 'dynamic',
    supportsThinking: true,
    thinkingAlwaysOn: true
  },
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    icon: 'gemini',
    supportedReasoningEfforts: GEMINI_3_1_REASONING_EFFORTS,
    defaultReasoningEffort: 'dynamic',
    supportsThinking: true,
    thinkingAlwaysOn: false
  },
  {
    value: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    icon: 'gemini',
    supportedReasoningEfforts: GEMINI_3_1_REASONING_EFFORTS,
    defaultReasoningEffort: 'dynamic',
    supportsThinking: false,
    thinkingAlwaysOn: false
  }
];

export interface ReasoningEffortOption {
  value: ReasoningEffort;
  label: string;
  icon: ReasoningIcon;
}

const REASONING_EFFORT_META: Record<ReasoningEffort, { label: string; icon: ReasoningIcon }> = {
  dynamic: { label: 'Dynamic', icon: 'zap' },
  low: { label: 'Low', icon: 'gauge' },
  medium: { label: 'Medium', icon: 'brain' },
  high: { label: 'High', icon: 'flame' }
};

export function getReasoningEffortOptions(modelValue: string): ReasoningEffortOption[] {
  const modelOption = ASSISTANT_MODEL_OPTIONS.find((option) => option.value === modelValue) ?? ASSISTANT_MODEL_OPTIONS[0];

  return modelOption.supportedReasoningEfforts.map((effort) => ({
    value: effort,
    label: REASONING_EFFORT_META[effort].label,
    icon: REASONING_EFFORT_META[effort].icon
  }));
}

export function getDefaultReasoningEffort(modelValue: string): ReasoningEffort {
  const modelOption = ASSISTANT_MODEL_OPTIONS.find((option) => option.value === modelValue) ?? ASSISTANT_MODEL_OPTIONS[0];
  return modelOption.defaultReasoningEffort;
}

export function getModelOption(modelValue: string): AssistantModelOption {
  return ASSISTANT_MODEL_OPTIONS.find((option) => option.value === modelValue) ?? ASSISTANT_MODEL_OPTIONS[0];
}
