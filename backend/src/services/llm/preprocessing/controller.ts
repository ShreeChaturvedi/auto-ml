import { randomUUID } from 'node:crypto';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';

import type { DatasetProfile } from '../../../types/dataset.js';
import type { ToolResult } from '../../../types/llm.js';
import type {
  LlmClient,
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

const TurnClassificationSchema = z.object({
  turnMode: z.enum(['answer_only', 'action_required']),
  rationale: z.string().optional()
});

export type PreprocessingTurnMode = z.infer<typeof TurnClassificationSchema>['turnMode'];

export type PreprocessingControllerNode =
  | 'answer'
  | 'plan_step'
  | 'generate_code'
  | 'write_code'
  | 'record_execution'
  | 'validate'
  | 'await_approval'
  | 'commit'
  | 'summarize';

export interface PreprocessingControllerSummary {
  threadId: string;
  runId?: string;
  turnMode: PreprocessingTurnMode;
  currentNode: PreprocessingControllerNode;
  allowedTools: string[];
  allowTextResponse: boolean;
  requireToolCall: boolean;
  pendingApproval: boolean;
  activeStepId?: string;
  classificationRationale?: string;
  updatedAt: string;
}

export interface PreprocessingControllerDecision {
  threadId: string;
  request: LlmRequest;
  summary: PreprocessingControllerSummary;
}

export interface ResolvePreprocessingControllerTurnParams {
  client: LlmClient;
  dataset: DatasetProfile;
  prompt?: string;
  continuation?: boolean;
  projectPlan?: string;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  toolResults?: ToolResult[];
  toolCallHistory?: LlmToolCallHistory[];
  toolResultHistory?: LlmToolResultHistory[];
  reasoningEffort?: LlmReasoningEffort;
  threadId?: string;
}

const READ_ONLY_CELL_TOOLS = new Set(['list_cells', 'read_cell']);
const NOTEBOOK_WRITE_TOOLS = new Set(['write_cell', 'edit_cell', 'run_cell']);
const ORCHESTRATION_TOOLS = new Map(PREPROCESSING_ORCHESTRATION_TOOLS.map((tool) => [tool.name, tool]));
const CELL_TOOLS = new Map(CELL_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));

const ControllerAnnotation = Annotation.Root({
  threadId: Annotation<string>(),
  runId: Annotation<string | undefined>(),
  userPrompt: Annotation<string>(),
  turnMode: Annotation<PreprocessingTurnMode>(),
  classificationRationale: Annotation<string | undefined>(),
  approvalDecisionIntent: Annotation<'approve' | 'reject' | undefined>(),
  currentNode: Annotation<PreprocessingControllerNode>(),
  allowedTools: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  allowTextResponse: Annotation<boolean>(),
  requireToolCall: Annotation<boolean>(),
  pendingApproval: Annotation<boolean>(),
  activeStepId: Annotation<string | undefined>(),
  latestToolName: Annotation<string | undefined>(),
  latestToolSucceeded: Annotation<boolean>(),
  latestOutputStatus: Annotation<string | undefined>(),
  updatedAt: Annotation<string>()
});

type ControllerState = typeof ControllerAnnotation.State;

function nowIso(): string {
  return new Date().toISOString();
}

function inferApprovalDecision(prompt?: string): 'approve' | 'reject' | null {
  const normalized = prompt?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (/\b(reject|decline|deny|do not apply|don't apply|skip it|cancel it)\b/.test(normalized)) {
    return 'reject';
  }

  if (/\b(approve|approved|accept|apply it|apply this|go ahead|proceed)\b/.test(normalized)) {
    return 'approve';
  }

  return null;
}

function inferPendingApproval(toolResults?: ToolResult[]): boolean {
  const latest = toolResults?.at(-1);
  if (!latest?.output || typeof latest.output !== 'object' || Array.isArray(latest.output)) {
    return false;
  }

  const output = latest.output as Record<string, unknown>;
  const step = output.step && typeof output.step === 'object' && !Array.isArray(output.step)
    ? output.step as Record<string, unknown>
    : null;
  const reasonCode = typeof output.reasonCode === 'string' ? output.reasonCode : undefined;
  const outputStatus = typeof output.status === 'string' ? output.status : undefined;
  const stepStatus = typeof step?.status === 'string' ? step.status : undefined;
  const status = outputStatus ?? stepStatus;
  return status === 'awaiting_approval'
    || reasonCode === 'STEP_APPROVAL_REQUIRED'
    || reasonCode === 'STEP_APPROVAL_USER_REQUIRED';
}

function getLatestRunId(toolResults?: ToolResult[]): string | undefined {
  for (let index = (toolResults?.length ?? 0) - 1; index >= 0; index -= 1) {
    const output = toolResults?.[index]?.output;
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      continue;
    }
    const runId = (output as Record<string, unknown>).runId;
    if (typeof runId === 'string' && runId.trim()) {
      return runId.trim();
    }
  }

  return undefined;
}

