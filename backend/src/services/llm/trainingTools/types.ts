import type { WorkflowRunState, WorkflowTurnRequest } from '../../workflows/types.js';

/**
 * Context passed to every training tool handler.
 * Mirrors the ToolContext pattern from phaseConfig.ts but adds training-specific fields.
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

/**
 * Return type for training tool handlers.
 */
export interface TrainingToolResult {
  output?: unknown;
  error?: string;
}

/**
 * Handler function signature for training tools.
 */
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
