import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';

import type { ToolResult } from '../../types/llm.js';
import { AskUserPayloadSchema, PlanExitPayloadSchema, ToolCallSchema } from '../../types/llm.js';
import { UiSchema } from '../../types/llmUi.js';
import type { LlmRequest } from '../llm/llmClient.js';

import type { WorkflowRunState, WorkflowTurnRequest } from './types.js';

// A full preprocessing turn can legitimately span inspection, planning, code
// authoring, notebook execution, execution recording, validation, and commit.
// Each stage uses 1-2 iterations, and the model may profile datasets before
// planning. Budget: ~3 profile + 1 plan + 1 code-gen + 2 write/exec + 1 validate
// + 1 commit + 1 summarize ≈ 10-12 on the happy path, with headroom for retries.
export const MAX_WORKFLOW_ITERATIONS = 24;
export const WORKFLOW_GRAPH_RECURSION_LIMIT = MAX_WORKFLOW_ITERATIONS * 3 + 8;

export const InternalWorkflowState = Annotation.Root({
  turn: Annotation<WorkflowTurnRequest>(),
  run: Annotation<WorkflowRunState>(),
  request: Annotation<LlmRequest | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  latestMessage: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => ''
  }),
  pendingToolCalls: Annotation<z.infer<typeof ToolCallSchema>[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  toolCallHistory: Annotation<z.infer<typeof ToolCallSchema>[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => []
  }),
  toolResultHistory: Annotation<ToolResult[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => []
  }),
  askUserPayload: Annotation<z.infer<typeof AskUserPayloadSchema> | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  planExitPayload: Annotation<z.infer<typeof PlanExitPayloadSchema> | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  uiPayload: Annotation<z.infer<typeof UiSchema> | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  controllerSummary: Annotation<Record<string, unknown> | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  iteration: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0
  }),
  nextStep: Annotation<'prepare' | 'invoke_model' | 'execute_tools' | 'pause' | 'complete' | 'fail'>({
    reducer: (_left, right) => right,
    default: () => 'invoke_model'
  }),
  pendingInputKind: Annotation<WorkflowRunState['pendingInputKind'] | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  pauseReason: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  errorMessage: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  errorCode: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null
  })
});

export type WorkflowGraphState = typeof InternalWorkflowState.State;