function getLatestStepId(toolResults?: ToolResult[]): string | undefined {
  for (let index = (toolResults?.length ?? 0) - 1; index >= 0; index -= 1) {
    const output = toolResults?.[index]?.output;
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      continue;
    }
    const outputRecord = output as Record<string, unknown>;
    if (typeof outputRecord.stepId === 'string' && outputRecord.stepId.trim()) {
      return outputRecord.stepId.trim();
    }
    const step = outputRecord.step;
    if (step && typeof step === 'object' && !Array.isArray(step)) {
      const stepId = (step as Record<string, unknown>).stepId;
      if (typeof stepId === 'string' && stepId.trim()) {
        return stepId.trim();
      }
    }
  }

  return undefined;
}

function getLatestToolOutcome(toolResults?: ToolResult[]) {
  const latest = toolResults?.at(-1);
  if (!latest) {
    return {
      latestToolName: undefined,
      latestToolSucceeded: false,
      latestOutputStatus: undefined
    };
  }

  const output = latest.output && typeof latest.output === 'object' && !Array.isArray(latest.output)
    ? latest.output as Record<string, unknown>
    : null;
  const step = output?.step && typeof output.step === 'object' && !Array.isArray(output.step)
    ? output.step as Record<string, unknown>
    : null;
  const outputStatus = typeof output?.status === 'string'
    ? output.status
    : typeof step?.status === 'string'
      ? step.status
      : undefined;
  const executionFailed = latest.tool === 'execute_transformation_step' && outputStatus === 'failed';
  const validationFailed = latest.tool === 'validate_step_result' && outputStatus === 'failed';

  return {
    latestToolName: latest.tool,
    latestToolSucceeded: !latest.error && !executionFailed && !validationFailed,
    latestOutputStatus: outputStatus
  };
}

function inferActionNode(state: ControllerState): PreprocessingControllerNode {
  if (state.pendingApproval && state.approvalDecisionIntent) {
    return 'commit';
  }

  if (state.pendingApproval) {
    return 'await_approval';
  }

  switch (state.latestToolName) {
    case 'propose_transformation_step':
      return state.latestToolSucceeded ? 'generate_code' : 'plan_step';
    case 'materialize_step_code':
      return state.latestToolSucceeded ? 'write_code' : 'generate_code';
    case 'write_cell':
    case 'edit_cell':
      return state.latestToolSucceeded ? 'write_code' : 'generate_code';
    case 'run_cell':
      return state.latestToolSucceeded ? 'record_execution' : 'write_code';
    case 'execute_transformation_step':
      return state.latestToolSucceeded ? 'validate' : 'write_code';
    case 'validate_step_result':
      if (state.pendingApproval || state.latestOutputStatus === 'awaiting_approval') {
        return 'await_approval';
      }
      return state.latestToolSucceeded ? 'commit' : 'validate';
    case 'commit_transformation_step':
      return state.latestToolSucceeded ? 'summarize' : 'commit';
    default:
      return 'plan_step';
  }
}

function classifyRoute(state: ControllerState): PreprocessingControllerNode {
  return state.turnMode === 'answer_only' ? 'answer' : inferActionNode(state);
}

