import { ApiError } from '@/lib/api/client';
import { extractColumnTypesFromQuery } from '@/lib/sql/sqlColumnTypes';
import type { QueryResultPayload } from '@/lib/api/query';
import type { DataPreview } from '@/types/file';
import type { NlGenerationResult } from '@/types/nlQuery';

export function extractApiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  if (!(error instanceof ApiError)) {
    return error.message;
  }

  if (error.payload && typeof error.payload === 'object') {
    const payload = error.payload as Record<string, unknown>;

    if (typeof payload.details === 'string' && payload.details.trim()) {
      return payload.details;
    }

    if (payload.errors && typeof payload.errors === 'object') {
      const errors = payload.errors as {
        fieldErrors?: Record<string, string[]>;
        formErrors?: string[];
      };

      const fieldErrors = errors.fieldErrors
        ? Object.entries(errors.fieldErrors)
            .map(([key, values]) => `${key}: ${values.join(', ')}`)
            .join('; ')
        : '';
      const formErrors = errors.formErrors?.join('; ') ?? '';
      const combined = [fieldErrors, formErrors].filter(Boolean).join(' | ');
      if (combined) {
        return combined;
      }
    }

    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
  }

  return error.message;
}

export function buildDataPreviewFromQuery(query: QueryResultPayload): DataPreview {
  return {
    fileId: 'query-result',
    headers: query.columns.map((col) => col.name),
    rows: query.rows,
    totalRows: query.rowCount,
    previewRows: query.rowCount,
    eda: query.eda,
    columnTypes: extractColumnTypesFromQuery(query.columns, query.rows)
  };
}

export function buildQueryArtifactMeta(query: QueryResultPayload) {
  return {
    eda: query.eda,
    cached: query.cached,
    executionMs: query.executionMs,
    cacheTimestamp: query.cacheTimestamp
  };
}

export function toNlGenerationResult(nl: {
  sql: string;
  rationale: string;
  explanation: string;
  queryId: string;
  provider: string;
  cached: boolean;
  queryExecutionError?: string | null;
  query?: QueryResultPayload;
}): NlGenerationResult {
  return {
    sql: nl.sql,
    rationale: nl.rationale,
    explanation: nl.explanation,
    queryId: nl.queryId,
    provider: nl.provider,
    cached: nl.cached,
    queryExecutionError: nl.queryExecutionError ?? null,
    queryResult: nl.query
  };
}
