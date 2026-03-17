import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

import { env } from '../../config.js';
import { hasDatabaseConfiguration } from '../../db.js';
import type { DatasetRepository } from '../../repositories/datasetRepository.js';
import { loadDatasetIntoPostgres, parseDatasetRows, sanitizeTableName } from '../../services/datasetLoader.js';
import { profileDatasetRows } from '../../services/datasetProfiler.js';
import { buildEdaSummary } from '../../services/edaSummary.js';

import { datasetUploadSchema, detectFileType, legacySpreadsheetError } from './validation.js';

const EDA_MAX_ROWS = 5000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.datasetUploadMaxMb * 1024 * 1024
  }
});

/**
 * Multer middleware that handles the file upload and returns a 413 response
 * when the file exceeds the configured maximum size.
 */
export function handleDatasetUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: `File too large. Maximum dataset size is ${env.datasetUploadMaxMb}MB.`
      });
      return;
    }

    next(error);
  });
}

/**
 * Core upload handler for POST /upload/dataset.
 * Validates the file, parses it, profiles columns, persists to disk,
 * optionally loads into Postgres, and returns the created dataset.
 */
export async function processDatasetUpload(
  req: Request,
  res: Response,
  datasetRepository: DatasetRepository
): Promise<void> {
  const parseResult = datasetUploadSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ errors: parseResult.error.flatten() });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'file field is required' });
    return;
  }

  const unsupportedSpreadsheetMessage = legacySpreadsheetError(req.file.originalname);
  if (unsupportedSpreadsheetMessage) {
    res.status(400).json({ error: unsupportedSpreadsheetMessage });
    return;
  }

  const fileType = detectFileType(req.file.originalname, req.file.mimetype);
  if (!fileType) {
    res.status(400).json({ error: `Unsupported file type: ${req.file.originalname}` });
    return;
  }

  const rows = await parseDatasetRows(req.file.buffer, fileType, req.file.originalname);
  if (rows.length === 0) {
    res.status(400).json({ error: 'Dataset has no rows to process' });
    return;
  }

  const profiling = profileDatasetRows(rows);

  const rowsForEda = rows.slice(0, EDA_MAX_ROWS);
  const eda = buildEdaSummary(rowsForEda, {
    source: 'dataset-profile',
    totalRows: rows.length
  });

  let dataset = await datasetRepository.create({
    projectId: parseResult.data.projectId,
    filename: req.file.originalname,
    fileType,
    size: req.file.size,
    profile: {
      nRows: profiling.nRows,
      columns: profiling.columns,
      sample: profiling.sample
    }
  });

  const datasetDir = join(env.datasetStorageDir, dataset.datasetId);
  mkdirSync(datasetDir, { recursive: true });
  const filePath = join(datasetDir, req.file.originalname);
  writeFileSync(filePath, req.file.buffer);

  let tableName = sanitizeTableName(req.file.originalname, dataset.datasetId);
  let loadWarning: string | undefined;

  if (hasDatabaseConfiguration()) {
    try {
      const { tableName: loadedTableName, rowsLoaded } = await loadDatasetIntoPostgres({
        datasetId: dataset.datasetId,
        filename: req.file.originalname,
        fileType,
        buffer: req.file.buffer,
        columns: profiling.columns,
        rows
      });

      tableName = loadedTableName;
      const updated = await datasetRepository.update(dataset.datasetId, (current) => ({
        ...current,
        nRows: rowsLoaded,
        metadata: {
          ...(current.metadata ?? {}),
          tableName,
          rowsLoaded,
          eda
        }
      }));
      if (updated) {
        dataset = updated;
      }

      console.log(
        `[datasets] Stored ${req.file.originalname} (${fileType}) -> table "${tableName}" (${rowsLoaded} rows)`
      );
    } catch (loadError) {
      loadWarning = loadError instanceof Error ? loadError.message : String(loadError);
      console.error(
        `[datasets] Dataset uploaded but Postgres load failed for ${req.file.originalname}:`,
        loadWarning
      );

      const updated = await datasetRepository.update(dataset.datasetId, (current) => ({
        ...current,
        metadata: {
          ...(current.metadata ?? {}),
          tableName,
          loadWarning,
          eda
        }
      }));
      if (updated) {
        dataset = updated;
      }
    }
  } else {
    const updated = await datasetRepository.update(dataset.datasetId, (current) => ({
      ...current,
      metadata: {
        ...(current.metadata ?? {}),
        tableName,
        eda
      }
    }));
    if (updated) {
      dataset = updated;
    }

    console.info(
      `[datasets] Stored ${req.file.originalname} (${fileType}) without database load`
    );
  }

  res.status(201).json({
    dataset: {
      datasetId: dataset.datasetId,
      filename: dataset.filename,
      fileType: dataset.fileType,
      size: dataset.size,
      n_rows: dataset.nRows,
      n_cols: dataset.nCols,
      columns: dataset.columns.map((column) => column.name),
      dtypes: Object.fromEntries(dataset.columns.map((column) => [column.name, column.dtype])),
      null_counts: Object.fromEntries(
        dataset.columns.map((column) => [column.name, column.nullCount])
      ),
      sample: dataset.sample,
      createdAt: dataset.createdAt,
      tableName,
      warning: loadWarning
    },
    warning: loadWarning
  });
}
