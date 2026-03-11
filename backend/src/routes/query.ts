import { Router, type Response } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { hasDatabaseConfiguration } from '../db.js';
import { getNaturalLanguageSuggestions } from '../services/nlSuggestions/index.js';
import {
  generateSqlFromNaturalLanguageV2,
  repairSqlFromExecutionErrorV2,
  type GeneratedSqlV2,
  type NlModelWorkEvent,
  type NlProgressEvent,
  type NlProgressStatus
} from '../services/nlToSql/index.js';
import { getCachedQueryResult, storeCachedQueryResult } from '../services/queryCache.js';
import { executeReadOnlyQuery } from '../services/sqlExecutor.js';

function hasResolvedColumnTypes(payload: { columns?: Array<{ dataType?: string }> } | null): boolean {
  if (!payload || !Array.isArray(payload.columns) || payload.columns.length === 0) {
    return false;
  }
  return payload.columns.every((column) => {
    if (typeof column.dataType !== 'string') return false;
    const normalized = column.dataType.trim().toLowerCase();
    return normalized.length > 0 && normalized !== 'unknown';
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

const sqlQuerySchema = z.object({
  projectId: z.string().uuid('projectId must be a valid UUID'),
  sql: z.string().min(1, 'sql is required')
});

const nlQuerySchema = z.object({
  projectId: z.string().uuid('projectId must be a valid UUID'),
  query: z.string().min(3, 'query must be at least 3 characters'),
  tableName: z.string().min(1).optional()
});

const nlSuggestionQuerySchema = z.object({
  projectId: z.string().uuid('projectId must be a valid UUID'),
  limit: z.coerce.number().int().min(1).max(12).optional()
});

type SqlExecutionPayload = Awaited<ReturnType<typeof executeReadOnlyQuery>>;
type ProgressListener = ((event: NlProgressEvent) => void) | undefined;
type ModelWorkListener = ((event: NlModelWorkEvent) => void) | undefined;

type NlResponsePayload = GeneratedSqlV2 & {
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

type NlStreamEvent =
  | NlStreamPhaseEvent
  | NlStreamModelWorkEvent
  | { type: 'result'; nl: NlResponsePayload }
  | { type: 'done' };

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

function writeNdjsonEvent(res: Response, event: NlStreamEvent) {
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

async function executeCachedOrLiveQuery(params: {
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

function initializeNdjsonStreamResponse(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

function createStreamProgressWriter(res: Response): (event: NlProgressEvent) => void {
  return (event) => {
    writeNdjsonEvent(res, asPhaseEvent(event));
  };
}

function createStreamModelWorkWriter(res: Response): (event: NlModelWorkEvent) => void {
  return (event) => {
    writeNdjsonEvent(res, asModelWorkEvent(event));
  };
}

async function resolveNlQueryExecution(params: {
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
    console.warn('[query/nl] Generated SQL execution failed:', {
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
      console.warn('[query/nl] SQL repair failed, returning original SQL for manual review:', repairError);
      return buildNlResponsePayload({
        generated,
        cached: false,
        query: null,
        queryExecutionError: message
      });
    }
  }
}

export function createQueryRouter() {
  const router = Router();

  router.post('/query/sql', async (req, res) => {
    console.log('[query/sql] Request body:', req.body);
    const result = sqlQuerySchema.safeParse(req.body);
    if (!result.success) {
      console.log('[query/sql] Validation error:', result.error.flatten());
      return res.status(400).json({ errors: result.error.flatten() });
    }

    if (!hasDatabaseConfiguration()) {
      return res.status(503).json({ error: 'Database is not configured for SQL execution' });
    }

    const { projectId, sql } = result.data;

    try {
      const queryResult = await executeCachedOrLiveQuery({ projectId, sql });
      return res.json({ query: queryResult.query });
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 400;
      return res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Failed to execute query'
      });
    }
  });

  router.post('/query/nl', async (req, res) => {
    const result = nlQuerySchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }
    if (!hasDatabaseConfiguration()) {
      return res.status(503).json({ error: 'Database is not configured for NL→SQL execution' });
    }

    const { projectId, query, tableName } = result.data;

    try {
      const nl = await resolveNlQueryExecution({
        projectId,
        query,
        tableName
      });

      return res.json({ nl });
    } catch (error) {
      console.error('[query/nl] NL query post-processing failed:', error);
      return res.status(400).json({
        error: getErrorMessage(error, 'Failed to process NL query')
      });
    }
  });

  router.post('/query/nl/stream', async (req, res) => {
    const result = nlQuerySchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }
    if (!hasDatabaseConfiguration()) {
      return res.status(503).json({ error: 'Database is not configured for NL→SQL execution' });
    }

    const { projectId, query, tableName } = result.data;

    initializeNdjsonStreamResponse(res);
    const onProgress = createStreamProgressWriter(res);
    const onModelWork = createStreamModelWorkWriter(res);

    try {
      const nl = await resolveNlQueryExecution({
        projectId,
        query,
        tableName,
        onProgress,
        onModelWork
      });

      writeNdjsonEvent(res, { type: 'result', nl });

      emitNlProgress(onProgress, {
        phaseId: 'done',
        status: 'completed',
        summary: 'NL query pipeline finished.'
      });
    } catch (error) {
      emitNlProgress(onProgress, {
        phaseId: 'done',
        status: 'failed',
        summary: getErrorMessage(error, 'Failed to process NL query')
      });
    } finally {
      writeNdjsonEvent(res, { type: 'done' });
      res.end();
    }
  });

  router.get('/query/nl/suggestions', async (req, res) => {
    const result = nlSuggestionQuerySchema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    try {
      const suggestions = await getNaturalLanguageSuggestions({
        projectId: result.data.projectId,
        limit: result.data.limit
      });

      return res.json(suggestions);
    } catch (error) {
      return res.status(400).json({
        error: getErrorMessage(error, 'Failed to generate NL suggestions')
      });
    }
  });

  router.get('/query/cache/config', (_req, res) => {
    res.json({
      ttlMs: env.queryCacheTtlMs,
      maxEntries: env.queryCacheMaxEntries,
      sqlDefaultLimit: env.sqlDefaultLimit,
      sqlMaxRows: env.sqlMaxRows
    });
  });

  return router;
}
