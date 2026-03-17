/**
 * Execution workspace helpers
 *
 * Prepares per-session workspace state (dataset links, manifests).
 */

import { access, copyFile, lstat, mkdir, readdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';

import { env } from '../config.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';

export interface DatasetLink {
  alias: string;
  datasetId: string;
  filename: string;
  target: string;
}

interface SyncResult {
  links: DatasetLink[];
  collisions: string[];
}

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

function buildAlias(filename: string, datasetId: string) {
  const ext = extname(filename);
  const base = filename.slice(0, Math.max(0, filename.length - ext.length));
  const suffix = datasetId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  return `${base}__${suffix}${ext}`;
}

/**
 * Copy the dataset file into the writable workspace instead of symlinking.
 * Symlinks to the read-only /datasets mount caused OSError on write-back
 * (df.to_csv) during preprocessing.
 */
async function ensureDatasetCopy(linkPath: string, hostSourcePath: string) {
  try {
    const stat = await lstat(linkPath);
    // Already exists as a regular file — keep it (may contain user edits)
    if (stat.isFile()) {
      return true;
    }
    // Exists but is a symlink (legacy) — overwrite with a real copy
    return false;
  } catch {
    await copyFile(hostSourcePath, linkPath);
    return true;
  }
}

export async function syncWorkspaceDatasets(projectId: string, workspacePath: string): Promise<SyncResult> {
  const datasetsDir = join(workspacePath, 'datasets');
  await mkdir(datasetsDir, { recursive: true });

  const existing = new Set<string>();
  try {
    const entries = await readdir(datasetsDir);
    entries.forEach((entry) => existing.add(entry));
  } catch {
    // Ignore directory read failures; we'll rebuild below.
  }

  const datasets = (await datasetRepository.list()).filter((dataset) => dataset.projectId === projectId);
  const links: DatasetLink[] = [];
  const collisions: string[] = [];

  for (const dataset of datasets) {
    const filename = dataset.filename;
    const hostPath = join(env.datasetStorageDir, dataset.datasetId, filename);

    try {
      await access(hostPath);
    } catch {
      continue;
    }

    let alias = filename;
    let linkPath = join(datasetsDir, alias);

    if (existing.has(alias)) {
      alias = buildAlias(filename, dataset.datasetId);
      linkPath = join(datasetsDir, alias);
      collisions.push(filename);
    }

    const copied = await ensureDatasetCopy(linkPath, hostPath);
    if (!copied && alias === filename) {
      alias = buildAlias(filename, dataset.datasetId);
      linkPath = join(datasetsDir, alias);
      await ensureDatasetCopy(linkPath, hostPath);
      collisions.push(filename);
    }

    existing.add(alias);
    links.push({
      alias,
      datasetId: dataset.datasetId,
      filename,
      target: hostPath
    });
  }

  await writeFile(
    join(datasetsDir, '_manifest.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), links }, null, 2),
    'utf8'
  );

  return { links, collisions };
}
