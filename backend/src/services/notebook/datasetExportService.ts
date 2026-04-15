import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';

import { env } from '../../config.js';
import { appLogger } from '../../logging/logger.js';
import { createDatasetRepository, type DatasetRepository } from '../../repositories/datasetRepository.js';
import type { Notebook } from '../../types/notebook.js';
import { parseDatasetRows } from '../datasetLoader.js';
import { profileDatasetRows } from '../datasetProfiler.js';

// ============================================================
// Types
// ============================================================

/**
 * Compact summary shipped back with the cell-run HTTP response so the
 * frontend can toast/refresh immediately after a standalone notebook
 * exports a DataFrame via `save_to_project(...)`.
 */
export interface ExportedDatasetSummary {
  id: string;
  name: string;
  rows: number;
  cols: number;
}

interface ManifestEntry {
  name: string;
  rows: number;
  cols: number;
  timestamp?: number;
  exportId?: string;
}

// ============================================================
// Constants
// ============================================================

const EXPORT_DIR_NAME = '_exports';
const MANIFEST_FILE = '.manifest.json';
// Disallow path segments — the kernel helper already validates the user
// input, but we defend here against a compromised manifest.
const SAFE_CSV_NAME = /^[\w\- .]+\.csv$/;

// ============================================================
// Singleton repository (matches pattern used by sibling notebook services)
// ============================================================

const datasetRepository: DatasetRepository = createDatasetRepository(env.datasetMetadataPath);

// ============================================================
// Public API
// ============================================================

/**
 * Drain the `_exports/.manifest.json` file for a standalone notebook's
 * project, persisting each manifest entry as a new project dataset. Called
 * by the cell-run HTTP route handler after `executeCell` returns.
 *
 * Non-standalone notebooks are skipped defensively so phase notebooks can
 * never accidentally import exported files.
 *
 * Never throws — all errors are logged and the entry is skipped so a
 * bad export cannot break the cell-run response.
 */
