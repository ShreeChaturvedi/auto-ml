import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';

import type { ToolResult } from '../../types/llm.js';
import { AskUserPayloadSchema, PlanExitPayloadSchema, ToolCallSchema } from '../../types/llm.js';
import { UiSchema } from '../../types/llmUi.js';
import type { LlmRequest } from '../llm/llmClient.js';

import type { WorkflowRunState, WorkflowTurnRequest } from './types.js';

// Per-turn iteration budget. The budget has to fit the heaviest legitimate
// workflow path, which is multi-feature implementation in feature_engineering:
//
//   For each selected feature (up to 5):
//     materialize_feature_code, write_cell (dataset load), run_cell,
//     write_cell (feature code), run_cell, execute_feature, validate_feature,
//     register_feature  = 8 tool calls
//   + 1 checkpoint_feature_pipeline at the end
//   + headroom for error retries (register-before-validate recovery etc.)
//
// 5 × 8 + 1 + headroom = ~48. Preprocessing turns typically use 10-12 and
// training uses fewer, so the shared cap doesn't penalize them.
//
// Previously 24, which caused MAX_ITERATIONS_EXCEEDED for 3-feature FE runs
// because 3 × 8 = 24 exactly hit the cap before the final checkpoint call.
export const MAX_WORKFLOW_ITERATIONS = 48;

// Cap how many times any single tool can be called in one turn.
// Prevents the LLM from looping on a stage (e.g. configure_experiment)
// without progressing through the workflow lifecycle.
// Default raised from 5 → 10 to support complex multi-step phases like
// feature engineering (propose_feature×6+) and preprocessing code retries.
export const MAX_SINGLE_TOOL_CALLS = 10;

// Stricter limit for *identical* calls (same tool + same arguments).
// When the model passes the exact same arguments repeatedly it is truly stuck,
// not iterating toward a fix.  This catches stuck loops earlier than the raw
// count check.
export const MAX_IDENTICAL_TOOL_CALLS = 5;

// Budget for LangGraph's internal step counter. The graph cycles
// `prepare → invoke_model → execute_tools` (3 hops per iteration) plus
// pause/terminal nodes, and `modelTurnCollector` can cycle
// `prepare → invoke_model → prepare` for deterministic/delegated stage hops
// without incrementing `state.iteration`. The previous `*3 + 8 = 152` budget
// assumed exactly one hop per node per iteration and blew up on messy-data
// preprocessing turns where the LLM legitimately needs more stage hops to
// converge. `*5 + 16 = 256` keeps the iteration cap (48) as the authoritative
// stop condition while leaving headroom for extra stage cycles. Issue #340.
export const WORKFLOW_GRAPH_RECURSION_LIMIT = MAX_WORKFLOW_ITERATIONS * 5 + 16;

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
  // Number of tool calls carried over from previous turns — the per-turn
  // limit checker skips these so only THIS turn's calls are counted.
  turnStartToolCallCount: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0
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
