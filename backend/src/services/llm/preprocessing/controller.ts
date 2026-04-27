import { randomUUID } from 'node:crypto';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type { DatasetProfile } from '../../../types/dataset.js';
import type { ToolResult } from '../../../types/llm.js';
import { splitPreprocessingUserCode } from '../../notebook/preprocessingExecutionContext.js';
import type {
  LlmClient,
  LlmRequest,
  LlmToolCallHistory,
  LlmToolResultHistory
} from '../llmClient.js';
import type { LlmReasoningEffort } from '../modelCatalog.js';

import {
  classifyControllerRoute,
  getControllerStageDefinition,
  getLatestRunId,
  getLatestStepId,
  getLatestToolOutcome,
  inferApprovalDecision,
  inferPendingApproval,
  type PreprocessingControllerNode
} from './controllerRouting.js';
import {
  buildPreprocessingActionRequest,
  buildPreprocessingAnswerRequest
} from './requestBuilder.js';
import {
  classifyPreprocessingTurn,
  type PreprocessingTurnMode
} from './turnClassification.js';

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
  persistedRunId?: string;
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


const ControllerAnnotation = Annotation.Root({
  threadId: Annotation<string>(),
  runId: Annotation<string | undefined>(),
  userPrompt: Annotation<string>(),
  turnMode: Annotation<PreprocessingTurnMode>(),
  classificationRationale: Annotation<string | undefined>(),
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
  hasPendingNotebookCells: Annotation<boolean>(),
  updatedAt: Annotation<string>()
});

type ControllerState = typeof ControllerAnnotation.State;

function nowIso(): string {
  return new Date().toISOString();
}

function hasPendingNotebookCells(toolResults?: ToolResult[]): boolean {
  if (!toolResults?.length) {
    return false;
  }

  let latestCode: string | undefined;
  let writeCellCount = 0;
  let runCellCount = 0;

  for (const result of toolResults) {
    if (result.tool === 'materialize_step_code') {
      const output = result.output && typeof result.output === 'object' && !Array.isArray(result.output)
        ? result.output as Record<string, unknown>
        : null;
      const step = output?.step && typeof output.step === 'object' && !Array.isArray(output.step)
        ? output.step as Record<string, unknown>
        : null;
      if (typeof step?.code === 'string' && step.code.trim()) {
        latestCode = step.code;
      }
    }

    if (result.tool === 'write_cell' || result.tool === 'edit_cell') {
      writeCellCount += 1;
    } else if (result.tool === 'run_cell') {
      runCellCount += 1;
    }
  }

  if (!latestCode) {
    return false;
  }

  const plannedCellCount = splitPreprocessingUserCode(latestCode).length;
  return plannedCellCount > 1 && writeCellCount >= runCellCount && runCellCount < plannedCellCount;
}


async function classifyTurnNode(
  state: ControllerState,
  deps: { client: LlmClient; dataset: DatasetProfile; projectPlan?: string }
): Promise<Partial<ControllerState>> {
  return classifyPreprocessingTurn({
    userPrompt: state.userPrompt
  }, deps);
}

function stageNode(
  node: PreprocessingControllerNode
): (state: ControllerState) => Partial<ControllerState> {
  return () => {
    const stage = getControllerStageDefinition(node);
    return {
      currentNode: node,
      allowedTools: stage.allowedTools,
      allowTextResponse: stage.allowTextResponse,
      requireToolCall: stage.requireToolCall,
      updatedAt: nowIso()
    };
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
    .addConditionalEdges('classify_turn', classifyControllerRoute)
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

function buildPendingApprovalSummary(
  params: ResolvePreprocessingControllerTurnParams,
  threadId: string,
  latestRunId: string | undefined,
  latestStepId: string | undefined
): PreprocessingControllerSummary {
  const approvalDecision = inferApprovalDecision(params.prompt);
  return {
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
}

export async function resolvePreprocessingControllerTurn(
  params: ResolvePreprocessingControllerTurnParams
): Promise<PreprocessingControllerDecision> {
  const threadId = params.threadId?.trim() || `prep-thread-${randomUUID()}`;
  const pendingApproval = inferPendingApproval(params.toolResults);
  const persistedRunId = params.persistedRunId?.trim() || undefined;
  const latestRunId = getLatestRunId(params.toolResults) ?? persistedRunId;
  const latestStepId = params.continuation ? getLatestStepId(params.toolResults) : undefined;
  const latestToolOutcome = params.continuation
    ? getLatestToolOutcome(params.toolResults)
    : {
        latestToolName: undefined,
        latestToolSucceeded: false,
        latestOutputStatus: undefined
      };

  if (pendingApproval) {
    const summary = buildPendingApprovalSummary(params, threadId, latestRunId, latestStepId);
    return {
      threadId,
      summary,
      request: buildPreprocessingActionRequest(params, summary)
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
    currentNode: 'plan_step',
    allowedTools: [],
    allowTextResponse: false,
    requireToolCall: true,
    pendingApproval,
    activeStepId: latestStepId,
    latestToolName: latestToolOutcome.latestToolName,
    latestToolSucceeded: latestToolOutcome.latestToolSucceeded,
    latestOutputStatus: latestToolOutcome.latestOutputStatus,
    hasPendingNotebookCells: hasPendingNotebookCells(params.toolResults),
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
      ? buildPreprocessingAnswerRequest(params)
      : buildPreprocessingActionRequest(params, summary)
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
