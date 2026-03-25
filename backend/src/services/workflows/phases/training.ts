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

const TEXT_STAGES = new Set(['answer', 'await_review', 'summarize']);
const APPROVAL_STAGES = new Set(['propose_model', 'await_review']);

// Maps each lifecycle stage to the training-specific tools permitted at that stage.
// Non-training tools (notebook, data discovery, ask_user, render_ui) are always
// available. Only training-semantic tools are gated so the model cannot, e.g.,
// call configure_experiment during the evaluate_results stage.
const STAGE_TOOL_ALLOWLIST: Record<string, Set<string>> = {
  answer: new Set(),
  configure_experiment: new Set(['configure_experiment']),
  propose_model: new Set(['propose_training_plan']),
  generate_code: new Set(),
  write_code: new Set(),
  execute_training: new Set(['execute_training']),
  evaluate_results: new Set(['evaluate_results']),
  await_review: new Set(),
  register_model: new Set(['register_model']),
  summarize: new Set(['compare_models'])
};

function buildStageConfig(stage: string): StageConfig {
  const isText = TEXT_STAGES.has(stage);
  const stageAllowlist = STAGE_TOOL_ALLOWLIST[stage];
  const allowedTools = stageAllowlist
    ? (LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[]).filter(
        (tool) => !TRAINING_TOOL_NAME_SET.has(tool.name) || stageAllowlist.has(tool.name)
      )
    : (LLM_TRAINING_LIFECYCLE_TOOLS as LlmToolDefinition[]);

  return {
    name: stage,
    mode: isText ? 'text' : 'action',
    allowedTools,
    toolChoice: 'auto',
    requiresApproval: APPROVAL_STAGES.has(stage),
    allowAssistantMessage: true,
    allowAskUser: isText,
    allowRenderUi: stage !== 'write_code',
    allowPlanExit: false,
    requireToolCall: false
  };
}

function resolveNextTrainingStage(
  current: string,
  toolResults: import('../../../types/llm.js').ToolResult[]
): string | null {
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
