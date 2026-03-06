import { env } from '../../config.js';

export type LlmReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type LegacyThinkingLevel = 'dynamic' | 'low' | 'medium' | 'high';

export type Gpt5ModelKind = 'base' | 'codex' | 'mini' | 'nano';

export interface LlmModelCatalogEntry {
  id: string;
  label: string;
  kind: Gpt5ModelKind;
  description: string;
  reasoningEfforts: readonly LlmReasoningEffort[];
  defaultReasoningEffort: LlmReasoningEffort;
  featured: boolean;
  featuredOrder: number;
}

const CATALOG: readonly LlmModelCatalogEntry[] = [
  {
    id: 'gpt-5.4',
    label: 'GPT 5.4',
    kind: 'base',
    description: 'Strongest model for complex planning, tool orchestration, and high-stakes work.',
    reasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: true,
    featuredOrder: 0
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT 5.3 Codex',
    kind: 'codex',
    description: 'Best when the task is code-heavy, tool-heavy, or iterative.',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: true,
    featuredOrder: 1
  },
  {
    id: 'gpt-5-mini',
    label: 'GPT 5 Mini',
    kind: 'mini',
    description: 'Faster and cheaper for everyday chat without dropping to the smallest model.',
    reasoningEfforts: ['low', 'medium', 'high'],
    defaultReasoningEffort: 'medium',
    featured: true,
    featuredOrder: 2
  },
  {
    id: 'gpt-5-nano',
    label: 'GPT 5 Nano',
    kind: 'nano',
    description: 'Lowest-latency option for short prompts and lightweight tasks.',
    reasoningEfforts: ['low', 'medium', 'high'],
    defaultReasoningEffort: 'low',
    featured: true,
    featuredOrder: 3
  }
];

const FALLBACK_DEFAULT_MODEL_ID = 'gpt-5.4';

function resolveConfiguredDefaultModelId(): string {
  return getModelCatalogEntry(env.llmModel)?.id ?? FALLBACK_DEFAULT_MODEL_ID;
}

export function listCatalogModels(): LlmModelCatalogEntry[] {
  return [...CATALOG].sort((left, right) => left.featuredOrder - right.featuredOrder);
}

export function listFeaturedModels(): LlmModelCatalogEntry[] {
  return listCatalogModels();
}

export function getDefaultLlmModel(): string {
  return resolveConfiguredDefaultModelId();
}

export function getModelCatalogEntry(modelId: string | undefined | null): LlmModelCatalogEntry | null {
  if (!modelId) {
    return null;
  }
  return CATALOG.find((entry) => entry.id === modelId) ?? null;
}

export function resolveCatalogModel(modelId: string | undefined | null): LlmModelCatalogEntry {
  return getModelCatalogEntry(modelId) ?? getModelCatalogEntry(resolveConfiguredDefaultModelId())!;
}

export function getDefaultReasoningEffortForModel(modelId: string | undefined | null): LlmReasoningEffort {
  return resolveCatalogModel(modelId).defaultReasoningEffort;
}

export function supportsReasoningEffort(
  modelId: string | undefined | null,
  effort: LlmReasoningEffort | undefined
): effort is LlmReasoningEffort {
  if (!effort) {
    return false;
  }
  return resolveCatalogModel(modelId).reasoningEfforts.includes(effort);
}

export function coerceReasoningEffort(
  modelId: string | undefined | null,
  effort: LlmReasoningEffort | undefined
): LlmReasoningEffort | undefined {
  if (!effort) {
    return undefined;
  }
  return supportsReasoningEffort(modelId, effort)
    ? effort
    : resolveCatalogModel(modelId).defaultReasoningEffort;
}

export function normalizeReasoningSelection(params: {
  modelId?: string | null;
  reasoningEffort?: LlmReasoningEffort;
  enableThinking?: boolean;
  thinkingLevel?: LegacyThinkingLevel;
}): LlmReasoningEffort | undefined {
  if (params.reasoningEffort) {
    return coerceReasoningEffort(params.modelId, params.reasoningEffort);
  }

  const model = resolveCatalogModel(params.modelId);
  if (params.enableThinking === false) {
    return supportsReasoningEffort(model.id, 'none') ? 'none' : undefined;
  }

  switch (params.thinkingLevel) {
    case 'low':
      return coerceReasoningEffort(model.id, 'low');
    case 'medium':
      return coerceReasoningEffort(model.id, 'medium');
    case 'high':
      return coerceReasoningEffort(model.id, 'high');
    default:
      return params.enableThinking ? model.defaultReasoningEffort : undefined;
  }
}

export function isGpt5Model(modelId: string | undefined | null): boolean {
  return Boolean(modelId && getModelCatalogEntry(modelId));
}
