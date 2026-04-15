import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';
import type { ModelArtifact, ModelRecord } from '../types/model.js';
import { ensureDirectoryForFile } from '../utils/fs.js';

const toJsonb = (v: unknown) => v != null ? JSON.stringify(v) : null;

/** Return the highest version number for a project within a list of models. */
function maxVersion(models: Iterable<ModelRecord>, projectId: string): number {
  let max = 0;
  for (const m of models) {
    if (m.projectId === projectId && typeof m.version === 'number' && m.version > max) {
      max = m.version;
    }
  }
  return max;
}

export interface ModelRepository {
  list(projectId?: string): Promise<ModelRecord[]>;
  getById(modelId: string): Promise<ModelRecord | undefined>;
  create(input: Omit<ModelRecord, 'modelId' | 'createdAt' | 'updatedAt'>): Promise<ModelRecord>;
  update(
    modelId: string,
    updater: (current: ModelRecord) => ModelRecord
  ): Promise<ModelRecord | undefined>;
  delete(modelId: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class InMemoryModelRepository implements ModelRepository {
  private readonly models = new Map<string, ModelRecord>();

  async list(projectId?: string): Promise<ModelRecord[]> {
    const all = Array.from(this.models.values());
    return projectId ? all.filter((model) => model.projectId === projectId) : all;
  }

  async getById(modelId: string): Promise<ModelRecord | undefined> {
    return this.models.get(modelId);
  }

  async create(input: Omit<ModelRecord, 'modelId' | 'createdAt' | 'updatedAt'>): Promise<ModelRecord> {
    const now = new Date().toISOString();
    const model: ModelRecord = {
      ...input,
      modelId: randomUUID(),
      version: input.version ?? maxVersion(this.models.values(), input.projectId) + 1,
      createdAt: now,
      updatedAt: now
    };
    this.models.set(model.modelId, model);
    return model;
  }

  async update(
    modelId: string,
    updater: (current: ModelRecord) => ModelRecord
  ): Promise<ModelRecord | undefined> {
    const current = this.models.get(modelId);
    if (!current) return undefined;
    const updated = {
      ...updater(current),
      modelId: current.modelId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    };
    this.models.set(modelId, updated);
    return updated;
  }

  async delete(modelId: string): Promise<boolean> {
    return this.models.delete(modelId);
  }

  async clear(): Promise<void> {
    this.models.clear();
  }
}

export class FileModelRepository implements ModelRepository {
  constructor(private readonly metadataPath: string) {
    ensureDirectoryForFile(metadataPath);
    if (!existsSync(metadataPath)) {
      writeFileSync(metadataPath, JSON.stringify([], null, 2), 'utf8');
    }
  }

  private readAll(): ModelRecord[] {
    try {
      const raw = readFileSync(this.metadataPath, 'utf8');
      if (!raw.trim()) return [];
      return JSON.parse(raw) as ModelRecord[];
    } catch (error) {
      appLogger.error('[modelRepository] Failed to read metadata', error);
      return [];
    }
  }

  private writeAll(models: ModelRecord[]) {
    ensureDirectoryForFile(this.metadataPath);
    writeFileSync(this.metadataPath, JSON.stringify(models, null, 2), 'utf8');
  }

  async list(projectId?: string): Promise<ModelRecord[]> {
    const all = this.readAll();
    return projectId ? all.filter((model) => model.projectId === projectId) : all;
  }

  async getById(modelId: string): Promise<ModelRecord | undefined> {
    return this.readAll().find((model) => model.modelId === modelId);
  }

  async create(input: Omit<ModelRecord, 'modelId' | 'createdAt' | 'updatedAt'>): Promise<ModelRecord> {
    const now = new Date().toISOString();
    const all = this.readAll();
    const version = input.version ?? maxVersion(all, input.projectId) + 1;
    const model: ModelRecord = {
      ...input,
      modelId: randomUUID(),
      version,
      createdAt: now,
      updatedAt: now
    };
    all.push(model);
    this.writeAll(all);
    return model;
  }

  async update(
    modelId: string,
    updater: (current: ModelRecord) => ModelRecord
  ): Promise<ModelRecord | undefined> {
    const all = this.readAll();
    const index = all.findIndex((model) => model.modelId === modelId);
    if (index === -1) return undefined;
    const current = all[index];
    const updated = {
      ...updater(current),
      modelId: current.modelId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    };
    all[index] = updated;
    this.writeAll(all);
    return updated;
  }

  async delete(modelId: string): Promise<boolean> {
    const all = this.readAll();
    const index = all.findIndex((model) => model.modelId === modelId);
    if (index === -1) return false;
    all.splice(index, 1);
    this.writeAll(all);
    return true;
  }

  async clear(): Promise<void> {
    this.writeAll([]);
  }
}

export class PgModelRepository implements ModelRepository {
  private readonly table = 'models';
  private columnCache: Promise<Set<string>> | null = null;

  private async getColumns(): Promise<Set<string>> {
    if (!this.columnCache) {
      this.columnCache = (async () => {
        const pool = getDbPool();
        const result = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
          [this.table]
        );
        return new Set(result.rows.map((row) => String(row.column_name)));
      })();
    }
    return this.columnCache;
  }

  private mapRowToModel(row: Record<string, unknown>): ModelRecord {
    const record: ModelRecord = {
      modelId: row.model_id as string,
      projectId: row.project_id as string,
      datasetId: row.dataset_id as string,
      name: row.name as string,
      templateId: row.template_id as string,
      taskType: row.task_type as ModelRecord['taskType'],
      library: row.library as string,
      algorithm: row.algorithm as string,
      parameters: (row.parameters as Record<string, unknown>) ?? {},
      metrics: (row.metrics as Record<string, number>) ?? {},
      status: row.status as ModelRecord['status'],
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };

    if (row.version != null) record.version = row.version as number;
    if (row.training_ms != null) record.trainingMs = row.training_ms as number;
    if (row.target_column != null) record.targetColumn = row.target_column as string;
    if (row.feature_columns != null) record.featureColumns = row.feature_columns as string[];
    if (row.sample_count != null) record.sampleCount = row.sample_count as number;
    if (row.artifact != null) record.artifact = row.artifact as ModelArtifact;
    if (row.error != null) record.error = row.error as string;
    if (row.metadata != null) record.metadata = row.metadata as Record<string, unknown>;
    if (row.evaluation_status != null) record.evaluationStatus = row.evaluation_status as ModelRecord['evaluationStatus'];
    if (row.evaluation_computed_at != null) record.evaluationComputedAt = (row.evaluation_computed_at as Date).toISOString();
    if (row.evaluation_error != null) record.evaluationError = row.evaluation_error as string;
    if (row.feature_types != null) record.featureTypes = row.feature_types as Record<string, 'float' | 'int' | 'str'>;
    if (row.sample_request != null) record.sampleRequest = row.sample_request as Record<string, unknown>;

    return record;
  }

  async list(projectId?: string): Promise<ModelRecord[]> {
    const pool = getDbPool();
    if (projectId) {
      const result = await pool.query(
        `SELECT * FROM ${this.table} WHERE project_id = $1 ORDER BY created_at ASC`,
        [projectId]
      );
      return result.rows.map((row) => this.mapRowToModel(row));
    }
    const result = await pool.query(`SELECT * FROM ${this.table} ORDER BY created_at ASC`);
    return result.rows.map((row) => this.mapRowToModel(row));
  }

  async getById(modelId: string): Promise<ModelRecord | undefined> {
    const pool = getDbPool();
    const result = await pool.query(
      `SELECT * FROM ${this.table} WHERE model_id = $1`,
      [modelId]
    );
    if (result.rowCount === 0) return undefined;
    return this.mapRowToModel(result.rows[0]);
  }

  async create(input: Omit<ModelRecord, 'modelId' | 'createdAt' | 'updatedAt'>): Promise<ModelRecord> {
    const pool = getDbPool();
    const id = randomUUID();
    const columns = await this.getColumns();

    const insertColumns = [
      'model_id', 'project_id', 'dataset_id', 'name', 'template_id', 'task_type',
      'library', 'algorithm', 'parameters', 'metrics', 'status',
      'version', 'training_ms', 'target_column', 'feature_columns', 'sample_count',
      'artifact', 'error', 'metadata', 'evaluation_status', 'evaluation_computed_at', 'evaluation_error'
    ];
    const insertValues: unknown[] = [
      id, input.projectId, input.datasetId, input.name, input.templateId, input.taskType,
      input.library, input.algorithm, input.parameters ?? {}, input.metrics ?? {}, input.status,
      input.version ?? null, input.trainingMs ?? null, input.targetColumn ?? null, toJsonb(input.featureColumns), input.sampleCount ?? null,
      input.artifact ?? null, input.error ?? null, input.metadata ?? null,
      input.evaluationStatus ?? null, input.evaluationComputedAt ?? null, input.evaluationError ?? null
    ];

    if (columns.has('feature_types')) {
      insertColumns.push('feature_types');
      insertValues.push(toJsonb(input.featureTypes ?? null));
    }
    if (columns.has('sample_request')) {
      insertColumns.push('sample_request');
      insertValues.push(toJsonb(input.sampleRequest ?? null));
    }

    const placeholders = insertColumns.map((column, index) => {
      if (column === 'version') {
        return `COALESCE($${index + 1}, (SELECT COALESCE(MAX(version), 0) + 1 FROM ${this.table} WHERE project_id = $2))`;
      }
      return `$${index + 1}`;
    });

    const result = await pool.query(
      `INSERT INTO ${this.table} (
        ${insertColumns.join(', ')}
      ) VALUES (
        ${placeholders.join(', ')}
      ) RETURNING *`,
      insertValues
    );
    return this.mapRowToModel(result.rows[0]);
  }

  async update(
    modelId: string,
    updater: (current: ModelRecord) => ModelRecord
  ): Promise<ModelRecord | undefined> {
    const current = await this.getById(modelId);
    if (!current) return undefined;

    const updated = updater(current);
    const pool = getDbPool();
    const columns = await this.getColumns();

    const updateColumns = [
      'project_id', 'dataset_id', 'name', 'template_id', 'task_type',
      'library', 'algorithm', 'parameters', 'metrics', 'status',
      'version', 'training_ms', 'target_column', 'feature_columns', 'sample_count',
      'artifact', 'error', 'metadata',
      'evaluation_status', 'evaluation_computed_at', 'evaluation_error'
    ];
    const updateValues: unknown[] = [
      updated.projectId, updated.datasetId, updated.name, updated.templateId, updated.taskType,
      updated.library, updated.algorithm, updated.parameters ?? {}, updated.metrics ?? {}, updated.status,
      updated.version ?? null, updated.trainingMs ?? null, updated.targetColumn ?? null, toJsonb(updated.featureColumns), updated.sampleCount ?? null,
      updated.artifact ?? null, updated.error ?? null, updated.metadata ?? null,
      updated.evaluationStatus ?? null, updated.evaluationComputedAt ?? null, updated.evaluationError ?? null
    ];

    if (columns.has('feature_types')) {
      updateColumns.push('feature_types');
      updateValues.push(toJsonb(updated.featureTypes ?? null));
    }
    if (columns.has('sample_request')) {
      updateColumns.push('sample_request');
      updateValues.push(toJsonb(updated.sampleRequest ?? null));
    }

    const assignments = updateColumns.map((column, index) => `${column} = $${index + 2}`);
    const result = await pool.query(
      `UPDATE ${this.table} SET
        ${assignments.join(', ')},
        updated_at = NOW()
      WHERE model_id = $1
      RETURNING *`,
      [modelId, ...updateValues]
    );

    if (result.rowCount === 0) return undefined;
    return this.mapRowToModel(result.rows[0]);
  }

  async delete(modelId: string): Promise<boolean> {
    const pool = getDbPool();
    const result = await pool.query(
      `DELETE FROM ${this.table} WHERE model_id = $1`,
      [modelId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async clear(): Promise<void> {
    const pool = getDbPool();
    await pool.query(`DELETE FROM ${this.table}`);
  }
}

export function createModelRepository(metadataPath: string): ModelRepository {
  if (hasDatabaseConfiguration()) {
    try {
      appLogger.info('[modelRepository] Using Postgres backend');
      return new PgModelRepository();
    } catch (error) {
      appLogger.error('[modelRepository] Postgres failed, falling back to file storage', error);
    }
  }

  return new FileModelRepository(metadataPath);
}