export async function processNotebookExports(
  notebook: Notebook,
  projectId: string
): Promise<ExportedDatasetSummary[]> {
  if (notebook.kind !== 'standalone') {
    return [];
  }

  const workspacePath = path.join(env.executionWorkspaceDir, projectId);
  const exportDir = path.join(workspacePath, EXPORT_DIR_NAME);
  const manifestPath = path.join(exportDir, MANIFEST_FILE);

  let manifestRaw: string;
  try {
    manifestRaw = await fs.readFile(manifestPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    appLogger.warn('[datasetExport] Failed to read manifest', error);
    return [];
  }

  let entries: ManifestEntry[];
  try {
    const parsed = JSON.parse(manifestRaw);
    if (!Array.isArray(parsed)) {
      appLogger.warn('[datasetExport] Manifest is not an array, skipping');
      return [];
    }
    entries = parsed as ManifestEntry[];
  } catch (error) {
    appLogger.warn('[datasetExport] Failed to parse manifest JSON', error);
    return [];
  }

  const summaries: ExportedDatasetSummary[] = [];
  const exportDirResolved = await safeRealpath(exportDir);

  for (const entry of entries) {
    const summary = await persistManifestEntry(entry, {
      projectId,
      exportDir,
      exportDirResolved
    });
    if (summary) {
      summaries.push(summary);
    }
  }

  // Drop the manifest once we've processed it; CSVs stay behind and are
  // cleaned up when the container is destroyed.
  try {
    await fs.unlink(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      appLogger.warn('[datasetExport] Failed to delete manifest after processing', error);
    }
  }

  return summaries;
}

// ============================================================
// Internal helpers
// ============================================================

interface PersistContext {
  projectId: string;
  exportDir: string;
  exportDirResolved: string | null;
}

async function persistManifestEntry(
  entry: ManifestEntry,
  ctx: PersistContext
): Promise<ExportedDatasetSummary | null> {
  if (!entry || typeof entry.name !== 'string') {
    appLogger.warn('[datasetExport] Skipping manifest entry with no name');
    return null;
  }

  const name = entry.name;
  if (!SAFE_CSV_NAME.test(name) || name.includes('..') || name.includes('/') || name.includes('\\')) {
    // Name failed the safety regex — we can't even safely build a path to
    // unlink, so skip cleanup entirely. An unsafe name can't have a matching
    // file on disk that we'd want to touch.
    appLogger.warn('[datasetExport] Skipping manifest entry with unsafe name', { name });
    return null;
  }

  // From here on, `csvPath` is the canonical source to clean up on ANY
  // failure branch. We prefer the resolved real path once available, but
  // fall back to the unresolved path for early failures — `unlink` is
  // idempotent (ENOENT is ignored) so a missing file is harmless.
  const csvPath = path.join(ctx.exportDir, name);
  let cleanupPath = csvPath;

  // Reject symlinks / non-regular files — the kernel writes plain files
  // via `df.to_csv`, so anything else is either a stale artifact or an
  // attack.
  let lstat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    lstat = await fs.lstat(csvPath);
  } catch (error) {
    appLogger.warn('[datasetExport] Skipping missing export file', { name, error });
    await bestEffortUnlinkCsv(cleanupPath, name);
    return null;
  }
  if (!lstat.isFile()) {
    appLogger.warn('[datasetExport] Skipping non-regular export file', { name });
    await bestEffortUnlinkCsv(cleanupPath, name);
    return null;
  }

  // Ensure the resolved real path stays beneath the export directory so a
  // tampered symlink farm can never escape the sandbox.
  const resolvedCsv = await safeRealpath(csvPath);
  if (!resolvedCsv || !ctx.exportDirResolved) {
    appLogger.warn('[datasetExport] Could not resolve real path for export file', { name });
    await bestEffortUnlinkCsv(cleanupPath, name);
    return null;
  }
  const exportDirPrefix = ctx.exportDirResolved.endsWith(path.sep)
    ? ctx.exportDirResolved
    : ctx.exportDirResolved + path.sep;
  if (!resolvedCsv.startsWith(exportDirPrefix)) {
    appLogger.warn('[datasetExport] Resolved export path escapes export dir', {
      name,
      resolvedCsv,
      exportDirResolved: ctx.exportDirResolved
    });
    // Do NOT unlink the resolved path (it escapes the sandbox). Only the
    // in-sandbox symlink entry is safe to remove.
    await bestEffortUnlinkCsv(cleanupPath, name);
    return null;
  }
  // Prefer the resolved path from here forward — it's verified in-sandbox.
  cleanupPath = resolvedCsv;

  // Close the TOCTOU window: open the real path by descriptor NOW, then run
  // every subsequent check (size) and read (parse, copy) through the handle.
  // Using O_NOFOLLOW as defense-in-depth — the realpath check above already
  // dereferenced symlinks, so the resolved path should be a concrete file and
  // O_NOFOLLOW guarantees we refuse to follow any symlink swapped in since.
  let handle: Awaited<ReturnType<typeof fs.open>>;
  try {
    handle = await fs.open(resolvedCsv, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    appLogger.warn('[datasetExport] Failed to open export file by descriptor', { name, error });
    await bestEffortUnlinkCsv(cleanupPath, name);
    return null;
  }

  try {
    // Re-stat through the handle so we're measuring the SAME inode we'll
    // copy — not whatever the path happens to resolve to now.
    const handleStat = await handle.stat();
    if (!handleStat.isFile()) {
      appLogger.warn('[datasetExport] Open descriptor is not a regular file, skipping', { name });
      await bestEffortUnlinkCsv(cleanupPath, name);
      return null;
    }

    const maxBytes = env.datasetUploadMaxMb * 1024 * 1024;
    if (handleStat.size > maxBytes) {
      appLogger.warn('[datasetExport] Export file exceeds size limit, skipping', {
        name,
        size: handleStat.size,
        maxBytes
      });
      await bestEffortUnlinkCsv(cleanupPath, name);
      return null;
    }

    let buffer: Buffer;
    try {
      buffer = await handle.readFile();
    } catch (error) {
      appLogger.warn('[datasetExport] Failed to read export file', { name, error });
      await bestEffortUnlinkCsv(cleanupPath, name);
      return null;
    }

    let rows: Record<string, unknown>[];
    try {
      rows = await parseDatasetRows(buffer, 'csv', name);
    } catch (error) {
      appLogger.warn('[datasetExport] Failed to parse export CSV', { name, error });
      await bestEffortUnlinkCsv(cleanupPath, name);
      return null;
    }

    let profile: ReturnType<typeof profileDatasetRows>;
    try {
      profile = profileDatasetRows(rows);
    } catch (error) {
      appLogger.warn('[datasetExport] Failed to profile export CSV', { name, error });
      await bestEffortUnlinkCsv(cleanupPath, name);
      return null;
    }

    // Two-phase persist:
    //   1. create the metadata row (generates the dataset id)
    //   2. write the already-buffered bytes into the dataset storage dir as
    //      a .tmp sibling (using the buffer we read via the open handle —
    //      no second path-based read that could race)
    //   3. rename atomically to the final name
    // If any step fails, roll back both the filesystem state and the repo row.
    let createdDataset: Awaited<ReturnType<DatasetRepository['create']>> | null = null;
    let finalPath: string | null = null;
    let tempPath: string | null = null;
    try {
      createdDataset = await datasetRepository.create({
        projectId: ctx.projectId,
        filename: name,
        fileType: 'csv',
        size: handleStat.size,
        profile: {
          nRows: profile.nRows,
          columns: profile.columns,
          sample: profile.sample
        },
        metadata: {
          source: 'notebook_export',
          exportedAt: new Date().toISOString(),
          ...(entry.exportId ? { exportId: entry.exportId } : {})
        }
      });

      const storageDir = path.join(env.datasetStorageDir, createdDataset.datasetId);
      await fs.mkdir(storageDir, { recursive: true });
      finalPath = path.join(storageDir, name);
      tempPath = finalPath + '.tmp';
      await fs.writeFile(tempPath, buffer);
      await fs.rename(tempPath, finalPath);
      tempPath = null;

      // Successfully persisted — clean up the source CSV in _exports/.
      await bestEffortUnlinkCsv(cleanupPath, name);

      return {
        id: createdDataset.datasetId,
        name,
        rows: profile.nRows,
        cols: profile.columns.length
      };
    } catch (error) {
      appLogger.error('[datasetExport] Failed to persist export, rolling back', {
        name,
        error: error instanceof Error ? error.message : error
      });

      // Rollback: remove any temp/final file we created, the source CSV in
      // _exports/, then drop the metadata row.
      if (tempPath) {
        await fs.unlink(tempPath).catch(() => undefined);
      }
      if (finalPath) {
        await fs.unlink(finalPath).catch(() => undefined);
      }
      await bestEffortUnlinkCsv(cleanupPath, name);
      if (createdDataset) {
        await datasetRepository.delete(createdDataset.datasetId).catch(() => undefined);
      }
      return null;
    }
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/**
 * Best-effort cleanup of a source CSV in `_exports/`. Never throws — an
 * ENOENT is silently ignored (the file may already be gone), and any other
 * error is logged but not propagated. Called from every failure branch in
 * `persistManifestEntry` as well as the success path, so a long-lived
 * container never accumulates stale exports.
 */
async function bestEffortUnlinkCsv(csvPath: string, name: string): Promise<void> {
  try {
    await fs.unlink(csvPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      appLogger.warn('[datasetExport] Failed to clean up source CSV', {
        name,
        csvPath,
        error: err
      });
    }
  }
}

async function safeRealpath(target: string): Promise<string | null> {
  try {
    return await fs.realpath(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      appLogger.warn('[datasetExport] realpath failed', { target, error });
    }
    return null;
  }
}
