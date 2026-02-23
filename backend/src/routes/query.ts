import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { hasDatabaseConfiguration } from '../db.js';
import { generateSqlFromNaturalLanguage } from '../services/nlToSql.js';
import { getCachedQueryResult, storeCachedQueryResult } from '../services/queryCache.js';
import { executeReadOnlyQuery } from '../services/sqlExecutor.js';

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
      if (cached) {
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
      const generated = generateSqlFromNaturalLanguage({
        nlQuery: query,
        defaultTable: tableName
      });

      const cached = await getCachedQueryResult({ projectId, sql: generated.sql });
      if (cached) {
        return res.json({
          nl: {
            ...generated,
            cached: true,
            query: cached
          }
        });
      }

      const queryResult = await executeReadOnlyQuery({ sql: generated.sql });
      await storeCachedQueryResult({
        projectId,
        sql: generated.sql,
        payload: queryResult
      });

      const response = {
        nl: {
          ...generated,
          cached: false,
          query: queryResult
        }
      };

      return res.json(response);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to process NL query'
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
