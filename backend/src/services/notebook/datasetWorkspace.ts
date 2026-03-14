import { copyFile, mkdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';

import { shouldOverwriteDatasetWorkspace, type DatasetSyncMode } from './datasetSyncMode.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

export async function getDatasetPaths(projectId: string): Promise<string[]> {
  const datasets = await datasetRepository.list();
  return datasets
    .filter((dataset) => dataset.projectId === projectId)
    .map((dataset) => `${env.datasetStorageDir}/${dataset.datasetId}/${dataset.filename}`)
    .filter((path): path is string => Boolean(path));
}

export async function copyDatasetsToWorkspace(
  projectId: string,
  mode: DatasetSyncMode
): Promise<void> {
  const datasets = await datasetRepository.list();
  const projectDatasets = datasets.filter((dataset) => dataset.projectId === projectId);
  const workspacePath = join(env.executionWorkspaceDir, projectId);
  const datasetsPath = join(workspacePath, 'datasets');
  const shouldOverwrite = shouldOverwriteDatasetWorkspace(mode);

  await mkdir(datasetsPath, { recursive: true });

  for (const dataset of projectDatasets) {
    const sourceFile = `${env.datasetStorageDir}/${dataset.datasetId}/${dataset.filename}`;
    const datasetIdPath = join(datasetsPath, dataset.datasetId);
    await mkdir(datasetIdPath, { recursive: true });

    const destinations = [
      join(datasetsPath, dataset.filename),
      join(datasetIdPath, dataset.filename),
      join(workspacePath, dataset.filename)
    ];

    try {
      await stat(sourceFile);
      await syncDatasetFiles(sourceFile, destinations, shouldOverwrite);
    } catch (error) {
      console.warn(`[cellExecution] Could not copy dataset ${dataset.filename}: ${error}`);
    }
  }
}

async function syncDatasetFiles(
  sourceFile: string,
  destinations: string[],
  shouldOverwrite: boolean
): Promise<void> {
  for (const destination of destinations) {
    if (!shouldOverwrite && await fileExists(destination)) {
      continue;
    }

    if (shouldOverwrite) {
      await unlink(destination).catch(() => undefined);
    }

    await copyFile(sourceFile, destination);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
