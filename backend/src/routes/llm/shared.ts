import { z } from 'zod';

import { getDbPool, hasDatabaseConfiguration } from '../../db.js';
import { searchDocuments } from '../../services/documentSearchService.js';
import {
  getDefaultLlmModel,
  normalizeReasoningSelection,
  type LlmReasoningEffort
} from '../../services/llm/modelCatalog.js';
import { ToolCallSchema } from '../../types/llm.js';

export const toolResultSchema = z.object({
  id: z.string().min(1),
  tool: ToolCallSchema.shape.tool,
  output: z.unknown().optional(),
  error: z.string().optional()
});

const reasoningEffortSchema = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']);

export const planSchema = z.object({
  projectId: z.string().min(1),
  datasetId: z.string().optional(),
  threadId: z.string().min(1).optional(),
  continuation: z.boolean().optional(),
  targetColumn: z.string().optional(),
  prompt: z.string().optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolResults: z.array(toolResultSchema).optional(),
  featureSummary: z.string().optional(),
  reasoningEffort: reasoningEffortSchema.optional(),
  model: z.string().optional()
});

export const onboardingSchema = z.object({
  projectId: z.string().min(1),
  userIntent: z.string().optional(),
  questionAnswers: z
    .array(
      z.object({
        questionId: z.string(),
        answer: z.union([z.string(), z.array(z.string())])
      })
    )
    .optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolResults: z.array(toolResultSchema).optional(),
  round: z.number().int().min(0).max(5).default(0),
  reasoningEffort: reasoningEffortSchema.optional(),
  model: z.string().optional()
});

export function normalizeReasoningEffortInput(params: {
  model?: string;
  reasoningEffort?: LlmReasoningEffort;
}): LlmReasoningEffort | undefined {
  return normalizeReasoningSelection({
    modelId: params.model ?? getDefaultLlmModel(),
    reasoningEffort: params.reasoningEffort
  });
}

export async function listProjectDocuments(projectId: string) {
  if (!hasDatabaseConfiguration()) {
    return [];
  }
  const pool = getDbPool();
  const result = await pool.query(
    `SELECT document_id, filename, mime_type FROM documents WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId]
  );
  return result.rows.map((row) => ({
    documentId: row.document_id as string,
    filename: row.filename as string,
    mimeType: row.mime_type as string
  }));
}

// Short-lived cache for RAG snippet lookups. Every graph iteration of a
// workflow turn calls loadRagSnippets with the SAME query (turn.prompt),
// so without this cache a 24-iteration turn fires 24 identical vector
// searches + 24 identical embedding requests. The 5-minute TTL is long
// enough to cover any reasonable turn length and short enough that new
// documents are picked up promptly; we also invalidate explicitly when
// a new document is ingested (see __invalidateRagCacheForProject).
const RAG_CACHE_MAX_ENTRIES = 200;
const RAG_CACHE_TTL_MS = 5 * 60 * 1000;

interface RagCacheEntry {
  snippets: Array<{ filename: string; snippet: string }>;
  expiresAt: number;
}

const ragCache = new Map<string, RagCacheEntry>();
const inflightRagLookups = new Map<string, Promise<Array<{ filename: string; snippet: string }>>>();

function buildRagCacheKey(projectId: string, query: string): string {
  return `${projectId}::${query.trim()}`;
}

function cloneSnippets(snippets: Array<{ filename: string; snippet: string }>) {
  return snippets.map((entry) => ({ ...entry }));
}

export async function loadRagSnippets(projectId: string, query: string) {
  if (!hasDatabaseConfiguration()) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];

  const key = buildRagCacheKey(projectId, trimmed);

  const cached = ragCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cloneSnippets(cached.snippets);
  }
  if (cached) {
    ragCache.delete(key);
  }

  const existingInflight = inflightRagLookups.get(key);
  if (existingInflight) {
    return cloneSnippets(await existingInflight);
  }

  const pending = (async () => {
    const results = await searchDocuments({ projectId, query: trimmed, limit: 4 });
    const snippets = results.map((result) => ({
      filename: result.filename,
      snippet: result.snippet
    }));
    if (ragCache.size >= RAG_CACHE_MAX_ENTRIES) {
      const oldest = ragCache.keys().next().value;
      if (oldest !== undefined) ragCache.delete(oldest);
    }
    ragCache.set(key, { snippets, expiresAt: Date.now() + RAG_CACHE_TTL_MS });
    return snippets;
  })();

  inflightRagLookups.set(key, pending);
  try {
    return cloneSnippets(await pending);
  } finally {
    inflightRagLookups.delete(key);
  }
}

/**
 * Invalidate all cached RAG results for a project. Call this whenever a
 * document is ingested, updated, or deleted so subsequent lookups see the
 * fresh document set instead of stale TTL-bounded results.
 */
export function __invalidateRagCacheForProject(projectId: string): void {
  for (const key of ragCache.keys()) {
    if (key.startsWith(`${projectId}::`)) {
      ragCache.delete(key);
    }
  }
}

/** Test-only: clear the RAG snippet cache and any in-flight lookups. */
export function __clearRagCacheForTests(): void {
  ragCache.clear();
  inflightRagLookups.clear();
}

export function getFeatureEngineeringGateState(metadata: unknown): {
  requiresApproval: boolean;
  hasApprovedVersion: boolean;
} {
  if (!metadata || typeof metadata !== 'object') {
    return { requiresApproval: false, hasApprovedVersion: false };
  }

  const record = metadata as Record<string, unknown>;
  const requiresApproval = record.feWorkflowVersion === 2;
  if (!requiresApproval) {
    return { requiresApproval: false, hasApprovedVersion: false };
  }

  const versions = Array.isArray(record.pipelineVersions) ? record.pipelineVersions : [];
  const hasApprovedVersion = versions.some((version) => {
    if (!version || typeof version !== 'object') {
      return false;
    }

    return (version as Record<string, unknown>).status === 'approved';
  });

  return { requiresApproval, hasApprovedVersion };
}
