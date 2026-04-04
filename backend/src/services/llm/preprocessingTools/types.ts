import { randomUUID } from 'node:crypto';

import type { DatasetRepository } from '../../../repositories/datasetRepository.js';
import type {
  PreprocessingCellBinding,
  PreprocessingRunRepository,
  PreprocessingRunState,
  StepState
} from '../../../repositories/preprocessingRunRepository.js';

export type ReasonCode =
  | 'RUN_NOT_FOUND'
  | 'RUN_PROJECT_MISMATCH'
  | 'RUN_HAS_INCOMPLETE_STEP'
  | 'MISSING_REQUIRED_ARG'
  | 'DATASET_NOT_FOUND'
  | 'CHECKPOINT_NOT_FOUND'
  | 'STEP_NOT_FOUND'
  | 'STEP_EXECUTE_REQUIRES_CODE'
  | 'STEP_VALIDATE_REQUIRES_SUCCESSFUL_EXECUTE'
  | 'STEP_APPLIED_REQUIRES_CELL_BINDINGS'
  | 'STEP_COMMIT_REQUIRES_EXECUTE_VALIDATE'
  | 'STEP_APPROVAL_REQUIRED'
  | 'STEP_APPROVAL_USER_REQUIRED'
  | 'STEP_RECONCILE_REQUIRES_DIVERGED'
  | 'STEP_RECONCILE_REQUIRES_BOUND_CELL'
  | 'REPLAY_TARGET_DATASET_REQUIRED'
  | 'REPLAY_INCOMPATIBLE_DATASET'
  | 'PROCESSED_DATASET_PERSIST_FAILED'
  | 'PROCESSED_DATASET_NOT_FOUND'
  | 'INVALID_OPERATION'
  | 'INTERNAL_ERROR';

export interface ToolEnvelope {
  runId: string;
  isError: boolean;
  reasonCode: ReasonCode | null;
  stepId?: string;
  checkpointId?: string;
  datasetId?: string;
  [key: string]: unknown;
}

export interface ReplayCompatibilityIssue {
  stepId: string;
  column: string;
  expectedType?: string;
  actualType?: string;
  issue: 'missing_column' | 'dtype_mismatch';
}

export interface StepDivergenceDetail {
  stepId: string;
  cellId: string;
  issue: 'missing_cell' | 'binding_mismatch' | 'code_hash_mismatch';
  expectedCodeHash?: string;
  actualCodeHash?: string;
}

export interface PreprocessingCellMetadataStore {
  apply(cellIds: string[], binding: PreprocessingCellBinding): Promise<void>;
}

export interface PreprocessingCellInspector {
  read(cellId: string): Promise<{
    cellId: string;
    notebookId?: string;
    content: string;
    metadata: Record<string, unknown>;
  } | undefined>;
}

export interface ToolContext {
  projectId: string;
  toolCallId: string | undefined;
  run: PreprocessingRunState;
  args: Record<string, unknown>;
  datasetRepository: DatasetRepository;
  runRepository: PreprocessingRunRepository;
  cellMetadataStore: PreprocessingCellMetadataStore;
  cellInspector: PreprocessingCellInspector;
}

export type ToolResult = { output?: unknown; error?: string };

export type ToolHandler = (ctx: ToolContext) => Promise<ToolResult>;

export type { DatasetRepository, PreprocessingRunRepository, PreprocessingRunState, StepState, PreprocessingCellBinding };

// Re-export randomUUID for use in handlers
export { randomUUID };
