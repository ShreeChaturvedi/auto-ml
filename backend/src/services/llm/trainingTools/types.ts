import type { ToolContext, ToolResult } from '../../workflows/phaseConfig.js';
import type { WorkflowRunState, WorkflowTurnRequest } from '../../workflows/types.js';

/**
 * Context passed to every training tool handler.
 */
export interface TrainingToolContext {
  projectId: string;
  toolCallId: string | undefined;
  args: Record<string, unknown>;
  datasetId?: string;
  notebookId?: string;
  run: WorkflowRunState;
  turn: WorkflowTurnRequest;
}

export type TrainingToolResult = ToolResult;

export type TrainingToolHandler = (ctx: TrainingToolContext) => Promise<TrainingToolResult>;

/**
 * Tracks the state of a single experiment within a training run.
 */
export interface ExperimentState {
  experimentId: string;
  experimentName: string;
  modelType: string;
  status: 'configured' | 'proposed' | 'training' | 'evaluated' | 'registered' | 'failed';
  metrics?: Record<string, unknown>;
  hyperparameters?: Record<string, unknown>;
  splitStrategy?: string;
  targetColumn?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert a PhaseConfig ToolContext into a TrainingToolContext.
 */
export function toTrainingToolContext(ctx: ToolContext): TrainingToolContext {
  return {
    projectId: ctx.projectId,
    toolCallId: ctx.toolCallId,
    args: ctx.args,
    datasetId: ctx.turn.datasetId,
    notebookId: ctx.turn.notebookId,
    run: ctx.run,
    turn: ctx.turn
  };
}

/**
 * Resolve experiment from run metadata. Shared by all handlers that
 * need an existing experiment.
 */
export function resolveExperiment(
  run: WorkflowRunState,
  args: Record<string, unknown>
): { experiment: Record<string, unknown>; experiments: Record<string, Record<string, unknown>> } | { error: string } {
  const experimentId = typeof args.experimentId === 'string' ? args.experimentId : undefined;
  if (!experimentId) {
    return { error: 'This operation requires experimentId.' };
  }
  const experiments = (run.metadata?.experiments as Record<string, Record<string, unknown>>) ?? {};
  const experiment = experiments[experimentId];
  if (!experiment) {
    return { error: `Experiment ${experimentId} not found. Call configure_experiment first.` };
  }
  return { experiment, experiments };
}
