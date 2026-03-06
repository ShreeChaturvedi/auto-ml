import { env } from '../../config.js';

export type LlmReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type LegacyThinkingLevel = 'dynamic' | 'low' | 'medium' | 'high';

export type Gpt5ModelKind = 'base' | 'chat' | 'codex' | 'mini' | 'nano' | 'pro';

export interface LlmModelCatalogEntry {
  id: string;
  label: string;
  kind: Gpt5ModelKind;
  description: string;
  reasoningEfforts: readonly LlmReasoningEffort[];
  defaultReasoningEffort: LlmReasoningEffort;
  featured: boolean;
  featuredOrder?: number;
}

const GPT_54_EFFORTS: readonly LlmReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh'];
const GPT_53_CODEX_EFFORTS: readonly LlmReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];
const GPT_5_MINI_EFFORTS: readonly LlmReasoningEffort[] = ['low', 'medium', 'high'];
const GPT_5_NANO_EFFORTS: readonly LlmReasoningEffort[] = ['low', 'medium', 'high'];
const GPT_54_PRO_EFFORTS: readonly LlmReasoningEffort[] = ['medium', 'high', 'xhigh'];
const GPT_51_EFFORTS: readonly LlmReasoningEffort[] = ['none', 'low', 'medium', 'high'];
const LEGACY_GPT5_EFFORTS: readonly LlmReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];
const CHAT_GPT5_EFFORTS: readonly LlmReasoningEffort[] = [];

