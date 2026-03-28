import type { LlmClient, LlmToolDefinition } from '../llm/llmClient.js';

import type { WorkflowGraphState } from './graphState.js';
import type { WorkflowRunState, WorkflowTurnRequest } from './types.js';

// ---------------------------------------------------------------------------
// PhaseConfig — the single interface every workflow phase must implement.
// Phase-specific behavior is injected via PhaseConfig objects passed through
// LangGraph's `configurable` at invocation time.
// ---------------------------------------------------------------------------

export type PhaseType = WorkflowTurnRequest['phase'];

export interface PhaseContext {
  projectId: string;
  datasetId?: string;
  notebookId?: string;
  targetColumn?: string;
  featureSummary?: string;
  projectPlan?: string;
  ragSnippets?: string[];
  run: WorkflowRunState;
  turn: WorkflowTurnRequest;
}

export interface RuntimeContext {
  classificationResult?: string;
  currentNode?: string;
  [key: string]: unknown;
}

export interface ToolContext {
  projectId: string;
  toolCallId: string | undefined;
  run: WorkflowRunState;
  args: Record<string, unknown>;
  turn: WorkflowTurnRequest;
}

export interface ToolResult {
  output?: unknown;
  error?: string;
}

export interface LifecycleStageDefinition {
  name: string;
  label: string;
  order: number;
}

export interface StageConfig {
  name: string;
  mode: 'text' | 'action' | 'deterministic' | 'llm_delegated';
  allowedTools: LlmToolDefinition[];
  toolChoice: 'auto' | 'any' | 'required';
  requiresApproval: boolean;
  allowAssistantMessage: boolean;
  allowAskUser: boolean;
  allowRenderUi: boolean;
  allowPlanExit: boolean;
  requireToolCall: boolean;
  deterministicAction?: (state: WorkflowGraphState) => import('../../types/llm.js').ToolCall[] | Promise<import('../../types/llm.js').ToolCall[]>;
  delegatedAction?: (client: LlmClient, state: WorkflowGraphState) => Promise<import('../../types/llm.js').ToolCall[]>;
}

export interface PhaseConfig {
  phase: PhaseType;
  lifecycle: LifecycleStageDefinition[];

  /**
   * Optional per-phase override for the maximum number of times any single
   * tool can be invoked in one turn.  Falls back to MAX_SINGLE_TOOL_CALLS
   * from graphState.ts when undefined.
   */
  maxSingleToolCalls?: number;

  classifyTurn(
    messages: unknown[],
    context: PhaseContext
  ): Promise<'answer' | 'action'>;

  getStageConfig(
    stage: string,
    runtimeContext?: RuntimeContext
  ): StageConfig;

  buildSystemPrompt(context: PhaseContext): string;

  buildUserContext(context: PhaseContext): Array<{ type: string; text: string }>;

  resolveNextStage(
    current: string,
    toolResults: import('../../types/llm.js').ToolResult[]
  ): string | null;

  isPhaseSpecificTool(toolName: string): boolean;

  executePhaseSpecificTool(
    name: string,
    args: unknown,
    ctx: ToolContext
  ): Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// Phase registry — maps phase names to their PhaseConfig implementations.
// Populated at startup by each phase module calling registerPhaseConfig().
// ---------------------------------------------------------------------------

const phaseRegistry = new Map<PhaseType, PhaseConfig>();

export function registerPhaseConfig(config: PhaseConfig): void {
  phaseRegistry.set(config.phase, config);
}

export function getPhaseConfig(phase: PhaseType): PhaseConfig | undefined {
  return phaseRegistry.get(phase);
}

export function getAllPhaseConfigs(): ReadonlyMap<PhaseType, PhaseConfig> {
  return phaseRegistry;
}
