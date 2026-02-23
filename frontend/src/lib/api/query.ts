import { apiRequest } from './client';
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
  columns: Array<{ name: string; dataTypeID?: number }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionMs: number;
  cached: boolean;
  cacheTimestamp?: string;
  eda?: EdaSummary;
}

export async function executeSqlQuery(request: SqlQueryRequest) {
  return apiRequest<{ query: QueryResultPayload }>('/query/sql', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function executeNlQuery(request: NlQueryRequest) {
  return apiRequest<{
    nl: {
      sql: string;
      rationale: string;
      queryId: string;
      cached: boolean;
      query: QueryResultPayload;
    };
  }>('/query/nl', {
    method: 'POST',
    body: JSON.stringify(request),
  });
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
