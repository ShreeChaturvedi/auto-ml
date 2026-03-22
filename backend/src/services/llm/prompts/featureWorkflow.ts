/**
 * Feature engineering workflow prompt builder.
 */

import type { DatasetProfile } from '../../../types/dataset.js';
import type { ToolResult } from '../../../types/llm.js';
import type { FeatureMethod } from '../../featureEngineering.js';
import type {
  LlmRequest,
  LlmToolDefinition,
  LlmToolCallHistory,
  LlmToolResultHistory
} from '../llmClient.js';
import type { LlmReasoningEffort } from '../modelCatalog.js';
import { LLM_ALL_TOOLS } from '../toolRegistry.js';

import { buildSystemPrompt } from './system.js';
import {
  truncateText,
  summarizeFeatureSampleRows,
  summarizeFeatureToolResults,
  MAX_FEATURE_PLAN_CHARS,
  MAX_FEATURE_RAG_SNIPPET_CHARS
} from './toolUsage.js';

export function buildFeatureEngineeringRequest(params: {
  dataset: DatasetProfile;
  targetColumn?: string;
  prompt?: string;
  projectPlan?: string;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  toolResults?: ToolResult[];
  toolCallHistory?: LlmToolCallHistory[];
  toolResultHistory?: LlmToolResultHistory[];
  featureMethods: FeatureMethod[];
  toolDefinitions?: LlmToolDefinition[];
  reasoningEffort?: LlmReasoningEffort;
}): LlmRequest {
  const {
    dataset,
    targetColumn,
    prompt,
    projectPlan,
    ragSnippets,
    toolResults,
    toolCallHistory,
    toolResultHistory,
    featureMethods,
    toolDefinitions,
    reasoningEffort
  } = params;
  const tools = toolDefinitions ?? LLM_ALL_TOOLS;
  const trimmedProjectPlan = projectPlan?.trim()
    ? truncateText(projectPlan.trim(), MAX_FEATURE_PLAN_CHARS)
    : undefined;
  const basePrompt = trimmedProjectPlan
    ? `${buildSystemPrompt()}\n\n## Project Plan (approved by user)\n${trimmedProjectPlan}\n\nFollow this plan closely. It represents the user's approved approach.`
    : buildSystemPrompt();
  const systemPrompt = `${basePrompt}

FEATURE ENGINEERING CONTRACT:
- Notebook execution is source of truth, but each turn must conclude with user-facing output.
- After using tools, you MUST end with exactly one of:
  1) render_ui with a non-empty ui.sections list, OR
  2) ask_user with concrete clarifying questions when blocked by missing requirements.
- Never call render_ui with empty sections.
- Never end the turn with only internal tool calls and no user-facing envelope.
- Prefer render_ui content that includes:
  - at least one report or callout summarizing what changed
  - feature_suggestion items when feasible
  - code_cell only when runnable code is necessary for review.
- feature_suggestion items must use this structure:
  { "id": "...", "feature": { "sourceColumn": "...", "featureName": "...", "method": "...", "params": {} }, "rationale": "...", "impact": "high|medium|low" }.
- If prior tool results are sufficient, do not run more tools; finalize via render_ui.`;
  const toolSummary = summarizeFeatureToolResults(toolResults);

  const userContent = [
    `Goal: Generate a feature engineering plan and UI for dataset "${dataset.filename}".`,
    prompt ? `User intent: ${prompt}` : 'User intent: (not provided)',
    `Target column: ${targetColumn ?? 'unspecified'}`,
    `Dataset summary: ${dataset.nRows} rows, ${dataset.nCols} columns.`,
    `Columns: ${dataset.columns.map((column) => `${column.name} (${column.dtype})`).join(', ')}`,
    'Dataset access: use resolve_dataset_path(filename, datasetId) when writing Python code.',
    `Sample rows: ${summarizeFeatureSampleRows(dataset.sample)}`,
    ragSnippets?.length
      ? `RAG snippets:\n${ragSnippets.map((doc, idx) => `${idx + 1}. ${doc.filename}: ${truncateText(doc.snippet, MAX_FEATURE_RAG_SNIPPET_CHARS)}`).join('\n')}`
      : 'RAG snippets: (none)',
    toolSummary,
    toolResults?.length
      ? 'If the tool results are sufficient, call render_ui now. Do not continue tool execution loops.'
      : '',
    `Supported feature methods: ${featureMethods.join(', ')}.`,
    'Select only relevant UI items. Use code_cell only when runnable code is essential.',
    'Required: produce non-empty render_ui or ask_user before finishing this turn.'
  ].filter(Boolean).join('\n');

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.3,
    // Feature engineering renders rich JSON (render_ui with feature suggestions, reports,
    // code cells). Reasoning models consume output-token budget for reasoning tokens too,
    // so 4096 often leaves nothing for the actual response. 16000 gives sufficient headroom.
    maxOutputTokens: 8000,
    tools,
    toolChoice: 'auto',
    toolCallHistory,
    toolResultHistory,
    reasoningEffort,
    contextId: dataset.projectId ?? dataset.datasetId
  };
}
