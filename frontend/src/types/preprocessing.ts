export interface AvailableTable {
  datasetId: string;
  name: string;
  filename: string;
  sizeBytes: number;
  nRows?: number;
  nCols?: number;
  columns?: Array<{ name: string; dtype: string }>;
  previewRows?: Record<string, unknown>[];
}

export type TransformationStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'applied'
  | 'failed'
  | 'diverged';

export interface TransformationValidation {
  rowCountBefore?: number;
  rowCountAfter?: number;
  nullCountBefore?: number;
  nullCountAfter?: number;
  schemaDrift?: boolean;
  notes?: string;
}

export interface TransformationEvent {
  id: string;
  runId: string;
  stepId: string;
  toolName: string;
  title: string;
  status: TransformationStatus;
  rationale?: string;
  intentType?: string;
  code?: string;
  codeHash?: string;
  version?: number;
  cellIds: string[];
  validation?: TransformationValidation;
  requiresApproval: boolean;
  approvalDecision?: 'pending' | 'approved' | 'rejected';
  decisionReason?: string;
  output?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StepCellBinding {
  stepId: string;
  cellIds: string[];
  codeHash?: string;
  version?: number;
  lastSyncedAt: number;
}

export interface PreprocessingSnapshotStep {
  stepId: string;
  title: string;
  rationale?: string;
  intentType: string;
  status: TransformationStatus;
  approvalDecision?: 'pending' | 'approved' | 'rejected';
  decisionReason?: string;
  code?: string;
  codeHash?: string;
  version: number;
  cellIds: string[];
  validation?: TransformationValidation;
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PreprocessingRunSnapshot {
  runId: string;
  projectId: string;
  stateModel?: 'hybrid';
  activeDatasetId?: string;
  derivedDatasetIds: string[];
  steps: PreprocessingSnapshotStep[];
  checkpoints: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

export interface PreprocessingRunSummary {
  runId: string;
  projectId: string;
  activeDatasetId?: string;
  stepCount: number;
  eventCount: number;
  latestEventType?: string;
  latestEventAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PreprocessingTurnMode = 'answer_only' | 'action_required';

export type PreprocessingControllerNode =
  | 'answer'
  | 'plan_step'
  | 'generate_code'
  | 'write_code'
  | 'record_execution'
  | 'validate'
  | 'await_approval'
  | 'commit'
  | 'summarize';

export interface PreprocessingControllerSummary {
  threadId: string;
  runId?: string;
  turnMode: PreprocessingTurnMode;
  currentNode: PreprocessingControllerNode;
  allowedTools: string[];
  allowTextResponse: boolean;
  requireToolCall: boolean;
  pendingApproval: boolean;
  activeStepId?: string;
  classificationRationale?: string;
  updatedAt: string;
}

