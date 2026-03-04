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

export interface NlStreamPhaseEvent {
  type: 'phase_started' | 'phase_progress' | 'phase_completed' | 'phase_failed';
  phaseId: NlStreamPhaseId;
  summary: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export type NlQueryStreamEvent =
  | NlStreamPhaseEvent
  | { type: 'result'; nl: NlQueryResponsePayload }
  | { type: 'done' };

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
      try {
        const payload = JSON.parse(trimmed) as NlQueryStreamEvent;
        if (payload.type === 'done') {
          sawDone = true;
        }
        onEvent(payload);
      } catch {
        onEvent({
          type: 'phase_failed',
          phaseId: 'done',
          summary: 'Failed to parse NL stream response.',
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  if (buffer.trim()) {
    try {
      const payload = JSON.parse(buffer.trim()) as NlQueryStreamEvent;
      if (payload.type === 'done') {
        sawDone = true;
      }
      onEvent(payload);
    } catch {
      onEvent({
        type: 'phase_failed',
        phaseId: 'done',
        summary: 'Failed to parse NL stream tail.',
        timestamp: new Date().toISOString()
      });
    }
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
