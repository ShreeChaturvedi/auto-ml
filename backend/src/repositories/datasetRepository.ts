import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { Mutex } from 'async-mutex';

import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';
import type { DatasetProfile, DatasetProfileInput } from '../types/dataset.js';
import { ensureDirectoryForFile } from '../utils/fs.js';

/**
 * Process-local mutex guarding file-backed dataset metadata writes.
 *
 * Scope: this mutex serialises `create`/`update`/`delete` within a SINGLE
 * Node process only. It will NOT protect against corruption if multiple
 * Node processes share the same metadata JSON file.
 *
 * `FileDatasetRepository` is a development-only fallback — production
 * deployments configure `DATABASE_URL` and use `PgDatasetRepository`,
 * which relies on Postgres transactions for concurrency. Multi-process
 * dev deployments (e.g. clustered `node` workers) should also set
 * `DATABASE_URL` to avoid the file-store race window.
 */
const fileDatasetMutex = new Mutex();

export interface DatasetRepository {
  list(): Promise<DatasetProfile[]>;
  listByProject(projectId: string): Promise<DatasetProfile[]>;
  get(datasetId: string): Promise<DatasetProfile | undefined>;
  getById(datasetId: string): Promise<DatasetProfile | undefined>;  // Alias for get
  create(input: DatasetProfileInput): Promise<DatasetProfile>;
  update(
    datasetId: string,
    updater: (current: DatasetProfile) => DatasetProfile
  ): Promise<DatasetProfile | undefined>;
  delete(datasetId: string): Promise<boolean>;
}

export class FileDatasetRepository implements DatasetRepository {
  constructor(private readonly metadataPath: string) {
    ensureDirectoryForFile(metadataPath);
    if (!existsSync(metadataPath)) {
      writeFileSync(metadataPath, JSON.stringify([], null, 2), 'utf8');
    }
  }

  private readAll(): DatasetProfile[] {
    try {
      const raw = readFileSync(this.metadataPath, 'utf8');
      if (!raw.trim()) return [];
      const data = JSON.parse(raw) as DatasetProfile[];
      return data;
    } catch (error) {
      appLogger.error('[datasetRepository] Failed to read metadata', error);
      return [];
    }
  }

  private writeAll(profiles: DatasetProfile[]) {
    ensureDirectoryForFile(this.metadataPath);
    writeFileSync(this.metadataPath, JSON.stringify(profiles, null, 2), 'utf8');
  }

  async list(): Promise<DatasetProfile[]> {
    return this.readAll();
  }

  async listByProject(projectId: string): Promise<DatasetProfile[]> {
    return this.readAll().filter((dataset) => dataset.projectId === projectId);
  }

  async get(datasetId: string): Promise<DatasetProfile | undefined> {
    return this.readAll().find((dataset) => dataset.datasetId === datasetId);
  }

  async getById(datasetId: string): Promise<DatasetProfile | undefined> {
    return this.get(datasetId);
  }

  async create(input: DatasetProfileInput): Promise<DatasetProfile> {
    return fileDatasetMutex.runExclusive(() => {
      const now = new Date().toISOString();
      const dataset: DatasetProfile = {
        datasetId: randomUUID(),
        projectId: input.projectId,
        filename: input.filename,
        fileType: input.fileType,
        size: input.size,
        nRows: input.profile.nRows,
        nCols: input.profile.columns.length,
        columns: input.profile.columns,
        sample: input.profile.sample,
        createdAt: now,
        updatedAt: now,
        metadata: input.metadata
      };

      const all = this.readAll();
      all.push(dataset);
      this.writeAll(all);
      return dataset;
    });
  }

  async update(
    datasetId: string,
    updater: (current: DatasetProfile) => DatasetProfile
  ): Promise<DatasetProfile | undefined> {
    return fileDatasetMutex.runExclusive(() => {
      const all = this.readAll();
      const index = all.findIndex((dataset) => dataset.datasetId === datasetId);
      if (index === -1) return undefined;

      const current = all[index];
      const updated = updater(current);
      all[index] = {
        ...updated,
        datasetId: current.datasetId,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
      };
      this.writeAll(all);
      return all[index];
    });
  }

  async delete(datasetId: string): Promise<boolean> {
    return fileDatasetMutex.runExclusive(() => {
      const all = this.readAll();
      const index = all.findIndex((dataset) => dataset.datasetId === datasetId);
      if (index === -1) return false;

      all.splice(index, 1);
      this.writeAll(all);
      return true;
    });
  }
}