function detectApprovalDecisionIntent(prompt: string): 'approve' | 'reject' | undefined {
  const normalizedPrompt = prompt.trim().toLowerCase();
  if (!normalizedPrompt || normalizedPrompt.includes('?')) {
    return undefined;
  }

  const rejectPatterns = [
    /\breject\b/,
    /\bdecline\b/,
    /\bcancel\b/,
    /\bskip\b/,
    /\bdon't apply\b/,
    /\bdo not apply\b/,
    /\bdon't commit\b/,
    /\bdo not commit\b/,
    /\bdon't proceed\b/,
    /\bdo not proceed\b/,
    /\bstop\b/
  ];
  if (rejectPatterns.some((pattern) => pattern.test(normalizedPrompt))) {
    return 'reject';
  }

  const approvePatterns = [
    /\bapprove\b/,
    /\bapply\b/,
    /\bcommit\b/,
    /\bproceed\b/,
    /\bgo ahead\b/,
    /\byes\b/,
    /\blooks good\b/,
    /\bship it\b/
  ];
  if (approvePatterns.some((pattern) => pattern.test(normalizedPrompt))) {
    return 'approve';
  }

  return undefined;
}

async function classifyTurnNode(
  state: ControllerState,
  deps: { client: LlmClient; dataset: DatasetProfile; projectPlan?: string }
): Promise<Partial<ControllerState>> {
  const approvalDecisionIntent = detectApprovalDecisionIntent(state.userPrompt);

  if (state.pendingApproval) {
    if (approvalDecisionIntent) {
      return {
        turnMode: 'action_required',
        approvalDecisionIntent,
        classificationRationale: 'The user provided an explicit approval decision for a pending preprocessing step.',
        updatedAt: nowIso()
      };
    }

    return {
      turnMode: 'action_required',
      approvalDecisionIntent: undefined,
      classificationRationale: 'A preprocessing step is awaiting explicit approval.',
      updatedAt: nowIso()
    };
  }

  if (state.userPrompt === '__tool_continuation__') {
    return {
      turnMode: 'action_required',
      approvalDecisionIntent: undefined,
      classificationRationale: 'This turn continues an active preprocessing workflow.',
      updatedAt: nowIso()
    };
  }

  const classificationRequest: LlmRequest = {
    messages: [
      {
        role: 'system',
        content: [
          'You are a strict preprocessing turn classifier.',
          'Classify the user turn as either answer_only or action_required.',
          'Use answer_only only when the user is asking for explanation, diagnosis, or advice and is not asking to change data, notebook cells, or preprocessing state.',
          'Use action_required when the user asks to modify preprocessing, inspect notebook/data state to determine an action, continue an in-progress workflow, or execute a transformation.',
          'Return JSON only with keys turnMode and rationale.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Dataset: ${deps.dataset.filename} (${deps.dataset.nRows} rows, ${deps.dataset.nCols} columns)`,
          deps.projectPlan?.trim() ? `Project plan:\n${deps.projectPlan}` : 'Project plan: (none)',
          `User prompt: ${state.userPrompt || 'Continue the current preprocessing workflow.'}`
        ].join('\n\n')
      }
    ],
    responseMimeType: 'application/json',
    maxOutputTokens: 300,
    reasoningEffort: 'low'
  };

  try {
    const raw = await deps.client.complete(classificationRequest);
    const parsed = TurnClassificationSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return {
        turnMode: parsed.data.turnMode,
        approvalDecisionIntent: undefined,
        classificationRationale: parsed.data.rationale,
        updatedAt: nowIso()
      };
    }
  } catch {
    // Fall through to the safer action-required default.
  }

  return {
    turnMode: 'action_required',
    approvalDecisionIntent: undefined,
    classificationRationale: 'Classification fallback defaulted to action_required for safety.',
    updatedAt: nowIso()
  };
}

