import { createReadStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';

import type { Response } from 'express';

import { verifyProjectOwnership } from '../../middleware/resourceOwnership.js';
import type { DatasetRepository } from '../../repositories/datasetRepository.js';
import type { ProjectRepository } from '../../repositories/project/types.js';
import type { AuthRequest } from '../../types/auth.js';
import type { DatasetFileType, DatasetProfile } from '../../types/dataset.js';
import { sendNotFound } from '../../utils/errors.js';
import { getDatasetPath } from '../../utils/pathUtils.js';

export const DATASET_CONTENT_TYPES: Record<DatasetFileType, string> = {
  csv: 'text/csv',
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export async function loadOwnedDataset(
  req: AuthRequest,
  res: Response,
  datasetRepository: Pick<DatasetRepository, 'getById'>,
  projectRepository: Pick<ProjectRepository, 'getById' | 'getByIdAndUser'>,
  datasetId: string,
): Promise<DatasetProfile | null> {
  const dataset = await datasetRepository.getById(datasetId);
  if (!dataset) {
    sendNotFound(res, 'Dataset');
    return null;
  }

  if (req.user && dataset.projectId) {
    const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
    if (!project) {
      sendNotFound(res, 'Dataset');
      return null;
    }
  }

  return dataset;
}

export async function renameDatasetFile(datasetId: string, currentFilename: string, nextFilename: string): Promise<void> {
  try {
    await rename(getDatasetPath(datasetId, currentFilename), getDatasetPath(datasetId, nextFilename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function removeDatasetDirectory(datasetId: string): Promise<void> {
  try {
    await rm(getDatasetPath(datasetId), { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export function streamDatasetDownload(res: Response, dataset: Pick<DatasetProfile, 'datasetId' | 'filename' | 'fileType'>): void {
  const filePath = getDatasetPath(dataset.datasetId, dataset.filename);
  const stream = createReadStream(filePath);

  stream.on('error', (error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (!res.headersSent) {
        res.status(404).json({ error: 'Dataset file not found on disk' });
      } else {
        res.destroy(error as Error);
      }
      return;
    }
    res.destroy(error as Error);
  });

  res.setHeader('Content-Type', DATASET_CONTENT_TYPES[dataset.fileType] ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${dataset.filename}"`);
  stream.pipe(res);
}
