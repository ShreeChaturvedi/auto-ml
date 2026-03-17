/**
 * Tool invocation guidance, shared helpers, and workflow prompts
 * for preprocessing and onboarding.
 */

import type { DatasetProfile } from '../../../types/dataset.js';
import type { ToolResult } from '../../../types/llm.js';
import type {
  LlmRequest,
  LlmToolDefinition,
  LlmToolCallHistory,
  LlmToolResultHistory
} from '../llmClient.js';
import type { LlmReasoningEffort } from '../modelCatalog.js';
import { LLM_ALL_TOOLS } from '../toolRegistry.js';

import { buildSystemPrompt } from './system.js';

/* ---- Constants ---- */

export const MAX_FEATURE_PLAN_CHARS = 4500;
export const MAX_FEATURE_SAMPLE_ROWS = 3;
export const MAX_FEATURE_SAMPLE_VALUE_CHARS = 120;
export const MAX_FEATURE_RAG_SNIPPET_CHARS = 240;
export const MAX_FEATURE_TOOL_SUMMARY_COUNT = 10;

/* ---- Helper utilities ---- */

export function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\u2026`;
}

export function summarizeFeatureSampleRows(sample: unknown[] | undefined): string {
  if (!sample?.length) {
    return '(none)';
  }

  const normalizedRows = sample.slice(0, MAX_FEATURE_SAMPLE_ROWS).map((row) => {
    if (!row || typeof row !== 'object') {
      return row;
    }
    return Object.fromEntries(
      Object.entries(row as Record<string, unknown>).map(([key, value]) => {
        if (typeof value === 'string') {
          return [key, truncateText(value, MAX_FEATURE_SAMPLE_VALUE_CHARS)];
        }
        return [key, value];
      })
    );
  });

  return JSON.stringify(normalizedRows);
}

export function summarizeFeatureToolResults(toolResults?: ToolResult[]): string {
  if (!toolResults?.length) {
    return 'Tool results: (none)';
  }

  const uniqueToolNames = Array.from(new Set(toolResults.map((result) => result.tool)));
  const displayNames = uniqueToolNames.slice(-MAX_FEATURE_TOOL_SUMMARY_COUNT);
  const overflow = uniqueToolNames.length - displayNames.length;
  const overflowSuffix = overflow > 0 ? ` (+${overflow} more)` : '';

  return `Tool results available for: ${displayNames.join(', ')}${overflowSuffix}.`;
}

/* ---- Preprocessing request builder ---- */

export function buildPreprocessingRequest(params: {
  dataset: DatasetProfile;
  prompt?: string;
  projectPlan?: string;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  toolResults?: ToolResult[];
  toolCallHistory?: LlmToolCallHistory[];
  toolResultHistory?: LlmToolResultHistory[];
  toolDefinitions?: LlmToolDefinition[];
  reasoningEffort?: LlmReasoningEffort;
}): LlmRequest {
  const {
    dataset,
    prompt,
    projectPlan,
    ragSnippets,
    toolResults,
    toolCallHistory,
    toolResultHistory,
    toolDefinitions,
    reasoningEffort
  } = params;

  const tools = toolDefinitions ?? LLM_ALL_TOOLS;
  const systemPrompt = `${projectPlan?.trim()
    ? `${buildSystemPrompt()}\n\n## Project Plan (approved by user)\n${projectPlan}\n\nFollow this plan closely while adapting transformations to observed data issues.`
    : buildSystemPrompt()}

PREPROCESSING CONTRACT:
- Notebook code and execution are the source of truth.
- Always use semantic stage tools for each step lifecycle:
  1) propose_transformation_step
  2) materialize_step_code
  3) write_cell / run_cell (or edit_cell / run_cell)
  4) execute_transformation_step
  5) validate_step_result
  6) commit_transformation_step
- Keep stable step_id across the full lifecycle.
- When writing/editing/running cells for a preprocessing step, persist canonical lineage metadata in metadata.preprocessing:
  { runId, stepId, toolCallId, version, codeHash }.
- If user manually edits bound step code, call detect_step_divergence before further commits; if diverged, call reconcile_diverged_step.
- Prefer one transformation step per response cycle unless steps are tightly coupled.
- For risky operations (dropping columns, outlier removal, custom code), set validate_step_result.requiresApproval=true.
- If user rejects an awaiting step, call commit_transformation_step with approved=false and rejectionReason.
- If notebook execution fails, surface precise errors and revise code before committing.
- Never claim a step is committed without a successful execute + validate path.`;

  const userContent = [
    `Goal: perform deterministic preprocessing for dataset "${dataset.filename}".`,
    prompt ? `User instruction: ${prompt}` : 'User instruction: suggest a safe next preprocessing step.',
    `Dataset summary: ${dataset.nRows} rows, ${dataset.nCols} columns.`,
    `Columns: ${dataset.columns.map((column) => `${column.name} (${column.dtype})`).join(', ')}`,
    dataset.sample?.length
      ? `Sample rows: ${JSON.stringify(dataset.sample.slice(0, 5))}`
      : 'Sample rows: (none)',
    ragSnippets?.length
      ? `RAG snippets:\n${ragSnippets.map((doc, index) => `${index + 1}. ${doc.filename}: ${doc.snippet}`).join('\n')}`
      : 'RAG snippets: (none)',
    toolResults?.length
      ? `Recent tool results: ${toolResults.map((result) => `${result.tool}: ${result.error ?? 'ok'}`).join(', ')}`
      : 'Recent tool results: (none)',
    'Use set_active_dataset when dataset context is not established in this run.',
    'Use checkpoint_dataset after committed high-impact changes.'
  ].join('\n');

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.25,
    maxOutputTokens: 4096,
    tools,
    toolChoice: 'auto',
    toolCallHistory,
    toolResultHistory,
    reasoningEffort,
    contextId: dataset.projectId ?? dataset.datasetId
  };
}

/* ---- Onboarding request builder ---- */

export function buildOnboardingRequest(opts: {
  projectTitle: string;
  projectDescription: string;
  fileSummaries: Array<{ filename: string; type: 'dataset' | 'document'; stats?: Record<string, unknown> }>;
  userIntent?: string;
  questionAnswers?: Array<{ questionId: string; answer: string | string[] }>;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  round: number;
  toolCallHistory?: Array<{ name: string; args: Record<string, unknown> }>;
  toolResultHistory?: Array<{ name: string; response: Record<string, unknown> }>;
  toolDefinitions: LlmToolDefinition[];
  reasoningEffort?: LlmReasoningEffort;
}): LlmRequest {
  const systemPrompt = `You are an expert data scientist and ML engineer helping a user plan their machine learning project.

