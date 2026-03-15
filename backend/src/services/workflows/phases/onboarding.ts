import type { LlmToolDefinition } from '../../llm/llmClient.js';
import { LLM_ONBOARDING_TOOLS } from '../../llm/toolRegistry.js';
import type {
  LifecycleStageDefinition,
  PhaseConfig,
  RuntimeContext,
  StageConfig,
  ToolContext,
  ToolResult
} from '../phaseConfig.js';

// ---------------------------------------------------------------------------
// Onboarding PhaseConfig — simple conversational phase that uses ask_user and
// plan_exit tools. Always in 'text' mode (streams via LLM, no planner).
// No phase-specific tools — all tools are MCP/global tools.
// ---------------------------------------------------------------------------

const ONBOARDING_LIFECYCLE: LifecycleStageDefinition[] = [
  { name: 'converse', label: 'Onboarding', order: 0 }
];

const ONBOARDING_STAGE_CONFIG: StageConfig = {
  name: 'converse',
  mode: 'text',
  allowedTools: LLM_ONBOARDING_TOOLS as LlmToolDefinition[],
  toolChoice: 'auto',
  requiresApproval: false,
  allowAssistantMessage: true,
  allowAskUser: true,
  allowRenderUi: false,
  allowPlanExit: true,
  requireToolCall: false
};

export const onboardingPhaseConfig: PhaseConfig = {
  phase: 'onboarding',
  lifecycle: ONBOARDING_LIFECYCLE,

  async classifyTurn(): Promise<'answer' | 'action'> {
    // Onboarding is always text-mode streaming — no action planning
    return 'answer';
  },

  getStageConfig(_stage: string, _runtimeContext?: RuntimeContext): StageConfig {
    void _stage;
    void _runtimeContext;
    return ONBOARDING_STAGE_CONFIG;
  },

  buildSystemPrompt(): string {
    // System prompt is built by buildOnboardingRequest in prompts/toolUsage.ts
    return '';
  },

  buildUserContext(): Array<{ type: string; text: string }> {
    return [];
  },

  resolveNextStage(): string | null {
    // Onboarding stays in 'converse' stage
    return null;
  },

  isPhaseSpecificTool(): boolean {
    // Onboarding has no phase-specific tools — all tools are MCP tools
    return false;
  },

  async executePhaseSpecificTool(
    _name: string,
    _args: unknown,
    _ctx: ToolContext
  ): Promise<ToolResult> {
    void _name;
    void _args;
    void _ctx;
    return { error: 'Onboarding has no phase-specific tools.' };
  }
};
