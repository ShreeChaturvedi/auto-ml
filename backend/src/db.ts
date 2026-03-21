import { Pool, type PoolConfig } from 'pg';

import { env } from './config.js';
import { appLogger } from './logging/logger.js';


let pool: Pool | null = null;

function buildPoolConfig(): PoolConfig {
  if (!env.databaseUrl) {
    throw new Error('Database URL is not configured');
  }

  const ssl =
    env.pgSslMode.toLowerCase() === 'require'
      ? {
          rejectUnauthorized: false
        }
      : undefined;

  const poolMin = Math.max(0, env.pgPoolMin);
  const poolMax = Math.max(poolMin || 1, env.pgPoolMax);

  return {
    connectionString: env.databaseUrl,
    ssl,
    min: poolMin,
    max: poolMax
  };
}

export function hasDatabaseConfiguration(): boolean {
  return Boolean(env.databaseUrl);
}

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool(buildPoolConfig());
    pool.on('error', (error) => {
      appLogger.error('[db] Unexpected PG pool error', error);
    });
  }
  return pool;
}

export async function verifyDatabaseConnection(): Promise<void> {
  if (!hasDatabaseConfiguration()) {
    console.info('[db] DATABASE_URL not set, skipping Postgres connection check');
    return;
  }

  const client = await getDbPool().connect();
  try {
    await client.query('select 1 as ok');
    console.info('[db] Successfully connected to Postgres');
  } finally {
    client.release();
  }
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
