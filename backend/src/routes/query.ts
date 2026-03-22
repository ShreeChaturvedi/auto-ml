import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getNaturalLanguageSuggestions } from '../services/nlSuggestions/index.js';
import { getErrorMessage } from '../utils/errors.js';

import {
  createStreamModelWorkWriter,
  createStreamProgressWriter,
  executeCachedOrLiveQuery,
  initializeNdjsonStreamResponse,
  resolveNlQueryExecution,
  writeNdjsonEvent
} from './query/nlHandler.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createQueryRouter() {
  const router = Router();
  const isVitestRuntime = Boolean(process.env.VITEST);

  // POST /query/sql — execute a raw SQL query (cached when possible)
  router.post(
    '/query/sql',
    asyncHandler(async (req, res) => {
      if (!isVitestRuntime) {
        appLogger.info('[query/sql] Request body:', req.body);
      }
      const result = sqlQuerySchema.safeParse(req.body);
      if (!result.success) {
        if (!isVitestRuntime) {
          appLogger.info('[query/sql] Validation error:', result.error.flatten());
        }
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
          error: getErrorMessage(error, 'Failed to execute query')
        });
      }
    })
  );

  // POST /query/nl — NL-to-SQL (non-streaming)
  router.post(
    '/query/nl',
    asyncHandler(async (req, res) => {
      const result = nlQuerySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ errors: result.error.flatten() });
      }
      if (!hasDatabaseConfiguration()) {
        return res.status(503).json({ error: 'Database is not configured for NL→SQL execution' });
      }

      const { projectId, query, tableName } = result.data;

      try {
        const nl = await resolveNlQueryExecution({ projectId, query, tableName });
        return res.json({ nl });
      } catch (error) {
        appLogger.error('[query/nl] NL query post-processing failed:', error);
        return res.status(400).json({
          error: getErrorMessage(error, 'Failed to process NL query')
        });
      }
    })
  );

  // POST /query/nl/stream — NL-to-SQL (NDJSON streaming)
  router.post(
    '/query/nl/stream',
    asyncHandler(async (req, res) => {
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

        onProgress({
          phaseId: 'done',
          status: 'completed',
          summary: 'NL query pipeline finished.',
          timestamp: new Date().toISOString()
        });
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
    })
  );

  // GET /query/nl/suggestions — NL query suggestions
  router.get(
    '/query/nl/suggestions',
    asyncHandler(async (req, res) => {
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
          error: getErrorMessage(error, 'Failed to load NL suggestions')
        });
      }
    })
  );

  // GET /query/cache/config — cache configuration
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
