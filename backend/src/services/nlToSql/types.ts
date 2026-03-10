import { z } from 'zod';

export type WarningLevel = 'none' | 'low' | 'medium' | 'high';
export type NlConfidenceMode = 'model' | 'repair';
export type NlReliabilityTier = 'high' | 'medium' | 'low';
export type NlProgressPhaseId =
  | 'schema_context'
  | 'planning'
  | 'sql_generation'
  | 'validation'
  | 'initial_execution'
  | 'repair'
  | 'done';
export type NlProgressStatus = 'started' | 'progress' | 'completed' | 'failed';

export interface NlProgressEvent {
  phaseId: NlProgressPhaseId;
  status: NlProgressStatus;
  summary: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export type NlModelWorkKind =
  | 'thinking'
  | 'plan'
  | 'tool'
  | 'sql'
  | 'validation'
  | 'repair'
  | 'status';

interface NlModelWorkEventBase {
  blockId: string;
  phaseId: NlProgressPhaseId;
  kind: NlModelWorkKind;
  title: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface NlModelWorkBlockStartedEvent extends NlModelWorkEventBase {
  type: 'model_work_block_started';
}

export interface NlModelWorkDeltaEvent extends NlModelWorkEventBase {
  type: 'model_work_delta';
  delta: string;
}

export interface NlModelWorkBlockCompletedEvent extends NlModelWorkEventBase {
  type: 'model_work_block_completed';
  status?: 'completed' | 'failed';
}

export type NlModelWorkEvent =
  | NlModelWorkBlockStartedEvent
  | NlModelWorkDeltaEvent
  | NlModelWorkBlockCompletedEvent;

export interface NlJoinPlan {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: 'inner' | 'left' | 'right' | 'full';
  confidence: number;
  reason: string;
}

export interface NlExplanation {
  intentSummary: string;
  selectedTables: string[];
  joinPlan: NlJoinPlan[];
  filters: string[];
  aggregations: string[];
  assumptions: string[];
  validationNotes: string[];
  confidence: number;
  warningLevel: WarningLevel;
  confidenceMode: NlConfidenceMode;
  reliabilityTier: NlReliabilityTier;
}

export interface NlProviderInfo {
  id: string;
  label: string;
  model: string;
}

export interface GeneratedSqlV2 {
  sql: string;
  rationale: string;
  queryId: string;
  explanation: NlExplanation;
  provider: NlProviderInfo;
}

export interface GenerateSqlV2Options {
  projectId: string;
  nlQuery: string;
  defaultTable?: string;
  onProgress?: (event: NlProgressEvent) => void;
  onModelWork?: (event: NlModelWorkEvent) => void;
}

export interface RepairSqlV2Options {
  projectId: string;
  nlQuery: string;
  failedSql: string;
  executionError: string;
  defaultTable?: string;
  priorExplanation?: NlExplanation;
  onProgress?: (event: NlProgressEvent) => void;
  onModelWork?: (event: NlModelWorkEvent) => void;
}

export interface Nl2SqlServiceDeps {
  datasetRepository: import('../../repositories/datasetRepository.js').DatasetRepository;
  getClient: (model: string) => import('../llm/llmClient.js').LlmClient;
}

export interface SchemaColumnContext {
  name: string;
  dtype: string;
}

export interface SchemaTableContext {
  tableName: string;
  sourceFilename: string;
  rowCount: number;
  columns: SchemaColumnContext[];
}

export interface JoinCandidate {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  confidence: number;
  reason: string;
}

export type JsonRecord = Record<string, unknown>;

export const PASS1_SCHEMA = z.object({
  intentSummary: z.string().min(1),
  selectedTables: z.array(z.string().min(1)).default([]),
  joinPlan: z.array(
    z.object({
      leftTable: z.string().min(1),
      leftColumn: z.string().min(1),
      rightTable: z.string().min(1),
      rightColumn: z.string().min(1),
      joinType: z.enum(['inner', 'left', 'right', 'full']).default('inner'),
      confidence: z.number().min(0).max(1).default(0.5),
      reason: z.string().min(1)
    })
  ).default([]),
  filters: z.array(z.string()).default([]),
  aggregations: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5)
});

export type Pass1JoinPlanItem = z.infer<typeof PASS1_SCHEMA>['joinPlan'][number];

export const PASS2_SCHEMA = z.object({
  sql: z.string().min(1),
  rationale: z.string().min(1),
  intentSummary: z.string().min(1).optional(),
  selectedTables: z.array(z.string().min(1)).default([]),
  joinPlan: z.array(
    z.object({
      leftTable: z.string().min(1),
      leftColumn: z.string().min(1),
      rightTable: z.string().min(1),
      rightColumn: z.string().min(1),
      joinType: z.enum(['inner', 'left', 'right', 'full']).default('inner'),
      confidence: z.number().min(0).max(1).default(0.5),
      reason: z.string().min(1)
    })
  ).default([]),
  filters: z.array(z.string()).default([]),
  aggregations: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  validationNotes: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5)
});

export const REPAIR_SCHEMA = z.object({
  sql: z.string().min(1),
  rationale: z.string().min(1).default('Adjusted SQL after execution error.'),
  assumptions: z.array(z.string()).default([]),
  validationNotes: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional()
});

export const PASS2_FALLBACK_SCHEMA = z.object({
  sql: z.string().min(1),
  rationale: z.string().min(1),
  assumptions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.6)
});
