import { apiFetch, apiRequest } from './client';
import { readNdjsonStream } from './streamReader';
import type { EdaSummary } from '@/types/file';

// Re-export EdaSummary for convenience
export type { EdaSummary } from '@/types/file';

export interface SqlQueryRequest {
  projectId: string;
  sql: string;
}

export interface NlQueryRequest {
  projectId: string;
  query: string;
  tableName?: string;
}

export interface WorkflowPlaceholders {
  preprocessing: string[];
  featureEngineering: string[];
  training: string[];
  explore?: string[];
}

export interface NlSuggestion {
  id: string;
  prompt: string;
  label: string;
  category: string;
  tables: string[];
  rationale: string;
}

export interface NlProviderInfo {
  id: string;
  label: string;
  model: string;
}

export interface QueryResultPayload {
  queryId: string;
  sql: string;
  columns: Array<{ name: string; dataTypeID?: number; dataType?: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionMs: number;
  cached: boolean;
  cacheTimestamp?: string;
  eda?: EdaSummary;
}

export interface NlJoinPlan {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: 'inner' | 'left' | 'right' | 'full';
  confidence: number;
  reason: string;
}

export interface NlQueryExplanation {
  intentSummary: string;
  selectedTables: string[];
  joinPlan: NlJoinPlan[];
  filters: string[];
  aggregations: string[];
  assumptions: string[];
  validationNotes: string[];
  confidence: number;
  warningLevel: 'none' | 'low' | 'medium' | 'high';
  confidenceMode: 'model' | 'repair';
  reliabilityTier: 'high' | 'medium' | 'low';
}

export interface NlQueryResponsePayload {
  sql: string;
  rationale: string;
  explanation: NlQueryExplanation;
  queryId: string;
  provider: NlProviderInfo;
  cached: boolean;
  query: QueryResultPayload | null;
  queryExecutionError?: string | null;
}

export type NlStreamPhaseId =
  | 'schema_context'
  | 'planning'
  | 'sql_generation'
  | 'validation'
  | 'initial_execution'
  | 'repair'
  | 'done';

export type NlModelWorkKind =
  | 'thinking'
  | 'plan'
  | 'tool'
  | 'sql'
  | 'validation'
  | 'repair'
  | 'status';

export interface NlStreamPhaseEvent {
  type: 'phase_started' | 'phase_progress' | 'phase_completed' | 'phase_failed';
  phaseId: NlStreamPhaseId;
  summary: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface NlModelWorkEventBase {
  blockId: string;
  kind: NlModelWorkKind;
  title: string;
  timestamp: string;
  phaseId?: NlStreamPhaseId;
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

export type NlModelWorkStreamEvent =
  | NlModelWorkBlockStartedEvent
  | NlModelWorkDeltaEvent
  | NlModelWorkBlockCompletedEvent;

export type NlQueryStreamEvent =
  | NlStreamPhaseEvent
  | NlModelWorkStreamEvent
  | { type: 'result'; nl: NlQueryResponsePayload }
  | { type: 'done' };


export async function executeSqlQuery(request: SqlQueryRequest) {
  return apiRequest<{ query: QueryResultPayload }>('/query/sql', {
    method: 'POST',
    body: request,
  });
}

export async function executeNlQuery(request: NlQueryRequest) {
  return apiRequest<{
    nl: NlQueryResponsePayload;
  }>('/query/nl', {
    method: 'POST',
    body: request,
  });
}

export async function fetchNlSuggestions(projectId: string, limit = 8) {
  const search = new URLSearchParams({
    projectId,
    limit: String(limit)
  });

  return apiRequest<{
    suggestions: NlSuggestion[];
    cached: boolean;
    schemaFingerprint: string;
    workflowPlaceholders?: WorkflowPlaceholders;
  }>(`/query/nl/suggestions?${search.toString()}`, {
    method: 'GET'
  });
}

export async function streamNlQuery(
  request: NlQueryRequest,
  onEvent: (event: NlQueryStreamEvent) => void,
  signal?: AbortSignal
) {
  const response = await apiFetch('/query/nl/stream', {
    method: 'POST',
    headers: { Accept: 'application/x-ndjson' },
    body: request,
    signal
  });

  if (!response.ok || !response.body) {
    const rawMessage = await response.text().catch(() => '');
    throw new Error(rawMessage || `NL stream request failed (${response.status})`);
  }

  let sawDone = false;

  try {
    for await (const payload of readNdjsonStream<NlQueryStreamEvent>(response)) {
      onEvent(payload);
      if (payload.type === 'done') sawDone = true;
    }
  } catch (error) {
    const summary = error instanceof SyntaxError && error.message.includes('tail')
      ? 'Failed to parse NL stream tail response.'
      : 'Failed to parse NL stream response.';
    onEvent({
      type: 'phase_failed',
      phaseId: 'done',
      summary,
      timestamp: new Date().toISOString()
    });
  }

  if (!sawDone) {
    onEvent({ type: 'done' });
  }
}

export async function getCacheConfig() {
  return apiRequest<{
    ttlMs: number;
    maxEntries: number;
    sqlDefaultLimit: number;
    sqlMaxRows: number;
  }>('/query/cache/config', {
    method: 'GET',
  });
}
