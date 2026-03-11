import { getDbPool, hasDatabaseConfiguration } from '../../db.js';

// ============================================================
// Cell Locking
// ============================================================

/**
 * Attempt to acquire a lock on a cell.
 * Returns true if lock was acquired, false if already locked.
 */
export async function lockCell(cellId: string, lockedBy: string): Promise<boolean> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();

  // Use conditional update to atomically acquire lock only if not locked
  const result = await pool.query(
    `UPDATE cells
     SET locked_by = $2, locked_at = NOW(), updated_at = NOW()
     WHERE cell_id = $1 AND (locked_by IS NULL OR locked_at < NOW() - INTERVAL '1 minute')
     RETURNING cell_id`,
    [cellId, lockedBy]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Release a lock on a cell.
 */
export async function unlockCell(cellId: string): Promise<void> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();
  await pool.query(
    `UPDATE cells SET locked_by = NULL, locked_at = NULL, updated_at = NOW() WHERE cell_id = $1`,
    [cellId]
  );
}

/**
 * Check if a cell is locked and by whom.
 */
export async function getCellLock(cellId: string): Promise<{ locked: boolean; by?: string; at?: Date }> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();
  const result = await pool.query<{ locked_by: string | null; locked_at: Date | null }>(
    `SELECT locked_by, locked_at FROM cells WHERE cell_id = $1`,
    [cellId]
  );

  if (!result.rowCount || result.rowCount === 0) {
    return { locked: false };
  }

  const row = result.rows[0];
  if (!row.locked_by) {
    return { locked: false };
  }

  // Check if lock has expired (1 minute timeout)
  const lockAge = row.locked_at ? Date.now() - row.locked_at.getTime() : 0;
  if (lockAge > 60000) {
    return { locked: false };
  }

  return { locked: true, by: row.locked_by, at: row.locked_at ?? undefined };
}
