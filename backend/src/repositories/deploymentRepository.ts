import { randomUUID, createHash, randomBytes } from 'node:crypto';

import { getDbPool } from '../db.js';
import { appLogger } from '../logging/logger.js';
import type {
  DeploymentRecord,
  DeploymentStatus,
  PredictionLog,
  DeploymentStatsHourly,
  DeploymentApiKey,
  PredictionLogFilters,
} from '../types/deployment.js';

export interface DeploymentRepository {
  // Deployments
  create(input: Omit<DeploymentRecord, 'deploymentId' | 'createdAt' | 'updatedAt'>): Promise<DeploymentRecord>;
  getById(deploymentId: string): Promise<DeploymentRecord | undefined>;
  listByProject(projectId: string): Promise<DeploymentRecord[]>;
  update(
    deploymentId: string,
    fields: Partial<
      Pick<DeploymentRecord, 'status' | 'containerId' | 'port' | 'endpointUrl' | 'errorMessage' | 'stoppedAt'>
    >,
  ): Promise<DeploymentRecord | undefined>;
  delete(deploymentId: string): Promise<boolean>;
  countByProject(projectId: string): Promise<number>;
  listNonStopped(): Promise<DeploymentRecord[]>;

  // Prediction logs
  insertPredictionLog(log: Omit<PredictionLog, 'id'>): Promise<void>;
  getPredictionLogs(
    deploymentId: string,
    filters?: PredictionLogFilters,
  ): Promise<{ logs: PredictionLog[]; total: number }>;

  // Hourly stats
  upsertHourlyStats(deploymentId: string, hourBucket: Date, stats: Partial<DeploymentStatsHourly>): Promise<void>;
  getHourlyStats(deploymentId: string, startTime: Date, endTime: Date): Promise<DeploymentStatsHourly[]>;

  // API keys
  createApiKey(deploymentId: string, name: string): Promise<{ key: DeploymentApiKey; rawKey: string }>;
  getApiKeyByPrefix(prefix: string): Promise<DeploymentApiKey | undefined>;
  listApiKeys(deploymentId: string): Promise<DeploymentApiKey[]>;
  revokeApiKey(keyId: string): Promise<boolean>;
  updateApiKeyLastUsed(keyId: string): Promise<void>;

  // Feedback
  updatePredictionFeedback(logId: number, feedback: string): Promise<boolean>;
}

/* ------------------------------------------------------------------ */
/*  Row mapping                                                        */
/* ------------------------------------------------------------------ */

function mapRowToDeployment(row: Record<string, unknown>): DeploymentRecord {
  return {
    deploymentId: row.deployment_id as string,
    modelId: row.model_id as string,
    projectId: row.project_id as string,
    name: row.name as string,
    status: row.status as DeploymentStatus,
    containerId: (row.container_id as string) ?? undefined,
    port: (row.port as number) ?? undefined,
    endpointUrl: (row.endpoint_url as string) ?? undefined,
    errorMessage: (row.error_message as string) ?? undefined,
    config: (row.config as Record<string, unknown>) ?? {},
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    stoppedAt: row.stopped_at ? (row.stopped_at as Date).toISOString() : undefined,
  };
}

