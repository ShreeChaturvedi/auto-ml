import type { DatasetProfile } from '../../../types/dataset.js';
import type { ToolResult } from '../../../types/llm.js';
import type {
  LlmRequest,
  LlmToolCallHistory,
  LlmToolDefinition,
  LlmToolResultHistory
} from '../llmClient.js';
import type { LlmReasoningEffort } from '../modelCatalog.js';
import {
  CELL_TOOL_DEFINITIONS,
  PREPROCESSING_ORCHESTRATION_TOOLS
} from '../toolRegistry.js';

import type { PreprocessingControllerNode } from './controllerRouting.js';
import type { PreprocessingTurnMode } from './turnClassification.js';

const ORCHESTRATION_TOOLS = new Map(PREPROCESSING_ORCHESTRATION_TOOLS.map((tool) => [tool.name, tool]));
const CELL_TOOLS = new Map(CELL_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));

export interface PreprocessingRequestSummary {
  threadId: string;
  runId?: string;
  turnMode: PreprocessingTurnMode;
  currentNode: PreprocessingControllerNode;
  allowedTools: string[];
  requireToolCall: boolean;
  activeStepId?: string;
}

export interface PreprocessingRequestParams {
  dataset: DatasetProfile;
  prompt?: string;
  projectPlan?: string;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  toolResults?: ToolResult[];
  toolCallHistory?: LlmToolCallHistory[];
  toolResultHistory?: LlmToolResultHistory[];
  reasoningEffort?: LlmReasoningEffort;
  threadId?: string;
}

export function summarizeDatasetForPrompt(dataset: DatasetProfile): string {
  return [
    `Dataset: ${dataset.filename}`,
    `Rows: ${dataset.nRows}`,
    `Columns (${dataset.nCols}): ${dataset.columns.map((column) => `${column.name} (${column.dtype})`).join(', ')}`,
    dataset.sample?.length ? `Sample rows: ${JSON.stringify(dataset.sample.slice(0, 3))}` : 'Sample rows: (none)'
  ].join('\n');
}

function filterTools(toolNames: string[]): LlmToolDefinition[] {
  return toolNames.flatMap((toolName) => {
    const orchestration = ORCHESTRATION_TOOLS.get(toolName);
    if (orchestration) {
      return [orchestration];
    }

    const cell = CELL_TOOLS.get(toolName);
    return cell ? [cell] : [];
  });
}

export function buildPreprocessingAnswerRequest(params: PreprocessingRequestParams): LlmRequest {
  return {
    messages: [
      {
        role: 'system',
        content: [
          'You are the preprocessing assistant for an AutoML notebook workflow.',
          'This turn is answer-only. Do not call tools or imply that data/notebook state changed.',
          'Answer directly and concisely in markdown.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          summarizeDatasetForPrompt(params.dataset),
          params.projectPlan?.trim() ? `Project plan:\n${params.projectPlan}` : 'Project plan: (none)',
          params.prompt ? `User prompt: ${params.prompt}` : 'User prompt: Explain the current preprocessing state.'
        ].join('\n\n')
      }
    ],
    maxOutputTokens: 1800,
    temperature: 0.25,
    reasoningEffort: params.reasoningEffort,
    toolCallHistory: params.toolCallHistory,
    toolResultHistory: params.toolResultHistory,
    contextId: params.threadId ?? params.dataset.projectId ?? params.dataset.datasetId
  };
}

function buildNodeSpecificSystemSections(node: PreprocessingControllerNode): string[] {
  switch (node) {
    case 'plan_step':
      return [
        'Your next action should establish context or propose exactly one transformation step.',
        'IMPORTANT: Do not profile the same dataset more than once. After a single profile_active_dataset call, proceed directly to propose_transformation_step.',
        'Batch your understanding from one profile call — do not call profile_active_dataset repeatedly.'
      ];
    case 'generate_code':
      return ['Your next action should materialize executable code for the current step.'];
    case 'write_code':
      return ['Your next action should bind code to notebook cells and/or execute the prepared cell.'];
    case 'record_execution':
      return ['Your next action should record the notebook execution outcome with execute_transformation_step.'];
    case 'validate':
      return ['Your next action should validate the executed step and decide whether approval is required.'];
    case 'commit':
      return ['Your next action should commit the validated step or checkpoint the dataset if appropriate.'];
    case 'await_approval':
      return ['The workflow is blocked on explicit user approval. Explain the pending decision and do not mutate state.'];
    default:
      return [];
  }
}

export function buildPreprocessingActionRequest(
  params: PreprocessingRequestParams,
  summary: PreprocessingRequestSummary
): LlmRequest {
  const tools = filterTools(summary.allowedTools);
  const userSections: string[] = [
    `Thread ID: ${summary.threadId}`,
    `Current controller node: ${summary.currentNode}`,
    `Turn mode: ${summary.turnMode}`,
    `Allowed tools: ${summary.allowedTools.join(', ') || '(none)'}`,
    `Active step: ${summary.activeStepId ?? '(none)'}`,
    summary.runId ? `Run ID: ${summary.runId}` : 'Run ID: (none)',
    summarizeDatasetForPrompt(params.dataset),
    params.projectPlan?.trim() ? `Project plan:\n${params.projectPlan}` : 'Project plan: (none)',
    params.ragSnippets?.length
      ? `RAG snippets:\n${params.ragSnippets.map((doc, index) => `${index + 1}. ${doc.filename}: ${doc.snippet}`).join('\n')}`
      : 'RAG snippets: (none)',
    params.toolResults?.length
      ? `Recent tool results: ${params.toolResults.map((result) => `${result.tool}: ${result.error ?? 'ok'}`).join(', ')}`
      : 'Recent tool results: (none)',
    params.prompt ? `User prompt: ${params.prompt}` : 'User prompt: Continue the current preprocessing workflow.'
  ];

  const systemSections = [
    'You are the preprocessing execution controller for an AutoML notebook workflow.',
    'This is an action-required turn. You must use tool calls. Do not end with plain markdown only.',
    `You are currently in the "${summary.currentNode}" state.`,
    'Only use tools from the allowed tool list for this state.',
    'Never invent, rename, shorten, or paraphrase a preprocessing runId.',
    summary.runId
      ? 'Reuse the exact Run ID shown in the prompt for preprocessing tools that accept runId.'
      : 'If the prompt shows "Run ID: (none)", omit runId from tool args and let the backend bind the preprocessing run automatically.',
    'If a preprocessing tool returns RUN_NOT_FOUND or RUN_PROJECT_MISMATCH for a runId, omit runId on the retry unless the prompt still shows a valid Run ID.',
    'Notebook code and tool execution are authoritative. The left timeline is derived from tool events only.',
    'If you need to inspect notebook state before acting, use read-only tools from the current allowed set.',
    'When a state is focused on a semantic lifecycle action, advance exactly one stage with the correct tool instead of skipping ahead.',
    'Use markdown text only if it accompanies a tool call in the same turn or if the controller is in summarize/answer mode.',
    ...buildNodeSpecificSystemSections(summary.currentNode)
  ];

  return {
    messages: [
      {
        role: 'system',
        content: systemSections.join('\n')
      },
      {
        role: 'user',
        content: userSections.join('\n\n')
      }
    ],
    temperature: 0.15,
    maxOutputTokens: 4096,
    tools: tools.length > 0 ? tools : undefined,
    toolChoice: summary.requireToolCall ? 'any' : 'auto',
    toolCallHistory: params.toolCallHistory,
    toolResultHistory: params.toolResultHistory,
    reasoningEffort: params.reasoningEffort,
    contextId: summary.threadId
  };
}