const CATALOG: readonly LlmModelCatalogEntry[] = [
  {
    id: 'gpt-5.4',
    label: 'GPT 5.4',
    kind: 'base',
    description: 'Best default for most chats, planning, and agentic work.',
    reasoningEfforts: GPT_54_EFFORTS,
    defaultReasoningEffort: 'high',
    featured: true,
    featuredOrder: 0
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT 5.3 Codex',
    kind: 'codex',
    description: 'Best when the task is code-heavy, tool-heavy, or iterative.',
    reasoningEfforts: GPT_53_CODEX_EFFORTS,
    defaultReasoningEffort: 'high',
    featured: true,
    featuredOrder: 1
  },
  {
    id: 'gpt-5-mini',
    label: 'GPT 5 Mini',
    kind: 'mini',
    description: 'Faster and cheaper for everyday chat without dropping to the smallest model.',
    reasoningEfforts: GPT_5_MINI_EFFORTS,
    defaultReasoningEffort: 'medium',
    featured: true,
    featuredOrder: 2
  },
  {
    id: 'gpt-5-nano',
    label: 'GPT 5 Nano',
    kind: 'nano',
    description: 'Lowest-latency option for short prompts and lightweight tasks.',
    reasoningEfforts: GPT_5_NANO_EFFORTS,
    defaultReasoningEffort: 'low',
    featured: true,
    featuredOrder: 3
  },
  {
    id: 'gpt-5.4-pro',
    label: 'GPT 5.4 Pro',
    kind: 'pro',
    description: 'Highest-effort GPT-5.4 variant for the hardest reasoning tasks.',
    reasoningEfforts: GPT_54_PRO_EFFORTS,
    defaultReasoningEffort: 'high',
    featured: false
  },
  {
    id: 'gpt-5.2',
    label: 'GPT 5.2',
    kind: 'base',
    description: 'Previous GPT-5 flagship base model.',
    reasoningEfforts: GPT_54_EFFORTS,
    defaultReasoningEffort: 'medium',
    featured: false
  },
  {
    id: 'gpt-5.1',
    label: 'GPT 5.1',
    kind: 'base',
    description: 'Earlier GPT-5 base model with a smaller reasoning-effort range.',
    reasoningEfforts: GPT_51_EFFORTS,
    defaultReasoningEffort: 'medium',
    featured: false
  },
  {
    id: 'gpt-5',
    label: 'GPT 5',
    kind: 'base',
    description: 'Original GPT-5 base release.',
    reasoningEfforts: LEGACY_GPT5_EFFORTS,
    defaultReasoningEffort: 'medium',
    featured: false
  },
  {
    id: 'gpt-5.3-chat-latest',
    label: 'GPT 5.3 Chat',
    kind: 'chat',
    description: 'Latest ChatGPT-tuned GPT-5 chat model for conversational use.',
    reasoningEfforts: CHAT_GPT5_EFFORTS,
    defaultReasoningEffort: 'none',
    featured: false
  },
  {
    id: 'gpt-5.2-chat-latest',
    label: 'GPT 5.2 Chat',
    kind: 'chat',
    description: 'Previous ChatGPT-tuned GPT-5 chat model.',
    reasoningEfforts: CHAT_GPT5_EFFORTS,
    defaultReasoningEffort: 'none',
    featured: false
  },
  {
    id: 'gpt-5.1-chat-latest',
    label: 'GPT 5.1 Chat',
    kind: 'chat',
    description: 'Earlier ChatGPT-tuned GPT-5 chat model.',
    reasoningEfforts: CHAT_GPT5_EFFORTS,
    defaultReasoningEffort: 'none',
    featured: false
  },
  {
    id: 'gpt-5-chat-latest',
    label: 'GPT 5 Chat',
    kind: 'chat',
    description: 'Original ChatGPT-tuned GPT-5 chat model.',
    reasoningEfforts: CHAT_GPT5_EFFORTS,
    defaultReasoningEffort: 'none',
    featured: false
  },
  {
    id: 'gpt-5.2-codex',
    label: 'GPT 5.2 Codex',
    kind: 'codex',
    description: 'Previous GPT-5 Codex release.',
    reasoningEfforts: GPT_53_CODEX_EFFORTS,
    defaultReasoningEffort: 'high',
    featured: false
  },
  {
    id: 'gpt-5.1-codex',
    label: 'GPT 5.1 Codex',
    kind: 'codex',
    description: 'Earlier GPT-5 Codex model for coding and tool execution.',
    reasoningEfforts: LEGACY_GPT5_EFFORTS,
    defaultReasoningEffort: 'high',
    featured: false
  },
  {
    id: 'gpt-5.1-codex-mini',
    label: 'GPT 5.1 Codex Mini',
    kind: 'codex',
    description: 'Smaller GPT-5 Codex variant for lighter coding workflows.',
    reasoningEfforts: LEGACY_GPT5_EFFORTS,
    defaultReasoningEffort: 'medium',
    featured: false
  },
  {
    id: 'gpt-5.1-codex-max',
    label: 'GPT 5.1 Codex Max',
    kind: 'codex',
    description: 'High-reasoning GPT-5 Codex variant for larger coding tasks.',
    reasoningEfforts: ['high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: false
  },
  {
    id: 'gpt-5-codex',
    label: 'GPT 5 Codex',
    kind: 'codex',
    description: 'Original GPT-5 Codex release.',
    reasoningEfforts: LEGACY_GPT5_EFFORTS,
    defaultReasoningEffort: 'medium',
    featured: false
  },
  {
    id: 'gpt-5.2-pro',
    label: 'GPT 5.2 Pro',
    kind: 'pro',
    description: 'Previous GPT-5 Pro release.',
    reasoningEfforts: GPT_54_PRO_EFFORTS,
    defaultReasoningEffort: 'high',
    featured: false
  },
  {
    id: 'gpt-5-pro',
    label: 'GPT 5 Pro',
    kind: 'pro',
    description: 'Original GPT-5 Pro release.',
    reasoningEfforts: ['high'],
    defaultReasoningEffort: 'high',
    featured: false
  }
];

const FALLBACK_DEFAULT_MODEL_ID = 'gpt-5.4';
const CATALOG_INDEX = new Map(CATALOG.map((entry, index) => [entry.id, index]));

function sortCatalog(left: LlmModelCatalogEntry, right: LlmModelCatalogEntry): number {
  if (left.featured && right.featured) {
    return (left.featuredOrder ?? 0) - (right.featuredOrder ?? 0);
  }
  if (left.featured !== right.featured) {
    return left.featured ? -1 : 1;
  }
  return (CATALOG_INDEX.get(left.id) ?? 0) - (CATALOG_INDEX.get(right.id) ?? 0);
}

function resolveConfiguredDefaultModelId(): string {
  return getModelCatalogEntry(env.llmModel)?.id ?? FALLBACK_DEFAULT_MODEL_ID;
}

export function listCatalogModels(): LlmModelCatalogEntry[] {
  return [...CATALOG].sort(sortCatalog);
}

export function listFeaturedModels(): LlmModelCatalogEntry[] {
  return listCatalogModels().filter((entry) => entry.featured);
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
