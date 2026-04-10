import { randomUUID } from 'node:crypto';

import { getDbPool, hasDatabaseConfiguration } from '../../db.js';
import type { Notebook, NotebookKind, NotebookRow } from '../../types/notebook.js';

import { rowToNotebook } from './helpers.js';

// ============================================================
// Notebook Operations
// ============================================================

export interface CreateNotebookOptions {
  name?: string;
  metadata?: Record<string, unknown>;
  kind?: NotebookKind;
}

export interface ListNotebooksOptions {
  kind?: NotebookKind;
}

/**
 * List notebooks for a project, optionally filtered by kind.
 */
export async function listNotebooksByProject(
  projectId: string,
  options: ListNotebooksOptions = {}
): Promise<Notebook[]> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for notebook operations');
  }

  const pool = getDbPool();
  if (options.kind) {
    const result = await pool.query<NotebookRow>(
      `SELECT * FROM notebooks WHERE project_id = $1 AND kind = $2 ORDER BY created_at ASC`,
      [projectId, options.kind]
    );
    return result.rows.map(rowToNotebook);
  }

  const result = await pool.query<NotebookRow>(
    `SELECT * FROM notebooks WHERE project_id = $1 ORDER BY created_at ASC`,
    [projectId]
  );
  return result.rows.map(rowToNotebook);
}

/**
 * Create a notebook in a project.
 */
export async function createNotebook(
  projectId: string,
  options: CreateNotebookOptions = {}
): Promise<Notebook> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for notebook operations');
  }

  const pool = getDbPool();
  const notebookId = randomUUID();
  const kind: NotebookKind = options.kind ?? 'phase';
  const trimmedName = options.name?.trim();
  let notebookName = trimmedName;

  if (!notebookName) {
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notebooks WHERE project_id = $1 AND kind = $2`,
      [projectId, kind]
    );
    const sequence = Number(countResult.rows[0]?.count ?? '0') + 1;
    notebookName = kind === 'standalone' ? `Untitled ${sequence}` : `Notebook ${sequence}`;
  }

  const result = await pool.query<NotebookRow>(
    `INSERT INTO notebooks (notebook_id, project_id, name, kind, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [notebookId, projectId, notebookName, kind, options.metadata ?? {}]
  );

  return rowToNotebook(result.rows[0]);
}

/**
 * Get notebook by ID.
 */
export async function getNotebook(notebookId: string): Promise<Notebook | null> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for notebook operations');
  }

  const pool = getDbPool();
  const result = await pool.query<NotebookRow>(
    `SELECT * FROM notebooks WHERE notebook_id = $1`,
    [notebookId]
  );

  if (!result.rowCount || result.rowCount === 0) {
    return null;
  }

  return rowToNotebook(result.rows[0]);
}

/**
 * Get notebook by project ID.
 */
export async function getNotebookByProject(projectId: string): Promise<Notebook | null> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for notebook operations');
  }

  const pool = getDbPool();
  const result = await pool.query<NotebookRow>(
    `SELECT * FROM notebooks WHERE project_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [projectId]
  );

  if (!result.rowCount || result.rowCount === 0) {
    return null;
  }

  return rowToNotebook(result.rows[0]);
}

/**
 * Update notebook metadata.
 */
export async function updateNotebook(
  notebookId: string,
  updates: { name?: string; metadata?: Record<string, unknown> }
): Promise<Notebook> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for notebook operations');
  }

  const pool = getDbPool();
  const existingNotebook = await getNotebook(notebookId);
  if (!existingNotebook) {
    throw new Error('Notebook not found');
  }
  const setClauses: string[] = [];
  const values: unknown[] = [notebookId];
  let paramIndex = 2;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }

  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIndex++}`);
    values.push({
      ...(existingNotebook.metadata ?? {}),
      ...updates.metadata
    });
  }

  if (setClauses.length === 0) {
    return existingNotebook;
  }

  const result = await pool.query<NotebookRow>(
    `UPDATE notebooks
     SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE notebook_id = $1
     RETURNING *`,
    values
  );

  return rowToNotebook(result.rows[0]);
}

/**
 * Delete a notebook and all its cells.
 */
export async function deleteNotebook(notebookId: string): Promise<void> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for notebook operations');
  }

  const pool = getDbPool();
  await pool.query(`DELETE FROM notebooks WHERE notebook_id = $1`, [notebookId]);
}
