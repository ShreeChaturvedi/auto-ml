import { asRecord } from '../../../utils/typeCoercion.js';
import type { LlmToolDefinition } from '../../llm/llmClient.js';
import { TRAINING_LIFECYCLE_CONTRACT } from '../../llm/prompts/trainingContract.js';
import { LLM_TRAINING_LIFECYCLE_TOOLS } from '../../llm/tools/index.js';
import { TRAINING_TOOL_NAMES } from '../../llm/tools/trainingTools.js';
import { TRAINING_TOOL_HANDLERS } from '../../llm/trainingTools/index.js';
import { toTrainingToolContext } from '../../llm/trainingTools/types.js';
import type {
  LifecycleStageDefinition,
  PhaseConfig,
  RuntimeContext,
  StageConfig,
  ToolContext,
  ToolResult
} from '../phaseConfig.js';
import { registerPhaseConfig } from '../phaseConfig.js';

// ---------------------------------------------------------------------------
// Training PhaseConfig
// ---------------------------------------------------------------------------

const TRAINING_TOOL_NAME_SET: Set<string> = new Set(TRAINING_TOOL_NAMES);

const TRAINING_LIFECYCLE: LifecycleStageDefinition[] = [
  { name: 'answer', label: 'Answer', order: 0 },
  { name: 'configure_experiment', label: 'Configure Experiment', order: 1 },
  { name: 'propose_model', label: 'Propose Model', order: 2 },
  { name: 'generate_code', label: 'Generate Code', order: 3 },
  { name: 'write_code', label: 'Write Code', order: 4 },
  { name: 'execute_training', label: 'Execute Training', order: 5 },
  { name: 'evaluate_results', label: 'Evaluate Results', order: 6 },
  { name: 'await_review', label: 'Await Review', order: 7 },
  { name: 'register_model', label: 'Register Model', order: 8 },
  { name: 'summarize', label: 'Summarize', order: 9 }
];

const STAGE_ORDER = TRAINING_LIFECYCLE.map((s) => s.name);

const APPROVAL_STAGES = new Set(['propose_model', 'await_review']);

// ALL training stages now use mode='text' which routes to streamWorkflowText
// (the same reliable streaming path Feature Engineering uses) instead of
// mode='action' (the planner path). The planner is a low-reasoning-effort
// JSON-output LLM call that repeatedly fails with:
//  - "Response did not contain valid JSON" (can't produce JSON reliably)
//  - Missing required fields in render_ui/tool_call payloads (Zod rejection)
//  - Wrong tool args (experimentId hallucinated from threadId or omitted)
//  - Notebook tool preference over lifecycle tools (no amount of forced-stage
//    gating fixes this because the planner's context is too compressed)
//
// streamWorkflowText uses the MAIN LLM (gpt-5.4) with the full training
// contract, dataset context, tool definitions, and tool call/result history.
// The LLM calls tools directly in its streaming output — configure_experiment,
// write_cell, run_cell, execute_training, etc. — exactly like FE does with
// propose_feature, materialize_feature_code, etc. The contract guides the
// lifecycle sequence; no planner intermediary needed.

function buildStageConfig(stage: string): StageConfig {
  return {
    name: stage,
    mode: 'text',
    allowedTools: LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[],
    toolChoice: 'auto',
    requiresApproval: APPROVAL_STAGES.has(stage),
    allowAssistantMessage: true,
    allowAskUser: true,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: false
  };
}

function isSuccessfulRunCell(result: import('../../../types/llm.js').ToolResult): boolean {
  if (result.tool !== 'run_cell' || result.error) return false;
  if (!result.output || typeof result.output !== 'object' || Array.isArray(result.output)) return false;
  return (result.output as Record<string, unknown>).status === 'success';
}

function resolveNextTrainingStage(
  current: string,
  toolResults: import('../../../types/llm.js').ToolResult[]
): string | null {
  // Fix 2 — widen execute_training failure detection. The handler at
  // executionTools.ts:79-88 returns { output: { status: 'failed' } } with
  // result.error = null when the LLM calls execute_training(succeeded: false).
  // The old check only matched result.error, so the loop-back to generate_code
  // never triggered on LLM-reported failures.
  const hasTrainingFailure = toolResults.some((result) => {
    if (result.tool !== 'execute_training') return false;
    if (result.error) return true;
    if (result.output && typeof result.output === 'object' && !Array.isArray(result.output)) {
      return (result.output as Record<string, unknown>).status === 'failed';
    }
    return false;
  });
  if (hasTrainingFailure && current === 'execute_training') {
    return 'generate_code';
  }

  // Fix 1 — gate write_code → execute_training on a successful run_cell.
  // Without this, the stage advances after one iteration regardless of
  // whether the LLM actually ran the training code. At the forced
  // execute_training stage, run_cell is blocked (Path A), so the LLM
  // would call execute_training(succeeded: false) — producing a "trained"
  // model that was never actually trained. Stay at write_code until the
  // tool history contains evidence that a cell ran successfully.
  //
  // An early run_cell from generate_code stage also satisfies this gate
  // (toolResultHistory is cumulative), which is correct — if the code was
  // already written and run at generate_code, skipping write_code is fine.
  //
  // If the LLM never calls run_cell, MAX_WORKFLOW_ITERATIONS (48) in
  // graphState.ts terminates the workflow with ITERATIONS_EXCEEDED, which
  // is the right failure mode — not a silently fake "registered" model.
  if (current === 'write_code') {
    const hasSuccessfulRun = toolResults.some(isSuccessfulRunCell);
    if (!hasSuccessfulRun) {
      return current; // Stay at write_code
    }
  }

  const currentIndex = STAGE_ORDER.indexOf(current);
  if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) {
    return null;
  }
  return STAGE_ORDER[currentIndex + 1];
}

export const trainingPhaseConfig: PhaseConfig = {
  phase: 'training',
  lifecycle: TRAINING_LIFECYCLE,

  async classifyTurn(): Promise<'answer' | 'action'> {
    return 'action';
  },

  getStageConfig(stage: string, _runtimeContext?: RuntimeContext): StageConfig {
    void _runtimeContext;
    return buildStageConfig(stage);
  },

  buildSystemPrompt(): string {
    return TRAINING_LIFECYCLE_CONTRACT;
  },

  buildUserContext(): Array<{ type: string; text: string }> {
    return [];
  },

  resolveNextStage(
    current: string,
    toolResults: import('../../../types/llm.js').ToolResult[]
  ): string | null {
    return resolveNextTrainingStage(current, toolResults);
  },

  isPhaseSpecificTool(toolName: string): boolean {
    return TRAINING_TOOL_NAME_SET.has(toolName);
  },

  async executePhaseSpecificTool(
    name: string,
    args: unknown,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const handler = TRAINING_TOOL_HANDLERS.get(name);
    if (!handler) {
      return { error: `Unknown training tool: ${name}` };
    }

    return handler(toTrainingToolContext({
      ...ctx,
      args: asRecord(args) ?? {}
    }));
  }
};

registerPhaseConfig(trainingPhaseConfig);