function stageNode(
  node: PreprocessingControllerNode
): (state: ControllerState) => Partial<ControllerState> {
  return () => {
    switch (node) {
      case 'answer':
        return {
          currentNode: node,
          allowedTools: [],
          allowTextResponse: true,
          requireToolCall: false,
          updatedAt: nowIso()
        };
      case 'plan_step':
        return {
          currentNode: node,
          allowedTools: [
            'profile_active_dataset',
            'list_cells',
            'read_cell',
            'propose_transformation_step'
          ],
          allowTextResponse: false,
          requireToolCall: true,
          updatedAt: nowIso()
        };
      case 'generate_code':
        return {
          currentNode: node,
          allowedTools: [
            'materialize_step_code'
          ],
          allowTextResponse: false,
          requireToolCall: true,
          updatedAt: nowIso()
        };
      case 'write_code':
        return {
          currentNode: node,
          allowedTools: [
            'write_cell',
            'edit_cell',
            'run_cell',
            'list_cells',
            'read_cell'
          ],
          allowTextResponse: false,
          requireToolCall: true,
          updatedAt: nowIso()
        };
      case 'record_execution':
        return {
          currentNode: node,
          allowedTools: [
            'execute_transformation_step',
            'list_cells',
            'read_cell'
          ],
          allowTextResponse: false,
          requireToolCall: true,
          updatedAt: nowIso()
        };
      case 'validate':
        return {
          currentNode: node,
          allowedTools: [
            'validate_step_result',
            'profile_active_dataset',
            'read_cell'
          ],
          allowTextResponse: false,
          requireToolCall: true,
          updatedAt: nowIso()
        };
      case 'await_approval':
        return {
          currentNode: node,
          allowedTools: [],
          allowTextResponse: true,
          requireToolCall: false,
          updatedAt: nowIso()
        };
      case 'commit':
        return {
          currentNode: node,
          allowedTools: [
            'commit_transformation_step',
            'checkpoint_dataset'
          ],
          allowTextResponse: false,
          requireToolCall: true,
          updatedAt: nowIso()
        };
      case 'summarize':
        return {
          currentNode: node,
          allowedTools: [],
          allowTextResponse: true,
          requireToolCall: false,
          updatedAt: nowIso()
        };
      default:
        return {
          currentNode: node,
          allowedTools: [],
          allowTextResponse: true,
          requireToolCall: false,
          updatedAt: nowIso()
        };
    }
  };
}

function buildControllerGraph(deps: { client: LlmClient; dataset: DatasetProfile; projectPlan?: string }) {
  return new StateGraph(ControllerAnnotation)
    .addNode('classify_turn', (state: ControllerState) => classifyTurnNode(state, deps))
    .addNode('answer', stageNode('answer'))
    .addNode('plan_step', stageNode('plan_step'))
    .addNode('generate_code', stageNode('generate_code'))
    .addNode('write_code', stageNode('write_code'))
    .addNode('record_execution', stageNode('record_execution'))
    .addNode('validate', stageNode('validate'))
    .addNode('await_approval', stageNode('await_approval'))
    .addNode('commit', stageNode('commit'))
    .addNode('summarize', stageNode('summarize'))
    .addEdge(START, 'classify_turn')
    .addConditionalEdges('classify_turn', classifyRoute)
    .addEdge('answer', END)
    .addEdge('plan_step', END)
    .addEdge('generate_code', END)
    .addEdge('write_code', END)
    .addEdge('record_execution', END)
    .addEdge('validate', END)
    .addEdge('await_approval', END)
    .addEdge('commit', END)
    .addEdge('summarize', END)
    .compile({
      name: 'preprocessing-turn-controller'
    });
}

