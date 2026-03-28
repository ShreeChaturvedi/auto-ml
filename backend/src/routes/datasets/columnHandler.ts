import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Request, Response } from 'express';

import { env } from '../../config.js';
import { hasDatabaseConfiguration } from '../../db.js';
import type { DatasetRepository } from '../../repositories/datasetRepository.js';
import {
  loadDatasetIntoPostgres,
  normalizeValueForColumn,
  parseDatasetRows,
  resolveDatasetTableName
} from '../../services/datasetLoader.js';
import { resolveDatasetSqlName } from '../../services/datasetSqlNames.js';
import type { DatasetProfile } from '../../types/dataset.js';
import { getErrorMessage } from '../../utils/errors.js';

import { regenerateProjectNlSuggestionsSilently } from './nlSuggestions.js';
import { updateColumnTypeSchema } from './validation.js';

/** Build the standard dataset JSON envelope used in column-update responses. */
function formatDatasetResponse(dataset: DatasetProfile, tableName: string) {
  return {
    datasetId: dataset.datasetId,
    filename: dataset.filename,
    fileType: dataset.fileType,
    size: dataset.size,
    n_rows: dataset.nRows,
    n_cols: dataset.nCols,
    columns: dataset.columns.map((c) => c.name),
    dtypes: Object.fromEntries(dataset.columns.map((c) => [c.name, c.dtype])),
    null_counts: Object.fromEntries(dataset.columns.map((c) => [c.name, c.nullCount])),
    sample: dataset.sample,
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt,
    tableName: resolveDatasetSqlName(dataset),
    physicalTableName: tableName
  };
}

/**
 * Handler for PUT /datasets/:datasetId/columns/:columnName
 * Validates and applies a column data-type override, optionally reloading the Postgres table.
 */
export async function updateColumnType(
  req: Request,
  res: Response,
  datasetRepository: DatasetRepository
): Promise<void> {
  const { datasetId } = req.params;
  const columnName = req.params.columnName;
  const parseResult = updateColumnTypeSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({ errors: parseResult.error.flatten() });
    return;
  }

  const { dtype } = parseResult.data;
  const dataset = await datasetRepository.getById(datasetId);
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  const existingColumn = dataset.columns.find((column) => column.name === columnName);
  if (!existingColumn) {
    res.status(404).json({ error: `Column not found: ${columnName}` });
    return;
  }

  // No-op when the type is already correct
  if (existingColumn.dtype === dtype) {
    res.json({ dataset: formatDatasetResponse(dataset, resolveDatasetTableName(dataset)) });
    return;
  }

  const updatedColumns = dataset.columns.map((column) =>
    column.name === columnName ? { ...column, dtype } : column
  );

  const datasetDir = join(env.datasetStorageDir, datasetId);
  const filePath = join(datasetDir, dataset.filename);

  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: 'Dataset file not found on disk' });
      return;
    }
    throw error;
  }
  const rows = await parseDatasetRows(buffer, dataset.fileType, dataset.filename);

  if (rows.length === 0) {
    res.status(400).json({ error: 'Dataset has no rows to validate' });
    return;
  }

  // Validate every row against the target type
  for (let index = 0; index < rows.length; index += 1) {
    try {
      normalizeValueForColumn(rows[index][columnName], dtype, {
        strictMode: true,
        columnName
      });
    } catch (error) {
      res.status(400).json({
        error: 'Type override failed due to incompatible values',
        details: `Row ${index + 1}: ${getErrorMessage(error, String(error))}`
      });
      return;
    }
  }

  let tableName = resolveDatasetTableName(dataset);
  let rowsLoaded = dataset.nRows;

  if (hasDatabaseConfiguration()) {
    try {
      const loadResult = await loadDatasetIntoPostgres({
        datasetId: dataset.datasetId,
        filename: dataset.filename,
        fileType: dataset.fileType,
        buffer,
        columns: updatedColumns,
        rows,
        tableName,
        strictMode: true,
        strictColumnNames: [columnName]
      });
      tableName = loadResult.tableName;
      rowsLoaded = loadResult.rowsLoaded;
    } catch (error) {
      res.status(400).json({
        error: 'Type override failed during table reload',
        details: getErrorMessage(error, 'Unknown error during table reload')
      });
      return;
    }
  }

  const updatedDataset = await datasetRepository.update(dataset.datasetId, (current) => ({
    ...current,
    columns: updatedColumns,
    nRows: rowsLoaded,
    metadata: {
      ...(current.metadata ?? {}),
      tableName,
      rowsLoaded
    }
  }));

  if (!updatedDataset) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  await regenerateProjectNlSuggestionsSilently(updatedDataset.projectId, 'column update');

  res.json({ dataset: formatDatasetResponse(updatedDataset, tableName) });
}
