/**
 * Execution workspace helpers
 *
 * Prepares per-session workspace state (dataset links, manifests).
 */

import { access, lstat, mkdir, readlink, readdir, symlink, writeFile } from 'fs/promises';
import { extname, join, posix } from 'path';

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

async function ensureSymlink(linkPath: string, target: string) {
  try {
    const stat = await lstat(linkPath);
    if (stat.isSymbolicLink()) {
      const existingTarget = await readlink(linkPath);
      if (existingTarget === target) {
        return true;
      }
    }
    return false;
  } catch {
    await symlink(target, linkPath);
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
    const target = posix.join('/datasets', dataset.datasetId, filename);

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

    const linked = await ensureSymlink(linkPath, target);
    if (!linked && alias === filename) {
      alias = buildAlias(filename, dataset.datasetId);
      linkPath = join(datasetsDir, alias);
      await ensureSymlink(linkPath, target);
      collisions.push(filename);
    }

    existing.add(alias);
    links.push({
      alias,
      datasetId: dataset.datasetId,
      filename,
      target
    });
  }

  await writeFile(
    join(datasetsDir, '_manifest.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), links }, null, 2),
    'utf8'
  );

  return { links, collisions };
}
