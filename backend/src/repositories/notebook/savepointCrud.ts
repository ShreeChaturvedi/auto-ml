import { getDbPool, hasDatabaseConfiguration } from '../../db.js';

// ============================================================
// Types
// ============================================================

export interface CellSnapshotItem {
  cellId: string;
  content: string;
  position: number;
  cellType: string;
  title: string | null;
}

export interface SavepointRow {
  savepoint_id: string;
  notebook_id: string;
  turn_index: number;
  turn_message_id: string;
  cells_snapshot: CellSnapshotItem[];
  created_at: Date;
}

// ============================================================
// Savepoint Operations
// ============================================================

const MAX_SAVEPOINTS_PER_NOTEBOOK = 50;

/**
 * Create a savepoint by snapshotting the current cells of a notebook.
 * Auto-evicts the oldest savepoints if the notebook exceeds the limit.
 */
export async function createSavepoint(
  notebookId: string,
  turnIndex: number,
  turnMessageId: string
): Promise<SavepointRow> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for savepoint operations');
  }

  const pool = getDbPool();

  // Snapshot current cells (lightweight columns only)
  const cellsResult = await pool.query<{
    cell_id: string;
    content: string;
    position: number;
    cell_type: string;
    title: string | null;
  }>(
    `SELECT cell_id, content, position, cell_type, title
     FROM cells
     WHERE notebook_id = $1
     ORDER BY position ASC`,
    [notebookId]
  );

  const snapshot: CellSnapshotItem[] = cellsResult.rows.map((row) => ({
    cellId: row.cell_id,
    content: row.content,
    position: row.position,
    cellType: row.cell_type,
    title: row.title
  }));

  // Auto-evict oldest BEFORE insert to maintain the cap correctly
  await pool.query(
    `DELETE FROM savepoints
     WHERE savepoint_id IN (
       SELECT savepoint_id FROM savepoints
       WHERE notebook_id = $1
       ORDER BY turn_index ASC
       LIMIT GREATEST(
         (SELECT COUNT(*) FROM savepoints WHERE notebook_id = $1) - $2 + 1,
         0
       )
     )`,
    [notebookId, MAX_SAVEPOINTS_PER_NOTEBOOK]
  );

  // Insert the savepoint
  const insertResult = await pool.query<SavepointRow>(
    `INSERT INTO savepoints (notebook_id, turn_index, turn_message_id, cells_snapshot)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [notebookId, turnIndex, turnMessageId, JSON.stringify(snapshot)]
  );

  return insertResult.rows[0];
}

/**
 * Get a single savepoint by ID, with parsed cells_snapshot.
 */
export async function getSavepoint(savepointId: string): Promise<SavepointRow | null> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for savepoint operations');
  }

  const pool = getDbPool();
  const result = await pool.query<SavepointRow>(
    `SELECT * FROM savepoints WHERE savepoint_id = $1`,
    [savepointId]
  );

  if (!result.rowCount || result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  // Parse cells_snapshot if it comes back as a string
  if (typeof row.cells_snapshot === 'string') {
    row.cells_snapshot = JSON.parse(row.cells_snapshot);
  }

  return row;
}

/**
 * List all savepoints for a notebook, ordered by turn_index ASC.
 */
export async function listSavepoints(
  notebookId: string
): Promise<Array<{
  savepointId: string;
  turnIndex: number;
  turnMessageId: string;
  createdAt: Date;
}>> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for savepoint operations');
  }

  const pool = getDbPool();
  const result = await pool.query<SavepointRow>(
    `SELECT savepoint_id, turn_index, turn_message_id, created_at
     FROM savepoints
     WHERE notebook_id = $1
     ORDER BY turn_index ASC`,
    [notebookId]
  );

  return result.rows.map((row) => ({
    savepointId: row.savepoint_id,
    turnIndex: row.turn_index,
    turnMessageId: row.turn_message_id,
    createdAt: row.created_at
  }));
}

/**
 * Delete all savepoints for a notebook where turn_index > the given threshold.
 */
export async function deleteSavepointsAfter(
  notebookId: string,
  turnIndex: number
): Promise<void> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for savepoint operations');
  }

  const pool = getDbPool();
  await pool.query(
    `DELETE FROM savepoints WHERE notebook_id = $1 AND turn_index > $2`,
    [notebookId, turnIndex]
  );
}
