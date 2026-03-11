/**
 * Training workflow prompt builder.
 */

import type { DatasetProfile } from '../../../types/dataset.js';
import type { ToolResult } from '../../../types/llm.js';
import type {
  LlmRequest,
  LlmThinkingLevel,
  LlmToolDefinition,
  LlmToolCallHistory,
  LlmToolResultHistory
} from '../llmClient.js';
import type { LlmReasoningEffort } from '../modelCatalog.js';
import { LLM_ALL_TOOLS } from '../toolRegistry.js';

import { buildSystemPrompt } from './system.js';

export function buildTrainingRequest(params: {
  dataset: DatasetProfile;
  targetColumn?: string;
  prompt?: string;
  projectPlan?: string;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  toolResults?: ToolResult[];
  featureSummary?: string;
  toolCallHistory?: LlmToolCallHistory[];
  toolResultHistory?: LlmToolResultHistory[];
  toolDefinitions?: LlmToolDefinition[];
  reasoningEffort?: LlmReasoningEffort;
  enableThinking?: boolean;
  thinkingLevel?: LlmThinkingLevel;
}): LlmRequest {
  const {
    dataset,
    targetColumn,
    prompt,
    projectPlan,
    ragSnippets,
    toolResults,
    featureSummary,
    toolCallHistory,
    toolResultHistory,
    toolDefinitions,
    reasoningEffort,
    enableThinking,
    thinkingLevel
  } = params;
  const tools = toolDefinitions ?? LLM_ALL_TOOLS;
  const systemPrompt = projectPlan?.trim()
    ? `${buildSystemPrompt()}\n\n## Project Plan (approved by user)\n${projectPlan}\n\nFollow this plan closely. It represents the user's approved approach.`
    : buildSystemPrompt();

  // Build context block that is INFORMATIONAL, not instructional
  const contextParts = [
    `[Context - Available dataset: "${dataset.filename}" (${dataset.nRows} rows, ${dataset.nCols} columns)]`,
    targetColumn ? `[Target column: ${targetColumn}]` : null,
    `[Columns: ${dataset.columns.map((column) => `${column.name} (${column.dtype})`).join(', ')}]`,
    featureSummary ? `[Feature engineering applied: ${featureSummary}]` : null,
    ragSnippets?.length
      ? `[Relevant docs:\n${ragSnippets.map((doc) => `- ${doc.filename}: ${doc.snippet.slice(0, 200)}`).join('\n')}]`
      : null,
    toolResults?.length
      ? `[Previous tool results: ${toolResults.map((r) => `${r.tool}: ${r.error ?? 'success'}`).join(', ')}]`
      : null
  ].filter(Boolean);

  // User prompt is the PRIMARY content
  // If no prompt (shouldn't happen), just pass context
  const userContent = prompt
    ? `${prompt}\n\n${contextParts.join('\n')}`
    : contextParts.join('\n');

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.4,
    maxOutputTokens: 4096,
    tools,
    toolChoice: 'auto',
    toolCallHistory,
    toolResultHistory,
    reasoningEffort,
    enableThinking,
    thinkingLevel,
    contextId: dataset.projectId ?? dataset.datasetId
  };
}
