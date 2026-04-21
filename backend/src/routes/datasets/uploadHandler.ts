import { copyFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

import { env } from '../../config.js';
import { hasDatabaseConfiguration } from '../../db.js';
import { appLogger } from '../../logging/logger.js';
import type { DatasetRepository } from '../../repositories/datasetRepository.js';
import {
  buildDatasetTableName,
  loadDatasetIntoPostgres,
  parseDatasetRows,
  parseXlsxSample,
  streamLoadXlsxIntoPostgres
} from '../../services/datasetLoader.js';
import { profileDatasetRows } from '../../services/datasetProfiler.js';
import { assignDatasetSqlName } from '../../services/datasetSqlNames.js';
import { buildEdaSummary } from '../../services/edaSummary.js';

import { regenerateProjectNlSuggestionsSilently } from './nlSuggestions.js';
import { buildDatasetResponse } from './response.js';
import { datasetUploadSchema, detectFileType, legacySpreadsheetError } from './validation.js';

const EDA_MAX_ROWS = 5000;

// Use disk storage so large files (100MB+) are never held entirely in RAM.
const diskStorage = multer.diskStorage({
  destination: tmpdir(),
  filename: (_req, file, cb) => {
    cb(null, `automl-upload-${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname}`);
  }
});

const upload = multer({
  storage: diskStorage,
  limits: {
    fileSize: env.datasetUploadMaxMb * 1024 * 1024
  }
});

/**
 * Multer middleware that handles the file upload and returns a 413 response
 * when the file exceeds the configured maximum size.
 */
export function handleDatasetUpload(req: Request, res: Response, next: NextFunction): void {
  // Disable the Node.js request timeout for dataset uploads — large xlsx files
  // can take several minutes to stream-parse and load into Postgres.
  req.setTimeout(0);

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

/** Safely remove a temp file, logging but never throwing on failure. */
async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    appLogger.warn(`[datasets] Failed to clean up temp file: ${filePath}`);
  }
}

async function persistUploadedFile(tempFilePath: string, datasetId: string, filename: string): Promise<string> {
  const datasetDir = join(env.datasetStorageDir, datasetId);
  await mkdir(datasetDir, { recursive: true });
  const permanentPath = join(datasetDir, filename);
  await copyFile(tempFilePath, permanentPath);
  await cleanupTempFile(tempFilePath);
  return permanentPath;
}

/**
 * Core upload handler for POST /upload/dataset.
 *
 * For xlsx files: uses ExcelJS streaming reader to collect a sample + profile
 * without loading the entire file into memory. Responds with 201 immediately.
 * If Postgres is configured, inserts all rows in the background (fire-and-forget).
 *
 * For csv/json: parses in-memory as before (they don't hit jszip limits).
 */
export async function processDatasetUpload(
  req: Request,
  res: Response,
  datasetRepository: DatasetRepository
): Promise<void> {
  // Disable Node request timeout so large uploads don't get killed
  req.setTimeout(0);

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

  const tempFilePath = req.file.path;

  try {
    if (fileType === 'xlsx') {
      await processXlsxUpload(req, res, datasetRepository, parseResult.data, fileType, tempFilePath);
    } else {
      await processCsvJsonUpload(req, res, datasetRepository, parseResult.data, fileType, tempFilePath);
    }
  } catch (error) {
    await cleanupTempFile(tempFilePath);
    throw error;
  }
}

/**
 * Handle csv/json uploads — small enough for in-memory parsing.
 * Reads the disk file into a buffer, parses, profiles, persists, responds.
 */
async function processCsvJsonUpload(
  req: Request,
  res: Response,
  datasetRepository: DatasetRepository,
  body: { projectId?: string },
  fileType: 'csv' | 'json',
  tempFilePath: string
): Promise<void> {
  const buffer = await readFile(tempFilePath);

  // Parse failures on malformed CSV / JSON should surface as 400 with a
  // structured error body — NOT 500. Issue #338.
  let rows: Record<string, unknown>[];
  try {
    rows = await parseDatasetRows(buffer, fileType, req.file!.originalname);
  } catch (err) {
    await cleanupTempFile(tempFilePath);
    const detail = err instanceof Error ? err.message : String(err);
    res.status(400).json({
      error: `Failed to parse dataset file: ${req.file!.originalname}`,
      detail,
    });
    return;
  }
  if (rows.length === 0) {
    await cleanupTempFile(tempFilePath);
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
    projectId: body.projectId,
    filename: req.file!.originalname,
    fileType,
    size: req.file!.size,
    profile: {
      nRows: profiling.nRows,
      columns: profiling.columns,
      sample: profiling.sample
    }
  });
  const sqlName = await assignDatasetSqlName({
    repository: datasetRepository,
    projectId: body.projectId,
    filename: req.file!.originalname,
    datasetId: dataset.datasetId
  });

  // Persist the file to its permanent location
  await persistUploadedFile(tempFilePath, dataset.datasetId, req.file!.originalname);

  let tableName = buildDatasetTableName(req.file!.originalname, dataset.datasetId);
  let loadWarning: string | undefined;

  if (hasDatabaseConfiguration()) {
    try {
      const { tableName: loadedTableName, rowsLoaded } = await loadDatasetIntoPostgres({
        datasetId: dataset.datasetId,
        filename: req.file!.originalname,
        fileType,
        buffer,
        columns: profiling.columns,
        rows,
        tableName
      });

      tableName = loadedTableName;
      const updated = await datasetRepository.update(dataset.datasetId, (current) => ({
        ...current,
        nRows: rowsLoaded,
        metadata: {
          ...(current.metadata ?? {}),
          sqlName,
          tableName,
          rowsLoaded,
          eda
        }
      }));
      if (updated) {
        dataset = updated;
      }

      appLogger.info(
        `[datasets] Stored ${req.file!.originalname} (${fileType}) -> table "${tableName}" (${rowsLoaded} rows)`
      );
    } catch (loadError) {
      loadWarning = loadError instanceof Error ? loadError.message : String(loadError);
      appLogger.error(
        `[datasets] Dataset uploaded but Postgres load failed for ${req.file!.originalname}:`,
        loadWarning
      );

      const updated = await datasetRepository.update(dataset.datasetId, (current) => ({
        ...current,
        metadata: {
          ...(current.metadata ?? {}),
          sqlName,
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
        sqlName,
        tableName,
        eda
      }
    }));
    if (updated) {
      dataset = updated;
    }

    appLogger.info(
      `[datasets] Stored ${req.file!.originalname} (${fileType}) without database load`
    );
  }

  await regenerateProjectNlSuggestionsSilently(body.projectId, 'upload');

  res.status(201).json({
    dataset: buildDatasetResponse(dataset, {
      eda,
      physicalTableName: tableName,
      queryable: hasDatabaseConfiguration() && !loadWarning,
      warning: loadWarning
    }),
    warning: loadWarning
  });
}

