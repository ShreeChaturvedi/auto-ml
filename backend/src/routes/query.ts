import { Router, type Response } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { hasDatabaseConfiguration } from '../db.js';
import {
  generateSqlFromNaturalLanguageV2,
  repairSqlFromExecutionErrorV2,
  type GeneratedSqlV2,
  type NlProgressEvent,
  type NlProgressStatus
} from '../services/nlToSqlV2.js';
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

type SqlExecutionPayload = Awaited<ReturnType<typeof executeReadOnlyQuery>>;
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

type NlStreamEvent =
  | NlStreamPhaseEvent
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

function writeNdjsonEvent(res: Response, event: NlStreamEvent) {
  if (res.writableEnded) {
    return;
  }
  res.write(`${JSON.stringify(event)}\n`);
}

function emitNlProgress(
  onProgress: ((event: NlProgressEvent) => void) | undefined,
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

async function resolveNlQueryExecution(params: {
  projectId: string;
  query: string;
  tableName?: string;
  onProgress?: (event: NlProgressEvent) => void;
}): Promise<NlResponsePayload> {
  const generated = await generateSqlFromNaturalLanguageV2({
    projectId: params.projectId,
    nlQuery: params.query,
    defaultTable: params.tableName,
    onProgress: params.onProgress
  });

  emitNlProgress(params.onProgress, {
    phaseId: 'initial_execution',
    status: 'started',
    summary: 'Checking generated SQL against cache and live execution.'
  });

  const cached = await getCachedQueryResult({
    projectId: params.projectId,
    sql: generated.sql
  });
  if (cached && hasResolvedColumnTypes(cached)) {
    emitNlProgress(params.onProgress, {
      phaseId: 'initial_execution',
      status: 'completed',
      summary: 'Using cached query result for generated SQL.'
    });

    return {
      ...generated,
      cached: true,
      query: cached,
      queryExecutionError: null
    };
  }

  try {
    const queryResult = await executeReadOnlyQuery({ sql: generated.sql });
    await storeCachedQueryResult({
      projectId: params.projectId,
      sql: generated.sql,
      payload: queryResult
    });

    emitNlProgress(params.onProgress, {
      phaseId: 'initial_execution',
      status: 'completed',
      summary: 'Generated SQL executed successfully.'
    });

    return {
      ...generated,
      cached: false,
      query: queryResult,
      queryExecutionError: null
    };
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
        onProgress: params.onProgress
      });

      emitNlProgress(params.onProgress, {
        phaseId: 'initial_execution',
        status: 'progress',
        summary: 'Executing repaired SQL for validation.'
      });

      try {
        const repairedQuery = await executeReadOnlyQuery({ sql: repaired.sql });
        await storeCachedQueryResult({
          projectId: params.projectId,
          sql: repaired.sql,
          payload: repairedQuery
        });

        emitNlProgress(params.onProgress, {
          phaseId: 'initial_execution',
          status: 'completed',
          summary: 'Repaired SQL executed successfully.'
        });

        return {
          ...repaired,
          cached: false,
          query: repairedQuery,
          queryExecutionError: null
        };
      } catch (repairedExecutionError) {
        const repairedMessage = getErrorMessage(repairedExecutionError, 'Repaired SQL failed to execute');
        emitNlProgress(params.onProgress, {
          phaseId: 'initial_execution',
          status: 'failed',
          summary: `Repaired SQL execution failed: ${repairedMessage}`
        });

        return {
          ...repaired,
          cached: false,
          query: null,
          queryExecutionError: repairedMessage
        };
      }
    } catch (repairError) {
      console.warn('[query/nl] SQL repair failed, returning original SQL for manual review:', repairError);
      return {
        ...generated,
        cached: false,
        query: null,
        queryExecutionError: message
      };
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
      const cached = await getCachedQueryResult({ projectId, sql });
      if (cached && hasResolvedColumnTypes(cached)) {
        return res.json({ query: cached });
      }

      const queryResult = await executeReadOnlyQuery({ sql });
      await storeCachedQueryResult({ projectId, sql, payload: queryResult });

      return res.json({ query: queryResult });
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

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const onProgress = (event: NlProgressEvent) => {
      writeNdjsonEvent(res, asPhaseEvent(event));
    };

    try {
      const nl = await resolveNlQueryExecution({
        projectId,
        query,
        tableName,
        onProgress
      });

      onProgress({
        phaseId: 'done',
        status: 'completed',
        summary: 'NL query pipeline finished.',
        timestamp: new Date().toISOString()
      });

      writeNdjsonEvent(res, { type: 'result', nl });
    } catch (error) {
      onProgress({
        phaseId: 'done',
        status: 'failed',
        summary: getErrorMessage(error, 'Failed to process NL query'),
        timestamp: new Date().toISOString()
      });
    } finally {
      writeNdjsonEvent(res, { type: 'done' });
      res.end();
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
