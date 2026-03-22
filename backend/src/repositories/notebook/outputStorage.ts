import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { getDbPool, hasDatabaseConfiguration } from '../../db.js';
import type { OutputRef } from '../../types/notebook.js';
import { ensureDirectory } from '../../utils/fs.js';

import { OUTPUT_DIR, OUTPUT_SIZE_THRESHOLD } from './helpers.js';

// ============================================================
// Large Output Storage
// ============================================================

/**
 * Save a large output to the filesystem and return a reference.
 */
export async function saveLargeOutput(
  cellId: string,
  outputType: string,
  content: Buffer,
  filename: string,
  mimeType?: string
): Promise<OutputRef> {
  const cellOutputDir = join(OUTPUT_DIR, cellId);
  ensureDirectory(cellOutputDir);

  const filePath = join(cellOutputDir, filename);
  writeFileSync(filePath, content);

  // Also record in database for tracking
  if (hasDatabaseConfiguration()) {
    const pool = getDbPool();
    const outputId = randomUUID();
    await pool.query(
      `INSERT INTO cell_outputs (output_id, cell_id, output_type, file_path, mime_type, byte_size)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [outputId, cellId, outputType, filePath, mimeType ?? null, content.length]
    );
  }

  return {
    type: outputType as 'image' | 'html' | 'file',
    ref: `outputs/${cellId}/${filename}`,
    mimeType,
    byteSize: content.length
  };
}

/**
 * Get the filesystem path for a large output.
 */
export function getOutputPath(cellId: string, filename: string): string {
  return join(OUTPUT_DIR, cellId, filename);
}

/**
 * Check if a cell output should be stored externally based on size.
 */
export function shouldStoreExternally(content: string | Buffer): boolean {
  const size = typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : content.length;
  return size > OUTPUT_SIZE_THRESHOLD;
}
