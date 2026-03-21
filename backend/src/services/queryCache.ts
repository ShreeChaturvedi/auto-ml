import { randomUUID } from 'node:crypto';

import { addMilliseconds } from 'date-fns';

import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';
import type { QueryResultPayload } from '../types/query.js';
import { hashSql } from '../utils/hash.js';

export interface CacheLookup {
  projectId: string;
  sql: string;
}

export async function getCachedQueryResult({ projectId, sql }: CacheLookup): Promise<QueryResultPayload | null> {
  if (!hasDatabaseConfiguration()) return null;

  const pool = getDbPool();
  const sqlHash = hashSql(projectId, sql);
  const result = await pool.query(
    `SELECT cached_result, metadata, last_accessed 
     FROM query_cache 
     WHERE project_id = $1 AND sql_hash = $2 AND expires_at > NOW()`,
    [projectId, sqlHash]
  );

  if (result.rowCount === 0) return null;

  await pool.query(`UPDATE query_cache SET last_accessed = NOW() WHERE project_id = $1 AND sql_hash = $2`, [
    projectId,
    sqlHash
  ]);

  const payload = result.rows[0].cached_result as QueryResultPayload;
  payload.cached = true;
  payload.cacheTimestamp = result.rows[0].last_accessed?.toISOString();
  return payload;
}

export async function storeCachedQueryResult({
  projectId,
  sql,
  payload
}: CacheLookup & { payload: QueryResultPayload }): Promise<void> {
  if (!hasDatabaseConfiguration()) return;

  const pool = getDbPool();
  const sqlHash = hashSql(projectId, sql);
  const expiresAt = addMilliseconds(new Date(), env.queryCacheTtlMs);

  try {
    await pool.query(
      `INSERT INTO query_cache (cache_id, project_id, sql_hash, sql_text, cached_result, metadata, last_accessed, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
       ON CONFLICT (project_id, sql_hash)
       DO UPDATE SET cached_result = EXCLUDED.cached_result,
                     metadata = EXCLUDED.metadata,
                     last_accessed = NOW(),
                     expires_at = EXCLUDED.expires_at`,
      [
        randomUUID(),
        projectId,
        sqlHash,
        sql,
        JSON.stringify(payload),
        JSON.stringify({ rowCount: payload.rowCount, executionMs: payload.executionMs }),
        expiresAt
      ]
    );

    await trimCacheIfNeeded(pool);
  } catch (error) {
    // Log but don't fail - caching is optional, queries should still work
    // Common cause: project doesn't exist in DB (created before Postgres was configured)
    appLogger.warn('[queryCache] Failed to cache query result:', (error as Error).message);
  }
}

async function trimCacheIfNeeded(pool = getDbPool()) {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::bigint::numeric::text AS count FROM query_cache'
  );
  const count = Number(rows[0]?.count ?? '0');
  if (count <= env.queryCacheMaxEntries) return;

  await pool.query(
    `DELETE FROM query_cache
     WHERE cache_id IN (
       SELECT cache_id FROM query_cache ORDER BY last_accessed ASC LIMIT $1
     )`,
    [Math.max(1, Math.floor(env.queryCacheMaxEntries * 0.1))]
  );
}