function summarizeDatasetForPrompt(dataset: DatasetProfile): string {
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

function buildAnswerRequest(params: ResolvePreprocessingControllerTurnParams): LlmRequest {
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

function buildActionRequest(
  params: ResolvePreprocessingControllerTurnParams,
  summary: PreprocessingControllerSummary
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
    'Notebook code and tool execution are authoritative. The left timeline is derived from tool events only.',
    'If you need to inspect notebook state before acting, use read-only tools from the current allowed set.',
    'When a state is focused on a semantic lifecycle action, advance exactly one stage with the correct tool instead of skipping ahead.',
    'Use markdown text only if it accompanies a tool call in the same turn or if the controller is in summarize/answer mode.'
  ];

  if (summary.currentNode === 'plan_step') {
    systemSections.push(
      'Your next action should establish context or propose exactly one transformation step.',
      'IMPORTANT: Do not profile the same dataset more than once. After a single profile_active_dataset call, proceed directly to propose_transformation_step.',
      'Batch your understanding from one profile call — do not call profile_active_dataset repeatedly.'
    );
  }
  if (summary.currentNode === 'generate_code') {
    systemSections.push(
      'Your next action should materialize executable code for the current step.'
    );
  }
  if (summary.currentNode === 'write_code') {
    systemSections.push(
      'Your next action should bind code to notebook cells and/or execute the prepared cell.'
    );
  }
  if (summary.currentNode === 'record_execution') {
    systemSections.push(
      'Your next action should record the notebook execution outcome with execute_transformation_step.'
    );
  }
  if (summary.currentNode === 'validate') {
    systemSections.push(
      'Your next action should validate the executed step and decide whether approval is required.'
    );
  }
  if (summary.currentNode === 'commit') {
    systemSections.push(
      'Your next action should commit the validated step or checkpoint the dataset if appropriate.'
    );
  }
  if (summary.currentNode === 'await_approval') {
    systemSections.push(
      'The workflow is blocked on explicit user approval. Explain the pending decision and do not mutate state.'
    );
  }

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

export async function resolvePreprocessingControllerTurn(
  params: ResolvePreprocessingControllerTurnParams
): Promise<PreprocessingControllerDecision> {
  const threadId = params.threadId?.trim() || `prep-thread-${randomUUID()}`;
  const pendingApproval = inferPendingApproval(params.toolResults);
  const approvalDecision = inferApprovalDecision(params.prompt);
  const latestRunId = getLatestRunId(params.toolResults);
  const latestStepId = params.continuation ? getLatestStepId(params.toolResults) : undefined;
  const latestToolOutcome = params.continuation
    ? getLatestToolOutcome(params.toolResults)
    : {
        latestToolName: undefined,
        latestToolSucceeded: false,
        latestOutputStatus: undefined
      };

  if (pendingApproval) {
    const summary: PreprocessingControllerSummary = {
      threadId,
      runId: latestRunId,
      turnMode: 'action_required',
      currentNode: approvalDecision ? 'commit' : 'await_approval',
      allowedTools: approvalDecision ? ['commit_transformation_step', 'checkpoint_dataset'] : [],
      allowTextResponse: !approvalDecision,
      requireToolCall: Boolean(approvalDecision),
      pendingApproval: true,
      activeStepId: latestStepId,
      classificationRationale: approvalDecision
        ? 'The user provided an explicit approval decision for the pending preprocessing step.'
        : 'A preprocessing step is awaiting explicit approval.',
      updatedAt: nowIso()
    };

    return {
      threadId,
      summary,
      request: buildActionRequest(params, summary)
    };
  }

  const controllerGraph = buildControllerGraph({
    client: params.client,
    dataset: params.dataset,
    projectPlan: params.projectPlan
  });

  const nextState = await controllerGraph.invoke({
    threadId,
    runId: latestRunId,
    userPrompt: params.continuation
      ? '__tool_continuation__'
      : params.prompt?.trim() || 'Continue preprocessing.',
    turnMode: 'action_required',
    classificationRationale: undefined,
    approvalDecisionIntent: undefined,
    currentNode: 'plan_step',
    allowedTools: [],
    allowTextResponse: false,
    requireToolCall: true,
    pendingApproval,
    activeStepId: latestStepId,
    latestToolName: latestToolOutcome.latestToolName,
    latestToolSucceeded: latestToolOutcome.latestToolSucceeded,
    latestOutputStatus: latestToolOutcome.latestOutputStatus,
    updatedAt: nowIso()
  }) as ControllerState;

  const summary: PreprocessingControllerSummary = {
    threadId,
    runId: nextState.runId,
    turnMode: nextState.turnMode,
    currentNode: nextState.currentNode,
    allowedTools: nextState.allowedTools,
    allowTextResponse: nextState.allowTextResponse,
    requireToolCall: nextState.requireToolCall,
    pendingApproval: nextState.pendingApproval,
    activeStepId: nextState.activeStepId,
    classificationRationale: nextState.classificationRationale,
    updatedAt: nextState.updatedAt
  };

  return {
    threadId,
    summary,
    request: summary.turnMode === 'answer_only'
      ? buildAnswerRequest(params)
      : buildActionRequest(params, summary)
  };
}

export function isAnswerOnlyControllerTurn(summary: PreprocessingControllerSummary): boolean {
  return summary.turnMode === 'answer_only' || !summary.requireToolCall;
}

export function isReadOnlyControllerTool(toolName: string): boolean {
  return READ_ONLY_CELL_TOOLS.has(toolName);
}

export function isNotebookWriteControllerTool(toolName: string): boolean {
  return NOTEBOOK_WRITE_TOOLS.has(toolName);
}