class PgDatasetRepository implements DatasetRepository {
  private readonly table = 'datasets';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRow(row: any): DatasetProfile {
    const profile = (row.profile ?? {}) as {
      columns?: DatasetProfile['columns'];
      sample?: DatasetProfile['sample'];
      metadata?: Record<string, unknown>;
    };

    return {
      datasetId: row.dataset_id,
      projectId: row.project_id ?? undefined,
      filename: row.filename,
      fileType: row.file_type,
      size: Number(row.byte_size ?? 0),
      nRows: row.row_count ?? 0,
      nCols: row.column_count ?? 0,
      columns: profile.columns ?? [],
      sample: profile.sample ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      metadata: profile.metadata
    };
  }

  async list(): Promise<DatasetProfile[]> {
    const pool = getDbPool();
    const result = await pool.query(
      `SELECT dataset_id,
              project_id,
              filename,
              file_type,
              byte_size,
              row_count,
              column_count,
              profile,
              created_at,
              updated_at
       FROM ${this.table}
       ORDER BY created_at ASC`
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async listByProject(projectId: string): Promise<DatasetProfile[]> {
    const pool = getDbPool();
    const result = await pool.query(
      `SELECT dataset_id,
              project_id,
              filename,
              file_type,
              byte_size,
              row_count,
              column_count,
              profile,
              created_at,
              updated_at
       FROM ${this.table}
       WHERE project_id = $1
       ORDER BY created_at ASC`,
      [projectId]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async get(datasetId: string): Promise<DatasetProfile | undefined> {
    const pool = getDbPool();
    const result = await pool.query(
      `SELECT dataset_id,
              project_id,
              filename,
              file_type,
              byte_size,
              row_count,
              column_count,
              profile,
              created_at,
              updated_at
       FROM ${this.table}
       WHERE dataset_id = $1`,
      [datasetId]
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    return this.mapRow(result.rows[0]);
  }

  async create(input: DatasetProfileInput): Promise<DatasetProfile> {
    const pool = getDbPool();
    const datasetId = randomUUID();
    const profileJson = {
      columns: input.profile.columns,
      sample: input.profile.sample,
      metadata: input.metadata ?? {}
    };

    const result = await pool.query(
      `INSERT INTO ${this.table} (
         dataset_id,
         project_id,
         filename,
         file_type,
         byte_size,
         row_count,
         column_count,
         profile
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING dataset_id,
                 project_id,
                 filename,
                 file_type,
                 byte_size,
                 row_count,
                 column_count,
                 profile,
                 created_at,
                 updated_at`,
      [
        datasetId,
        input.projectId ?? null,
        input.filename,
        input.fileType,
        input.size,
        input.profile.nRows,
        input.profile.columns.length,
        profileJson
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async update(
    datasetId: string,
    updater: (current: DatasetProfile) => DatasetProfile
  ): Promise<DatasetProfile | undefined> {
    const existing = await this.get(datasetId);
    if (!existing) return undefined;

    const next = updater(existing);
    const pool = getDbPool();
    const profileJson = {
      columns: next.columns,
      sample: next.sample,
      metadata: next.metadata ?? {}
    };

    const result = await pool.query(
      `UPDATE ${this.table}
       SET filename = $2,
           file_type = $3,
           byte_size = $4,
           row_count = $5,
           column_count = $6,
           profile = $7,
           updated_at = NOW()
       WHERE dataset_id = $1
       RETURNING dataset_id,
                 project_id,
                 filename,
                 file_type,
                 byte_size,
                 row_count,
                 column_count,
                 profile,
                 created_at,
                 updated_at`,
      [
        datasetId,
        next.filename,
        next.fileType,
        next.size,
        next.nRows,
        next.nCols,
        profileJson
      ]
    );

    if (result.rowCount === 0) return undefined;

    return this.mapRow(result.rows[0]);
  }

  async getById(datasetId: string): Promise<DatasetProfile | undefined> {
    return this.get(datasetId);
  }

  async delete(datasetId: string): Promise<boolean> {
    const pool = getDbPool();
    const result = await pool.query(
      `DELETE FROM ${this.table} WHERE dataset_id = $1`,
      [datasetId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export function createDatasetRepository(metadataPath: string): DatasetRepository {
  if (hasDatabaseConfiguration()) {
    try {
      return new PgDatasetRepository();
    } catch (error) {
      appLogger.error('[datasetRepository] Failed to create Postgres dataset repository, falling back to file store', error);
    }
  }

  return new FileDatasetRepository(metadataPath);
}
