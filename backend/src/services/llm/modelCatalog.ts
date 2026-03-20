import { env } from '../../config.js';

export type LlmReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

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

const LEGACY_MODEL_ID_ALIASES: Record<string, string> = {
  'gpt-5-mini': 'gpt-5.4-mini',
  'gpt-5-nano': 'gpt-5.4-nano'
};

const CATALOG: readonly LlmModelCatalogEntry[] = [
  {
    id: 'gpt-5.4',
    label: 'GPT 5.4',
    kind: 'base',
    description: 'Strongest model for complex planning, tool orchestration, and high-stakes work.',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: true,
    featuredOrder: 0
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT 5.3 Codex',
    kind: 'codex',
    description: 'Use for coding tasks and tool-heavy workflows.',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: true,
    featuredOrder: 1
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT 5.4 Mini',
    kind: 'mini',
    description: 'Use for most everyday tasks with strong quality at lower cost.',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'medium',
    featured: true,
    featuredOrder: 2
  },
  {
    id: 'gpt-5.4-nano',
    label: 'GPT 5.4 Nano',
    kind: 'nano',
    description: 'Use for fast, simple tasks and high-volume requests.',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'low',
    featured: true,
    featuredOrder: 3
  }
];

const FALLBACK_DEFAULT_MODEL_ID = 'gpt-5.4';

export function normalizeCatalogModelId(modelId: string | undefined | null): string | undefined {
  if (!modelId) {
    return undefined;
  }
  return LEGACY_MODEL_ID_ALIASES[modelId] ?? modelId;
}

function resolveConfiguredDefaultModelId(): string {
  return getModelCatalogEntry(normalizeCatalogModelId(env.llmModel))?.id ?? FALLBACK_DEFAULT_MODEL_ID;
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
  const normalizedModelId = normalizeCatalogModelId(modelId);
  if (!normalizedModelId) {
    return null;
  }
  return CATALOG.find((entry) => entry.id === normalizedModelId) ?? null;
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
}): LlmReasoningEffort | undefined {
  return coerceReasoningEffort(params.modelId, params.reasoningEffort);
}

export function isGpt5Model(modelId: string | undefined | null): boolean {
  return Boolean(modelId && getModelCatalogEntry(modelId));
}
