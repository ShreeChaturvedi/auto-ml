import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { hasDatabaseConfiguration } from '../db.js';
import { generateSqlFromNaturalLanguageV2, repairSqlFromExecutionErrorV2 } from '../services/nlToSqlV2.js';
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

    let generated;
    try {
      generated = await generateSqlFromNaturalLanguageV2({
        projectId,
        nlQuery: query,
        defaultTable: tableName
      });
    } catch (error) {
      console.error('[query/nl] NL generation failed:', error);
      return res.status(400).json({
        error: getErrorMessage(error, 'Failed to process NL query')
      });
    }

    try {
      const cached = await getCachedQueryResult({ projectId, sql: generated.sql });
      if (cached && hasResolvedColumnTypes(cached)) {
        return res.json({
          nl: {
            ...generated,
            cached: true,
            query: cached,
            queryExecutionError: null
          }
        });
      }

      try {
        const queryResult = await executeReadOnlyQuery({ sql: generated.sql });
        await storeCachedQueryResult({
          projectId,
          sql: generated.sql,
          payload: queryResult
        });

        return res.json({
          nl: {
            ...generated,
            cached: false,
            query: queryResult,
            queryExecutionError: null
          }
        });
      } catch (executionError) {
        const message = getErrorMessage(executionError, 'Generated SQL failed to execute');
        console.warn('[query/nl] Generated SQL execution failed:', {
          error: message,
          sql: generated.sql
        });

        try {
          const repaired = await repairSqlFromExecutionErrorV2({
            projectId,
            nlQuery: query,
            failedSql: generated.sql,
            executionError: message,
            defaultTable: tableName,
            priorExplanation: generated.explanation
          });

          try {
            const repairedQuery = await executeReadOnlyQuery({ sql: repaired.sql });
            await storeCachedQueryResult({
              projectId,
              sql: repaired.sql,
              payload: repairedQuery
            });

            return res.json({
              nl: {
                ...repaired,
                cached: false,
                query: repairedQuery,
                queryExecutionError: null
              }
            });
          } catch (repairedExecutionError) {
            const repairedMessage = getErrorMessage(repairedExecutionError, 'Repaired SQL failed to execute');
            return res.json({
              nl: {
                ...repaired,
                cached: false,
                query: null,
                queryExecutionError: repairedMessage
              }
            });
          }
        } catch (repairError) {
          console.warn('[query/nl] SQL repair failed, returning original SQL for manual review:', repairError);
          return res.json({
            nl: {
              ...generated,
              cached: false,
              query: null,
              queryExecutionError: message
            }
          });
        }
      }
    } catch (error) {
      console.error('[query/nl] NL query post-processing failed:', error);
      return res.status(400).json({
        error: getErrorMessage(error, 'Failed to process NL query')
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
