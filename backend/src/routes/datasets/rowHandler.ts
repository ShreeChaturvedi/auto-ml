import type { Request, Response } from 'express';
import { z } from 'zod';

import type { DatasetRepository } from '../../repositories/datasetRepository.js';
import {
  DEFAULT_DATASET_ROWS_LIMIT,
  getDatasetRowsPage,
  MAX_DATASET_ROWS_LIMIT
} from '../../services/datasetRows.js';

const datasetRowsQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_DATASET_ROWS_LIMIT).optional()
});

export async function getDatasetRows(
  req: Request,
  res: Response,
  datasetRepository: DatasetRepository
): Promise<void> {
  const { datasetId } = req.params;
  const parsed = datasetRowsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten() });
    return;
  }

  const dataset = await datasetRepository.getById(datasetId);
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  try {
    const page = await getDatasetRowsPage(dataset, {
      offset: parsed.data.offset ?? 0,
      limit: parsed.data.limit ?? DEFAULT_DATASET_ROWS_LIMIT
    });
    res.json(page);
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Failed to load dataset rows'
    });
  }
}