function mapRowToPredictionLog(row: Record<string, unknown>): PredictionLog {
  return {
    id: Number(row.id),
    deploymentId: row.deployment_id as string,
    modelId: row.model_id as string,
    projectId: row.project_id as string,
    createdAt: (row.created_at as Date).toISOString(),
    latencyMs: (row.latency_ms as number) ?? undefined,
    inputFeatures: row.input_features as Record<string, unknown>,
    prediction: row.prediction as Record<string, unknown>,
    status: row.status as 'success' | 'error',
    errorMessage: (row.error_message as string) ?? undefined,
    feedback: (row.feedback as string) ?? undefined,
    feedbackAt: row.feedback_at ? (row.feedback_at as Date).toISOString() : undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

function mapRowToApiKey(row: Record<string, unknown>): DeploymentApiKey {
  return {
    keyId: row.key_id as string,
    deploymentId: row.deployment_id as string,
    name: row.name as string,
    keyPrefix: row.key_prefix as string,
    keyHash: row.key_hash as string,
    keySalt: row.key_salt as string,
    createdAt: (row.created_at as Date).toISOString(),
    lastUsedAt: row.last_used_at ? (row.last_used_at as Date).toISOString() : undefined,
    revokedAt: row.revoked_at ? (row.revoked_at as Date).toISOString() : undefined,
  };
}

function mapRowToHourlyStats(row: Record<string, unknown>): DeploymentStatsHourly {
  return {
    deploymentId: row.deployment_id as string,
    hourBucket: (row.hour_bucket as Date).toISOString(),
    requestCount: Number(row.request_count),
    errorCount: Number(row.error_count),
    latencyP50: row.latency_p50 != null ? Number(row.latency_p50) : undefined,
    latencyP95: row.latency_p95 != null ? Number(row.latency_p95) : undefined,
    latencyP99: row.latency_p99 != null ? Number(row.latency_p99) : undefined,
    latencyAvg: row.latency_avg != null ? Number(row.latency_avg) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Postgres implementation                                            */
/* ------------------------------------------------------------------ */

class PgDeploymentRepository implements DeploymentRepository {
  /* ---------- Deployments ---------- */

  async create(
    input: Omit<DeploymentRecord, 'deploymentId' | 'createdAt' | 'updatedAt'>,
  ): Promise<DeploymentRecord> {
    const pool = getDbPool();
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO deployments (
        deployment_id, model_id, project_id, name, status,
        container_id, port, endpoint_url, error_message, config, stopped_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        id,
        input.modelId,
        input.projectId,
        input.name,
        input.status,
        input.containerId ?? null,
        input.port ?? null,
        input.endpointUrl ?? null,
        input.errorMessage ?? null,
        JSON.stringify(input.config ?? {}),
        input.stoppedAt ?? null,
      ],
    );
    return mapRowToDeployment(result.rows[0]);
  }

  async getById(deploymentId: string): Promise<DeploymentRecord | undefined> {
    const pool = getDbPool();
    const result = await pool.query('SELECT * FROM deployments WHERE deployment_id = $1', [deploymentId]);
    if (result.rowCount === 0) return undefined;
    return mapRowToDeployment(result.rows[0]);
  }

  async listByProject(projectId: string): Promise<DeploymentRecord[]> {
    const pool = getDbPool();
    const result = await pool.query(
      'SELECT * FROM deployments WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId],
    );
    return result.rows.map(mapRowToDeployment);
  }

  async update(
    deploymentId: string,
    fields: Partial<
      Pick<DeploymentRecord, 'status' | 'containerId' | 'port' | 'endpointUrl' | 'errorMessage' | 'stoppedAt'>
    >,
  ): Promise<DeploymentRecord | undefined> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (fields.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      params.push(fields.status);
    }
    if (fields.containerId !== undefined) {
      setClauses.push(`container_id = $${idx++}`);
      params.push(fields.containerId);
    }
    if (fields.port !== undefined) {
      setClauses.push(`port = $${idx++}`);
      params.push(fields.port);
    }
    if (fields.endpointUrl !== undefined) {
      setClauses.push(`endpoint_url = $${idx++}`);
      params.push(fields.endpointUrl);
    }
    if (fields.errorMessage !== undefined) {
      setClauses.push(`error_message = $${idx++}`);
      params.push(fields.errorMessage);
    }
    if (fields.stoppedAt !== undefined) {
      setClauses.push(`stopped_at = $${idx++}`);
      params.push(fields.stoppedAt);
    }

    if (setClauses.length === 0) return this.getById(deploymentId);

    setClauses.push('updated_at = NOW()');
    params.push(deploymentId);

    const pool = getDbPool();
    const result = await pool.query(
      `UPDATE deployments SET ${setClauses.join(', ')} WHERE deployment_id = $${idx} RETURNING *`,
      params,
    );
    if (result.rowCount === 0) return undefined;
    return mapRowToDeployment(result.rows[0]);
  }

  async delete(deploymentId: string): Promise<boolean> {
    const pool = getDbPool();
    const result = await pool.query('DELETE FROM deployments WHERE deployment_id = $1', [deploymentId]);
    return (result.rowCount ?? 0) > 0;
  }

  async countByProject(projectId: string): Promise<number> {
    const pool = getDbPool();
    const result = await pool.query(
      "SELECT COUNT(*)::int AS count FROM deployments WHERE project_id = $1 AND status NOT IN ('stopped','failed')",
      [projectId],
    );
    return result.rows[0].count as number;
  }

  async listNonStopped(): Promise<DeploymentRecord[]> {
    const pool = getDbPool();
    const result = await pool.query(
      "SELECT * FROM deployments WHERE status NOT IN ('stopped','failed') ORDER BY created_at DESC",
    );
    return result.rows.map(mapRowToDeployment);
  }

  /* ---------- Prediction logs ---------- */

  async insertPredictionLog(log: Omit<PredictionLog, 'id'>): Promise<void> {
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO prediction_logs (
        deployment_id, model_id, project_id, latency_ms,
        input_features, prediction, status, error_message, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        log.deploymentId,
        log.modelId,
        log.projectId,
        log.latencyMs ?? null,
        JSON.stringify(log.inputFeatures),
        JSON.stringify(log.prediction),
        log.status,
        log.errorMessage ?? null,
        JSON.stringify(log.metadata ?? {}),
      ],
    );
  }

  async getPredictionLogs(
    deploymentId: string,
    filters?: PredictionLogFilters,
  ): Promise<{ logs: PredictionLog[]; total: number }> {
    const pool = getDbPool();
    const conditions = ['deployment_id = $1'];
    const params: unknown[] = [deploymentId];
    let idx = 2;

    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.startTime) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(filters.startTime);
    }
    if (filters?.endTime) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(filters.endTime);
    }

    const where = conditions.join(' AND ');
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM prediction_logs WHERE ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      ),
      pool.query(`SELECT COUNT(*) FROM prediction_logs WHERE ${where}`, params),
    ]);

    return {
      logs: dataResult.rows.map(mapRowToPredictionLog),
      total: parseInt(countResult.rows[0].count as string, 10),
    };
  }

  /* ---------- Hourly stats ---------- */

  async upsertHourlyStats(
    deploymentId: string,
    hourBucket: Date,
    stats: Partial<DeploymentStatsHourly>,
  ): Promise<void> {
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO deployment_stats_hourly (
        deployment_id, hour_bucket, request_count, error_count,
        latency_p50, latency_p95, latency_p99, latency_avg
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (deployment_id, hour_bucket)
      DO UPDATE SET
        request_count = deployment_stats_hourly.request_count + EXCLUDED.request_count,
        error_count = deployment_stats_hourly.error_count + EXCLUDED.error_count,
        latency_avg = EXCLUDED.latency_avg`,
      [
        deploymentId,
        hourBucket,
        stats.requestCount ?? 1,
        stats.errorCount ?? 0,
        stats.latencyP50 ?? null,
        stats.latencyP95 ?? null,
        stats.latencyP99 ?? null,
        stats.latencyAvg ?? null,
      ],
    );
  }

  async getHourlyStats(deploymentId: string, startTime: Date, endTime: Date): Promise<DeploymentStatsHourly[]> {
    const pool = getDbPool();
    const result = await pool.query(
      `SELECT * FROM deployment_stats_hourly
       WHERE deployment_id = $1 AND hour_bucket >= $2 AND hour_bucket <= $3
       ORDER BY hour_bucket ASC`,
      [deploymentId, startTime, endTime],
    );
    return result.rows.map(mapRowToHourlyStats);
  }

  /* ---------- API keys ---------- */

  async createApiKey(deploymentId: string, name: string): Promise<{ key: DeploymentApiKey; rawKey: string }> {
    const pool = getDbPool();
    const keyId = randomUUID();
    const rawKey = `ak_${randomBytes(32).toString('hex')}`;
    const prefix = rawKey.substring(0, 11); // "ak_" + 8 hex chars
    const salt = randomBytes(16).toString('hex');
    const hash = createHash('sha256').update(salt + rawKey).digest('hex');

    const result = await pool.query(
      `INSERT INTO deployment_api_keys (
        key_id, deployment_id, name, key_prefix, key_hash, key_salt
      ) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *`,
      [keyId, deploymentId, name, prefix, hash, salt],
    );

    return { key: mapRowToApiKey(result.rows[0]), rawKey };
  }

  async getApiKeyByPrefix(prefix: string): Promise<DeploymentApiKey | undefined> {
    const pool = getDbPool();
    const result = await pool.query('SELECT * FROM deployment_api_keys WHERE key_prefix = $1', [prefix]);
    if (result.rowCount === 0) return undefined;
    return mapRowToApiKey(result.rows[0]);
  }

  async listApiKeys(deploymentId: string): Promise<DeploymentApiKey[]> {
    const pool = getDbPool();
    const result = await pool.query(
      'SELECT * FROM deployment_api_keys WHERE deployment_id = $1 ORDER BY created_at DESC',
      [deploymentId],
    );
    return result.rows.map(mapRowToApiKey);
  }

  async revokeApiKey(keyId: string): Promise<boolean> {
    const pool = getDbPool();
    const result = await pool.query(
      'UPDATE deployment_api_keys SET revoked_at = NOW() WHERE key_id = $1 AND revoked_at IS NULL RETURNING key_id',
      [keyId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updateApiKeyLastUsed(keyId: string): Promise<void> {
    const pool = getDbPool();
    await pool.query('UPDATE deployment_api_keys SET last_used_at = NOW() WHERE key_id = $1', [keyId]);
  }

  /* ---------- Feedback ---------- */

  async updatePredictionFeedback(logId: number, feedback: string): Promise<boolean> {
    const pool = getDbPool();
    const result = await pool.query(
      'UPDATE prediction_logs SET feedback = $1, feedback_at = NOW() WHERE id = $2 RETURNING id',
      [feedback, logId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

/* ------------------------------------------------------------------ */
/*  API key verification helper                                        */
/* ------------------------------------------------------------------ */

export async function verifyApiKey(rawKey: string, repo: DeploymentRepository): Promise<DeploymentApiKey | null> {
  const prefix = rawKey.substring(0, 11);
  const keyRecord = await repo.getApiKeyByPrefix(prefix);
  if (!keyRecord || keyRecord.revokedAt) return null;

  const hash = createHash('sha256').update(keyRecord.keySalt + rawKey).digest('hex');
  if (hash !== keyRecord.keyHash) return null;

  // Update last_used_at (fire-and-forget)
  repo.updateApiKeyLastUsed(keyRecord.keyId).catch(() => {});
  return keyRecord;
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createDeploymentRepository(): DeploymentRepository {
  appLogger.info('[deploymentRepository] Using Postgres backend');
  return new PgDeploymentRepository();
}
