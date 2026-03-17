/**
 * useColumnOperations - Column type management, table metadata derivation,
 * and query-result transformation helpers used by DataViewerTab.
 */

import { useMemo } from 'react';
import { ApiError } from '@/lib/api/client';
import { extractColumnTypesFromQuery } from '@/lib/sql/sqlColumnTypes';
import type { QueryResultPayload } from '@/lib/api/query';
import type { DataPreview, UploadedFile } from '@/types/file';

/** Extract a human-readable message from an API error (or any thrown value). */
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

/** Build a DataPreview from a raw query result payload. */
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

/** Extract EDA + cache metadata from a query result payload. */
export function buildQueryArtifactMeta(query: QueryResultPayload) {
  return {
    eda: query.eda,
    cached: query.cached,
    executionMs: query.executionMs,
    cacheTimestamp: query.cacheTimestamp
  };
}

/** Derive table names and column-name maps from project files and previews. */
export function useColumnOperations(
  files: UploadedFile[],
  previews: DataPreview[]
) {
  const tableNames = useMemo(() => {
    return files
      .filter((f) => f.metadata?.tableName)
      .map((f) => f.metadata!.tableName!);
  }, [files]);

  const columnsByTable = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const file of files) {
      if (!file.metadata?.tableName) continue;
      const preview = previews.find((p) => p.fileId === file.id);
      if (preview) {
        result[file.metadata.tableName] = preview.headers;
      }
    }
    return result;
  }, [files, previews]);

  return { tableNames, columnsByTable };
}
