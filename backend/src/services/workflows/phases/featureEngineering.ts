import { asRecord } from '../../../utils/typeCoercion.js';
import {
  FEATURE_TOOL_HANDLERS,
  toFeatureToolContext
} from '../../llm/featureTools/index.js';
import type { LlmToolDefinition } from '../../llm/llmClient.js';
import { FEATURE_ENGINEERING_CONTRACT } from '../../llm/prompts/featureContract.js';
import { FEATURE_TOOL_NAMES } from '../../llm/tools/featureTools.js';
import { LLM_FEATURE_LIFECYCLE_TOOLS } from '../../llm/tools/index.js';
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
// Feature Engineering PhaseConfig — structured lifecycle phase that uses
// the planner to drive propose -> materialize -> execute -> validate ->
// register -> checkpoint stages.  Always in 'action' mode.
// ---------------------------------------------------------------------------

const FEATURE_ENGINEERING_LIFECYCLE: LifecycleStageDefinition[] = [
  { name: 'answer', label: 'Answer', order: 0 },
  { name: 'analyze_data', label: 'Analyze Data', order: 1 },
  { name: 'propose_feature', label: 'Propose Feature', order: 2 },
  { name: 'generate_code', label: 'Generate Code', order: 3 },
  { name: 'write_code', label: 'Write Code', order: 4 },
  { name: 'execute_feature', label: 'Execute Feature', order: 5 },
  { name: 'validate_feature', label: 'Validate Feature', order: 6 },
  { name: 'await_review', label: 'Await Review', order: 7 },
  { name: 'register_feature', label: 'Register Feature', order: 8 },
  { name: 'summarize', label: 'Summarize', order: 9 }
];

const STAGE_NAMES = FEATURE_ENGINEERING_LIFECYCLE.map((s) => s.name);
const FEATURE_TOOL_NAME_SET: Set<string> = new Set(FEATURE_TOOL_NAMES);

function buildStageConfig(
  stageName: string,
  tools: LlmToolDefinition[]
): StageConfig {
  const isReview = stageName === 'await_review';
  return {
    name: stageName,
    mode: 'action',
    allowedTools: tools,
    toolChoice: 'auto',
    requiresApproval: isReview,
    allowAssistantMessage: true,
    allowAskUser: true,
    allowRenderUi: true,
    allowPlanExit: false,
    requireToolCall: !isReview
  };
}

export const featureEngineeringPhaseConfig: PhaseConfig = {
  phase: 'feature_engineering',
  lifecycle: FEATURE_ENGINEERING_LIFECYCLE,

  async classifyTurn(): Promise<'answer' | 'action'> {
    // Feature engineering always uses the planner
    return 'action';
  },

  getStageConfig(stage: string, _runtimeContext?: RuntimeContext): StageConfig {
    void _runtimeContext;
    return buildStageConfig(stage, LLM_FEATURE_LIFECYCLE_TOOLS as LlmToolDefinition[]);
  },

  buildSystemPrompt(): string {
    return FEATURE_ENGINEERING_CONTRACT;
  },

  buildUserContext(): Array<{ type: string; text: string }> {
    // Context is built by phaseRequestBuilder for feature_engineering
    return [];
  },

  resolveNextStage(current: string): string | null {
    const idx = STAGE_NAMES.indexOf(current);
    if (idx < 0 || idx >= STAGE_NAMES.length - 1) {
      return null;
    }
    return STAGE_NAMES[idx + 1];
  },

  isPhaseSpecificTool(toolName: string): boolean {
    return FEATURE_TOOL_NAME_SET.has(toolName);
  },

  async executePhaseSpecificTool(
    name: string,
    args: unknown,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const handler = FEATURE_TOOL_HANDLERS.get(name);
    if (!handler) {
      return { error: `Unknown feature tool: ${name}` };
    }

    const featureCtx = toFeatureToolContext({
      ...ctx,
      args: asRecord(args) ?? {}
    });

    return handler(featureCtx);
  }
};

// Register at module load time (side-effect import pattern)
registerPhaseConfig(featureEngineeringPhaseConfig);
