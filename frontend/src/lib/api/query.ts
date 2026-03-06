import { apiRequest, getApiBaseUrl } from './client';
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
  confidenceMode: 'model' | 'heuristic' | 'deterministic_fallback' | 'repair';
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

function emitStreamParseFailure(
  onEvent: (event: NlQueryStreamEvent) => void,
  summary: string
) {
  onEvent({
    type: 'phase_failed',
    phaseId: 'done',
    summary,
    timestamp: new Date().toISOString()
  });
}

function emitParsedStreamEvent(
  onEvent: (event: NlQueryStreamEvent) => void,
  rawPayload: string,
  parseFailureSummary: string
): boolean {
  try {
    const payload = JSON.parse(rawPayload) as NlQueryStreamEvent;
    onEvent(payload);
    return payload.type === 'done';
  } catch {
    emitStreamParseFailure(onEvent, parseFailureSummary);
    return false;
  }
}

export async function executeSqlQuery(request: SqlQueryRequest) {
  return apiRequest<{ query: QueryResultPayload }>('/query/sql', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function executeNlQuery(request: NlQueryRequest) {
  return apiRequest<{
    nl: NlQueryResponsePayload;
  }>('/query/nl', {
    method: 'POST',
    body: JSON.stringify(request),
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
  }>(`/query/nl/suggestions?${search.toString()}`, {
    method: 'GET'
  });
}

export async function streamNlQuery(
  request: NlQueryRequest,
  onEvent: (event: NlQueryStreamEvent) => void,
  signal?: AbortSignal
) {
  const response = await fetch(`${getApiBaseUrl()}/query/nl/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(request),
    signal
  });

  if (!response.ok || !response.body) {
    const rawMessage = await response.text().catch(() => '');
    throw new Error(rawMessage || `NL stream request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      sawDone = emitParsedStreamEvent(onEvent, trimmed, 'Failed to parse NL stream response.') || sawDone;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    sawDone = emitParsedStreamEvent(onEvent, buffer.trim(), 'Failed to parse NL stream tail.') || sawDone;
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
