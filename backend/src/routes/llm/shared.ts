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

export async function loadRagSnippets(projectId: string, query: string) {
  if (!hasDatabaseConfiguration()) return [];
  if (!query.trim()) return [];
  const results = await searchDocuments({ projectId, query, limit: 4 });
  return results.map((result) => ({
    filename: result.filename,
    snippet: result.snippet
  }));
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
