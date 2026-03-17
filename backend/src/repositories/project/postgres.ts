import { randomUUID } from 'node:crypto';

import { getDbPool } from '../../db.js';
import type { CreateProjectInput, Project } from '../../types/project.js';

import { sanitizeMetadata } from './types.js';
import type { ProjectRepository } from './types.js';

export class PgProjectRepository implements ProjectRepository {
  private readonly table = 'projects';
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

  private buildSelectColumns(columns: Set<string>) {
    const select = ['project_id', 'name', 'description', 'metadata', 'created_at', 'updated_at'];
    if (columns.has('icon')) {
      select.push('icon');
    }
    if (columns.has('color')) {
      select.push('color');
    }
    return select;
  }

  async list(): Promise<Project[]> {
    const pool = getDbPool();
    const columns = await this.getColumns();
    const selectColumns = this.buildSelectColumns(columns);
    const result = await pool.query(
      `SELECT ${selectColumns.join(', ')} FROM ${this.table} ORDER BY created_at ASC`
    );

    return result.rows.map((row) => ({
      id: row.project_id,
      name: row.name,
      description: row.description ?? undefined,
      icon: row.icon ?? 'Folder',
      color: row.color ?? 'blue',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      metadata: sanitizeMetadata(row.metadata ?? undefined)
    }));
  }

  async getById(id: string): Promise<Project | undefined> {
    const pool = getDbPool();
    const columns = await this.getColumns();
    const selectColumns = this.buildSelectColumns(columns);
    const result = await pool.query(
      `SELECT ${selectColumns.join(', ')} FROM ${this.table} WHERE project_id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      return undefined;
    }
    const row = result.rows[0];
    return {
      id: row.project_id,
      name: row.name,
      description: row.description ?? undefined,
      icon: row.icon ?? 'Folder',
      color: row.color ?? 'blue',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      metadata: sanitizeMetadata(row.metadata ?? undefined)
    };
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const pool = getDbPool();
    const id = randomUUID();
    const metadata = sanitizeMetadata(input.metadata);
    const columns = await this.getColumns();

    const insertColumns = ['project_id', 'name', 'description', 'metadata'];
    const values: unknown[] = [id, input.name, input.description ?? null, metadata ?? {}];
    if (columns.has('icon')) {
      insertColumns.push('icon');
      values.push(input.icon ?? 'Folder');
    }
    if (columns.has('color')) {
      insertColumns.push('color');
      values.push(input.color ?? 'blue');
    }

    const result = await pool.query(
      `INSERT INTO ${this.table} (${insertColumns.join(', ')})
       VALUES (${insertColumns.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING ${this.buildSelectColumns(columns).join(', ')}`,
      values
    );

    const row = result.rows[0];
    return {
      id: row.project_id,
      name: row.name,
      description: row.description ?? undefined,
      icon: row.icon ?? 'Folder',
      color: row.color ?? 'blue',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      metadata: sanitizeMetadata(row.metadata ?? undefined)
    };
  }

  async update(id: string, input: Partial<CreateProjectInput>): Promise<Project | undefined> {
    const existing = await this.getById(id);
    if (!existing) {
      return undefined;
    }

    const pool = getDbPool();
    const mergedMetadata = sanitizeMetadata({
      ...(existing.metadata ?? {}),
      ...(input.metadata ?? {})
    });
    const columns = await this.getColumns();

    const updates: string[] = [];
    const values: unknown[] = [id];
    let index = 2;

    updates.push(`name = COALESCE($${index++}, name)`);
    values.push(input.name ?? null);

    updates.push(`description = COALESCE($${index++}, description)`);
    values.push(input.description ?? null);

    if (columns.has('icon')) {
      updates.push(`icon = COALESCE($${index++}, icon)`);
      values.push(input.icon ?? null);
    }

    if (columns.has('color')) {
      updates.push(`color = COALESCE($${index++}, color)`);
      values.push(input.color ?? null);
    }

    updates.push(`metadata = $${index++}`);
    values.push(mergedMetadata ?? {});

    const result = await pool.query(
      `UPDATE ${this.table}
       SET ${updates.join(', ')},
           updated_at = NOW()
       WHERE project_id = $1
       RETURNING ${this.buildSelectColumns(columns).join(', ')}`,
      values
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    const row = result.rows[0];
    return {
      id: row.project_id,
      name: row.name,
      description: row.description ?? undefined,
      icon: row.icon ?? 'Folder',
      color: row.color ?? 'blue',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      metadata: sanitizeMetadata(row.metadata ?? undefined)
    };
  }

  async delete(id: string): Promise<boolean> {
    const pool = getDbPool();
    const result = await pool.query(`DELETE FROM ${this.table} WHERE project_id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async clear(): Promise<void> {
    const pool = getDbPool();
    await pool.query(`DELETE FROM ${this.table}`);
  }
}