## Your Mission
The user has uploaded data files and will tell you what they want to achieve. Your job is to understand their goal, inspect their data with tools, ask smart clarifying questions, and produce a comprehensive project plan.

## Your Tools
- list_project_files: See what files are available
- get_dataset_profile: Get detailed statistics for a dataset
- get_dataset_sample: See sample rows from a dataset
- search_documents: Search uploaded context documents
- ask_user: Ask the user clarifying questions (renders as interactive UI)
- plan_exit: Finalize and return the complete plan file content

## Workflow
${opts.round === 0
    ? `This is the FIRST round. The user has just told you their goal.
1. FIRST: Use your data tools (list_project_files, get_dataset_profile, get_dataset_sample) to inspect the uploaded files and understand the data in context of the user's stated goal.
2. THEN: Based on what you found in the data AND the user's goal, call ask_user with 2-4 smart, data-informed clarifying questions. Reference actual columns, data patterns, and statistics you discovered. Include suggested options based on your analysis.
3. Do NOT finalize the plan yet — wait for the user's answers first.`
    : `This is round ${opts.round}/5. You have the user's goal and previous answers.
1. If you need more information, use data tools and/or call ask_user with follow-up questions (2-4 per round).
2. If you have enough context, call plan_exit with planMarkdown and optional planName.`}

## Critical Rules
- Do NOT call render_ui. Ever.
- Do NOT generate unsolicited content or make assumptions about the user's goal.
- Use ask_user for clarifying questions — do not just print questions as text.
- The final plan MUST be sent through plan_exit. Do not output full plan content as plain chat text.
- Keep your text responses concise and focused. Do not ramble.

## Plan Format (put this in plan_exit.planMarkdown)
# Project Plan: {title}

## Objective
[Clear statement of what we're trying to achieve]

## Data Summary
[What was uploaded, key statistics, quality observations, relationships between files]

## Approach
[Methodology, algorithm candidates, rationale for choices]

## Feature Engineering Strategy
[Transformations, encodings, derived features to consider]

## Target & Evaluation
[Target variable, train/test split strategy, success metrics (accuracy, RMSE, etc.)]

## Risks & Assumptions
[Data quality issues, potential pitfalls, assumptions being made]

## Next Steps
[Ordered list of what to do next in the workflow]`;

  const formattedFileSummaries = opts.fileSummaries.length
    ? opts.fileSummaries
      .map((file, index) => {
        const stats = file.stats ? `\n  Stats: ${JSON.stringify(file.stats)}` : '';
        return `${index + 1}. ${file.filename} (${file.type})${stats}`;
      })
      .join('\n')
    : '(none)';

  const formattedAnswers = opts.questionAnswers?.length
    ? opts.questionAnswers
      .map((entry, index) => {
        const answerText = Array.isArray(entry.answer) ? entry.answer.join(', ') : entry.answer;
        return `${index + 1}. ${entry.questionId}: ${answerText}`;
      })
      .join('\n')
    : '(none)';

  const userSections: string[] = [
    `Project title: ${opts.projectTitle}`,
    `Project description: ${opts.projectDescription || '(none)'}`,
    `Current round: ${opts.round}`,
    `Uploaded files:\n${formattedFileSummaries}`,
    opts.ragSnippets?.length
      ? `RAG snippets:\n${opts.ragSnippets.map((doc, index) => `${index + 1}. ${doc.filename}: ${doc.snippet}`).join('\n')}`
      : 'RAG snippets: (none)'
  ];

  if (opts.round === 0) {
    userSections.push(`User intent: ${opts.userIntent?.trim() || '(not provided yet)'}`);
  } else {
    userSections.push(`Latest user intent note: ${opts.userIntent?.trim() || '(none)'}`);
    userSections.push(`Question answers received:\n${formattedAnswers}`);
  }

  userSections.push('If you need more clarification, call ask_user. If you have enough context, call plan_exit with the final markdown plan.');

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userSections.join('\n\n') }
    ],
    temperature: 0.3,
    maxOutputTokens: 4096,
    tools: opts.toolDefinitions,
    toolChoice: 'auto',
    toolCallHistory: opts.toolCallHistory,
    toolResultHistory: opts.toolResultHistory,
    reasoningEffort: opts.reasoningEffort,
    contextId: opts.projectTitle
  };
}
