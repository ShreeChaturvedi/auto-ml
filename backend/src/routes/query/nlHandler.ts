import type { Response } from 'express';

import { appLogger } from '../../logging/logger.js';
import {
  generateSqlFromNaturalLanguageV2,
  repairSqlFromExecutionErrorV2,
  type GeneratedSqlV2,
  type NlModelWorkEvent,
  type NlProgressEvent,
  type NlProgressStatus
} from '../../services/nlToSql/index.js';
import { getCachedQueryResult, storeCachedQueryResult } from '../../services/queryCache.js';
import { executeReadOnlyQuery } from '../../services/sqlExecutor.js';
import { getErrorMessage } from '../../utils/errors.js';

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function hasResolvedColumnTypes(payload: { columns?: Array<{ dataType?: string }> } | null): boolean {
  if (!payload || !Array.isArray(payload.columns) || payload.columns.length === 0) {
    return false;
  }
  return payload.columns.every((column) => {
    if (typeof column.dataType !== 'string') return false;
    const normalized = column.dataType.trim().toLowerCase();
    return normalized.length > 0 && normalized !== 'unknown';
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SqlExecutionPayload = Awaited<ReturnType<typeof executeReadOnlyQuery>>;
type ProgressListener = ((event: NlProgressEvent) => void) | undefined;
type ModelWorkListener = ((event: NlModelWorkEvent) => void) | undefined;

export type NlResponsePayload = GeneratedSqlV2 & {
  cached: boolean;
  query: SqlExecutionPayload | null;
  queryExecutionError: string | null;
};

type NlStreamPhaseEvent = {
  type: 'phase_started' | 'phase_progress' | 'phase_completed' | 'phase_failed';
  phaseId: NlProgressEvent['phaseId'];
  summary: string;
  timestamp: string;
  details?: Record<string, unknown>;
};

type NlStreamModelWorkEvent = {
  type: 'model_work_block_started' | 'model_work_delta' | 'model_work_block_completed';
  blockId: string;
  phaseId: NlProgressEvent['phaseId'];
  kind: 'thinking' | 'plan' | 'tool' | 'sql' | 'validation' | 'repair' | 'status';
  title: string;
  timestamp: string;
  details?: Record<string, unknown>;
  delta?: string;
};

export type NlStreamEvent =
  | NlStreamPhaseEvent
  | NlStreamModelWorkEvent
  | { type: 'result'; nl: NlResponsePayload }
  | { type: 'done' };

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapProgressStatusToEventType(
  status: NlProgressStatus
): NlStreamPhaseEvent['type'] {
  switch (status) {
    case 'started':
      return 'phase_started';
    case 'progress':
      return 'phase_progress';
    case 'failed':
      return 'phase_failed';
    case 'completed':
    default:
      return 'phase_completed';
  }
}

function asPhaseEvent(progress: NlProgressEvent): NlStreamPhaseEvent {
  return {
    type: mapProgressStatusToEventType(progress.status),
    phaseId: progress.phaseId,
    summary: progress.summary,
    timestamp: progress.timestamp,
    details: progress.details
  };
}

function mapModelWorkKind(kind: NlModelWorkEvent['kind']): NlStreamModelWorkEvent['kind'] {
  return kind;
}

function asModelWorkEvent(event: NlModelWorkEvent): NlStreamModelWorkEvent {
  const rawType = String((event as { type?: unknown }).type ?? '');
  const rawDelta = Reflect.get(event as object, 'content') ?? Reflect.get(event as object, 'delta');
  const base = {
    blockId: event.blockId,
    phaseId: event.phaseId,
    kind: mapModelWorkKind(event.kind),
    title: event.title,
    timestamp: event.timestamp,
    details: event.details
  };

  if (rawType === 'block_started' || rawType === 'model_work_block_started') {
    return { type: 'model_work_block_started', ...base };
  }

  if (rawType === 'block_delta' || rawType === 'model_work_delta' || 'content' in event) {
    return {
      type: 'model_work_delta',
      ...base,
      delta: typeof rawDelta === 'string' ? rawDelta : undefined
    };
  }

  return { type: 'model_work_block_completed', ...base };
}

// ---------------------------------------------------------------------------
// NDJSON stream helpers
// ---------------------------------------------------------------------------

export function writeNdjsonEvent(res: Response, event: NlStreamEvent) {
  if (res.writableEnded) {
    return;
  }
  res.write(`${JSON.stringify(event)}\n`);
}

function emitNlProgress(
  onProgress: ProgressListener,
  event: Omit<NlProgressEvent, 'timestamp'>
) {
  if (!onProgress) {
    return;
  }

  onProgress({
    ...event,
    timestamp: new Date().toISOString()
  });
}

// ---------------------------------------------------------------------------
// Query execution helpers
// ---------------------------------------------------------------------------

async function executeAndCacheQuery(params: {
  projectId: string;
  sql: string;
}): Promise<SqlExecutionPayload> {
  const queryResult = await executeReadOnlyQuery({ sql: params.sql });
  await storeCachedQueryResult({
    projectId: params.projectId,
    sql: params.sql,
    payload: queryResult
  });
  return queryResult;
}

export async function executeCachedOrLiveQuery(params: {
  projectId: string;
  sql: string;
}): Promise<{ cached: boolean; query: SqlExecutionPayload }> {
  const cached = await getCachedQueryResult({
    projectId: params.projectId,
    sql: params.sql
  });
  if (cached && hasResolvedColumnTypes(cached)) {
    return {
      cached: true,
      query: cached
    };
  }

  const queryResult = await executeAndCacheQuery(params);
  return {
    cached: false,
    query: queryResult
  };
}

function buildNlResponsePayload(params: {
  generated: GeneratedSqlV2;
  cached: boolean;
  query: SqlExecutionPayload | null;
  queryExecutionError: string | null;
}): NlResponsePayload {
  return {
    ...params.generated,
    cached: params.cached,
    query: params.query,
    queryExecutionError: params.queryExecutionError
  };
}

// ---------------------------------------------------------------------------
// Stream initialisation helpers
// ---------------------------------------------------------------------------

export function initializeNdjsonStreamResponse(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

export function createStreamProgressWriter(res: Response): (event: NlProgressEvent) => void {
  return (event) => {
    writeNdjsonEvent(res, asPhaseEvent(event));
  };
}

export function createStreamModelWorkWriter(res: Response): (event: NlModelWorkEvent) => void {
  return (event) => {
    writeNdjsonEvent(res, asModelWorkEvent(event));
  };
}

// ---------------------------------------------------------------------------
// Core NL query resolution pipeline
// ---------------------------------------------------------------------------

export async function resolveNlQueryExecution(params: {
  projectId: string;
  query: string;
  tableName?: string;
  onProgress?: ProgressListener;
  onModelWork?: ModelWorkListener;
}): Promise<NlResponsePayload> {
  const generated = await generateSqlFromNaturalLanguageV2({
    projectId: params.projectId,
    nlQuery: params.query,
    defaultTable: params.tableName,
    onProgress: params.onProgress,
    onModelWork: params.onModelWork
  });

  emitNlProgress(params.onProgress, {
    phaseId: 'initial_execution',
    status: 'started',
    summary: 'Checking generated SQL against cache and live execution.'
  });

  try {
    const initialExecution = await executeCachedOrLiveQuery({
      projectId: params.projectId,
      sql: generated.sql
    });
    emitNlProgress(params.onProgress, {
      phaseId: 'initial_execution',
      status: 'completed',
      summary: initialExecution.cached
        ? 'Using cached query result for generated SQL.'
        : 'Generated SQL executed successfully.'
    });

    return buildNlResponsePayload({
      generated,
      cached: initialExecution.cached,
      query: initialExecution.query,
      queryExecutionError: null
    });
  } catch (executionError) {
    const message = getErrorMessage(executionError, 'Generated SQL failed to execute');
    appLogger.warn('[query/nl] Generated SQL execution failed:', {
      error: message,
      sql: generated.sql
    });

    emitNlProgress(params.onProgress, {
      phaseId: 'initial_execution',
      status: 'failed',
      summary: `Generated SQL execution failed: ${message}`
    });

    try {
      const repaired = await repairSqlFromExecutionErrorV2({
        projectId: params.projectId,
        nlQuery: params.query,
        failedSql: generated.sql,
        executionError: message,
        defaultTable: params.tableName,
        priorExplanation: generated.explanation,
        onProgress: params.onProgress,
        onModelWork: params.onModelWork
      });

      emitNlProgress(params.onProgress, {
        phaseId: 'initial_execution',
        status: 'progress',
        summary: 'Executing repaired SQL for validation.'
      });

      try {
        const repairedQuery = await executeAndCacheQuery({
          projectId: params.projectId,
          sql: repaired.sql
        });

        emitNlProgress(params.onProgress, {
          phaseId: 'initial_execution',
          status: 'completed',
          summary: 'Repaired SQL executed successfully.'
        });

        return buildNlResponsePayload({
          generated: repaired,
          cached: false,
          query: repairedQuery,
          queryExecutionError: null
        });
      } catch (repairedExecutionError) {
        const repairedMessage = getErrorMessage(repairedExecutionError, 'Repaired SQL failed to execute');
        emitNlProgress(params.onProgress, {
          phaseId: 'initial_execution',
          status: 'failed',
          summary: `Repaired SQL execution failed: ${repairedMessage}`
        });

        return buildNlResponsePayload({
          generated: repaired,
          cached: false,
          query: null,
          queryExecutionError: repairedMessage
        });
      }
    } catch (repairError) {
      appLogger.warn('[query/nl] SQL repair failed, returning original SQL for manual review:', repairError);
      return buildNlResponsePayload({
        generated,
        cached: false,
        query: null,
        queryExecutionError: message
      });
    }
  }
}
