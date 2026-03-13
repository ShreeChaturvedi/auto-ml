export type PreprocessingAction = 
  | 'drop_columns'
  | 'impute_missing'
  | 'scale_features'
  | 'encode_categorical'
  | 'remove_outliers'
  | 'custom_python'
;

export interface PreprocessingStep {
  id: string;
  action: PreprocessingAction;
  title: string;
  description?: string;
  columns: string[];
  method?: string;
  params: Record<string, unknown>;
  reasoning: string;
  enabled: boolean;
  customCode?: string;
}

export interface PreprocessingQualitySummary {
  nRows: number;
  nCols: number;
  columnsWithMissing: number;
  missingCellPercentage: number;
}

export interface AnalyzePreprocessingResponse {
  assistantMessage: string;
  draftSteps: PreprocessingStep[];
  planName?: string;
  qualitySummary: PreprocessingQualitySummary;
}

export interface LlmToolActivity {
  id: string;
  name: string;
  args: Record<string, unknown>;
  response: Record<string, unknown>;
  status: 'applied' | 'failed';
}

export interface RefinePreprocessingRequest {
  projectId: string;
  datasetId: string;
  message: string;
  draftSteps: PreprocessingStep[];
  model?: string;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

export interface RefinePreprocessingResponse {
  assistantMessage: string;
  draftSteps: PreprocessingStep[];
  toolActivities?: LlmToolActivity[];
}

export interface ExecutePreprocessingRequest {
  projectId: string;
  datasetId: string;
  draftSteps: PreprocessingStep[];
  outputName?: string;
}

export interface ExecutePreprocessingResponse {
  datasetId: string;
  filename: string;
  tableName: string;
  executedStepCount: number;
}

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

export const PREPROCESSING_ACTION_LABELS: Record<string, string> = {
  drop_columns: 'Drop Columns',
  impute_missing: 'Impute Missing Values',
  scale_features: 'Scale Features',
  encode_categorical: 'Encode Categories',
  remove_outliers: 'Remove Outliers',
  custom_python: 'Custom Python Code'
};
