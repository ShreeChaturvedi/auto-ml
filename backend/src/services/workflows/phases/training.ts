import type { LlmToolDefinition } from '../../llm/llmClient.js';
import { TRAINING_LIFECYCLE_CONTRACT } from '../../llm/prompts/trainingContract.js';
import { LLM_TRAINING_LIFECYCLE_TOOLS } from '../../llm/tools/index.js';
import { TRAINING_TOOL_HANDLERS } from '../../llm/trainingTools/index.js';
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
// Training PhaseConfig — action-oriented phase that orchestrates model
// training through a structured lifecycle of experiment configuration,
// plan proposal, code generation, execution, evaluation, and registration.
// ---------------------------------------------------------------------------

const TRAINING_TOOL_NAMES = new Set([
  'configure_experiment',
  'propose_training_plan',
  'execute_training',
  'evaluate_results',
  'register_model',
  'compare_models'
]);

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

const STAGE_CONFIGS: Record<string, StageConfig> = {
  answer: {
    name: 'answer',
    mode: 'text',
    allowedTools: LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[],
    toolChoice: 'auto',
    requiresApproval: false,
    allowAssistantMessage: true,
    allowAskUser: true,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: false
  },
  configure_experiment: {
    name: 'configure_experiment',
    mode: 'action',
    allowedTools: LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[],
    toolChoice: 'auto',
    requiresApproval: false,
    allowAssistantMessage: true,
    allowAskUser: true,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: false
  },
  propose_model: {
    name: 'propose_model',
    mode: 'action',
    allowedTools: LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[],
    toolChoice: 'auto',
    requiresApproval: true,
    allowAssistantMessage: true,
    allowAskUser: true,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: false
  },
  generate_code: {
    name: 'generate_code',
    mode: 'action',
    allowedTools: LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[],
    toolChoice: 'auto',
    requiresApproval: false,
    allowAssistantMessage: true,
    allowAskUser: false,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: false
  },
  write_code: {
    name: 'write_code',
    mode: 'action',
    allowedTools: LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[],
    toolChoice: 'auto',
    requiresApproval: false,
    allowAssistantMessage: true,
    allowAskUser: false,
    allowRenderUi: false,
    allowPlanExit: false,
    requireToolCall: false
  },
  execute_training: {
    name: 'execute_training',
    mode: 'action',
    allowedTools: LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[],
    toolChoice: 'auto',
    requiresApproval: false,
    allowAssistantMessage: true,
    allowAskUser: false,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: false
  },
  evaluate_results: {
    name: 'evaluate_results',
    mode: 'action',
    allowedTools: LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[],
    toolChoice: 'auto',
    requiresApproval: false,
    allowAssistantMessage: true,
    allowAskUser: false,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: false
  },
  await_review: {
    name: 'await_review',
    mode: 'text',
    allowedTools: LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[],
    toolChoice: 'auto',
    requiresApproval: true,
    allowAssistantMessage: true,
    allowAskUser: true,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: false
  },
  register_model: {
    name: 'register_model',
    mode: 'action',
    allowedTools: LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[],
    toolChoice: 'auto',
    requiresApproval: false,
    allowAssistantMessage: true,
    allowAskUser: false,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: false
  },
  summarize: {
    name: 'summarize',
    mode: 'text',
    allowedTools: LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[],
    toolChoice: 'auto',
    requiresApproval: false,
    allowAssistantMessage: true,
    allowAskUser: false,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: false
  }
};

/** Ordered stage names for linear progression. */
const STAGE_ORDER = TRAINING_LIFECYCLE.map((stage) => stage.name);

/**
 * Resolve the next stage given the current stage and tool results.
 * Follows linear progression through the lifecycle.
 */
function resolveNextTrainingStage(
  current: string,
  toolResults: import('../../../types/llm.js').ToolResult[]
): string | null {
  // Check for training failure — revert to generate_code for repair
  const hasTrainingFailure = toolResults.some(
    (result) => result.tool === 'execute_training' && result.error
  );
  if (hasTrainingFailure && current === 'execute_training') {
    return 'generate_code';
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
    // Training is always action-oriented — the LLM drives tool-based workflows
    return 'action';
  },

  getStageConfig(stage: string, _runtimeContext?: RuntimeContext): StageConfig {
    void _runtimeContext;
    return STAGE_CONFIGS[stage] ?? STAGE_CONFIGS.answer;
  },

  buildSystemPrompt(): string {
    return TRAINING_LIFECYCLE_CONTRACT;
  },

  buildUserContext(): Array<{ type: string; text: string }> {
    // Context is built by the phase request builder (trainingWorkflow.ts)
    return [];
  },

  resolveNextStage(
    current: string,
    toolResults: import('../../../types/llm.js').ToolResult[]
  ): string | null {
    return resolveNextTrainingStage(current, toolResults);
  },

  isPhaseSpecificTool(toolName: string): boolean {
    return TRAINING_TOOL_NAMES.has(toolName);
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

    return handler({
      projectId: ctx.projectId,
      toolCallId: ctx.toolCallId,
      args: (args as Record<string, unknown>) ?? {},
      datasetId: ctx.turn.datasetId,
      notebookId: ctx.turn.notebookId,
      run: ctx.run,
      turn: ctx.turn
    });
  }
};

// Register at module load time (side-effect import pattern)
registerPhaseConfig(trainingPhaseConfig);