/**
 * Handle xlsx uploads using streaming parser.
 *
 * 1. Stream-read a sample (first N rows) + count total rows — low memory.
 * 2. Profile the sample, create dataset record, persist file, respond 201.
 * 3. If Postgres is configured, stream-insert all rows in the background.
 */
async function processXlsxUpload(
  req: Request,
  res: Response,
  datasetRepository: DatasetRepository,
  body: { projectId?: string },
  fileType: 'xlsx',
  tempFilePath: string
): Promise<void> {
  // Step 1: streaming sample + row count
  const { sampleRows: sample, totalRowCount: totalRows } = await parseXlsxSample(tempFilePath, req.file!.originalname, EDA_MAX_ROWS);

  if (sample.length === 0) {
    await cleanupTempFile(tempFilePath);
    res.status(400).json({ error: 'Dataset has no rows to process' });
    return;
  }

  // Step 2: profile the sample
  const profiling = profileDatasetRows(sample, { sampleSize: 20, maxRows: EDA_MAX_ROWS });
  // Override nRows with the true total from the streaming count
  const profilingWithTotal = { ...profiling, nRows: totalRows };

  const rowsForEda = sample.slice(0, EDA_MAX_ROWS);
  const eda = buildEdaSummary(rowsForEda, {
    source: 'dataset-profile',
    totalRows
  });

  let dataset = await datasetRepository.create({
    projectId: body.projectId,
    filename: req.file!.originalname,
    fileType,
    size: req.file!.size,
    profile: {
      nRows: profilingWithTotal.nRows,
      columns: profilingWithTotal.columns,
      sample: profilingWithTotal.sample
    }
  });
  const sqlName = await assignDatasetSqlName({
    repository: datasetRepository,
    projectId: body.projectId,
    filename: req.file!.originalname,
    datasetId: dataset.datasetId
  });

  // Persist the file to its permanent location
  const permanentPath = await persistUploadedFile(tempFilePath, dataset.datasetId, req.file!.originalname);

  const tableName = buildDatasetTableName(req.file!.originalname, dataset.datasetId);

  // Update metadata with table name + EDA before responding
  const updated = await datasetRepository.update(dataset.datasetId, (current) => ({
    ...current,
    metadata: {
      ...(current.metadata ?? {}),
      sqlName,
      tableName,
      eda
    }
  }));
  if (updated) {
    dataset = updated;
  }

  // Step 3: respond immediately so the browser doesn't timeout
  res.status(201).json({
    dataset: buildDatasetResponse(dataset, {
      eda,
      physicalTableName: tableName,
      queryable: false
    }),
    warning: undefined
  });

  // Step 4: background Postgres insertion (fire-and-forget)
  if (hasDatabaseConfiguration()) {
    streamLoadXlsxIntoPostgres({
      datasetId: dataset.datasetId,
      filename: req.file!.originalname,
      filePath: permanentPath,
      columns: profilingWithTotal.columns,
      tableName
    })
      .then(async ({ rowsLoaded }) => {
        await datasetRepository.update(dataset.datasetId, (current) => ({
          ...current,
          nRows: rowsLoaded,
          metadata: {
            ...(current.metadata ?? {}),
            sqlName,
            tableName,
            rowsLoaded,
            eda
          }
        }));
        appLogger.info(
          `[datasets] Background PG load complete: ${req.file!.originalname} -> "${tableName}" (${rowsLoaded} rows)`
        );
      })
      .catch((error) => {
        const warning = error instanceof Error ? error.message : String(error);
        appLogger.error(
          `[datasets] Background PG load failed for ${req.file!.originalname}:`,
          warning
        );
        void datasetRepository.update(dataset.datasetId, (current) => ({
          ...current,
          metadata: {
            ...(current.metadata ?? {}),
            sqlName,
            tableName,
            loadWarning: warning,
            eda
          }
        }));
      });
  }

  await regenerateProjectNlSuggestionsSilently(body.projectId, 'upload');
}
