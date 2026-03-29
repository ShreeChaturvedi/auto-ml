import { copyFileSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

import { env } from '../../config.js';
import { hasDatabaseConfiguration } from '../../db.js';
import { appLogger } from '../../logging/logger.js';
import type { DatasetRepository } from '../../repositories/datasetRepository.js';
import { loadDatasetIntoPostgres, parseDatasetRows, sanitizeTableName } from '../../services/datasetLoader.js';
import { profileDatasetRows } from '../../services/datasetProfiler.js';
import { buildEdaSummary } from '../../services/edaSummary.js';

import { regenerateProjectNlSuggestionsSilently } from './nlSuggestions.js';
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

  // Disk storage writes the upload to a temp file — clean it up when done.
  const tempPath = req.file.path;
  const cleanupTempFile = () => {
    try { unlinkSync(tempPath); } catch { /* already removed */ }
  };

  try {
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

    const isXlsx = fileType === 'xlsx';
    let rows: Record<string, unknown>[];
    let totalRowCount: number;
    let profiling: ReturnType<typeof profileDatasetRows>;
    let tableName = sanitizeTableName(req.file.originalname, 'pending');
    let loadWarning: string | undefined;

    if (isXlsx) {
      // ── Fast-response xlsx path ──────────────────────────────────────
      // Safari aborts fetch after ~60 s of silence, so we must respond
      // quickly.  Strategy:
      //   1. Stream ONLY the first 5 000 rows for profiling (~5-10 s)
      //   2. Respond 201 immediately with sample + profile + EDA
      //   3. Kick off PG insertion in the background (fire-and-forget)
      //
      // The preview works instantly.  SQL querying becomes available once
      // the background job finishes (typically 1-3 min for large files).
      const { parseXlsxSample } = await import('../../services/datasetLoader.js');
      const sample = await parseXlsxSample(tempPath, req.file.originalname, EDA_MAX_ROWS);
      rows = sample.sampleRows;
      // Use totalRowCount from the sample pass (streams all rows to count)
      totalRowCount = sample.totalRowCount;

      if (totalRowCount === 0) {
        res.status(400).json({ error: 'Dataset has no rows to process' });
        return;
      }

      profiling = profileDatasetRows(rows);
      profiling.nRows = totalRowCount;

      const eda = buildEdaSummary(rows.slice(0, EDA_MAX_ROWS), {
        source: 'dataset-profile',
        totalRows: totalRowCount
      });

      const created = await datasetRepository.create({
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

      const datasetDir = join(env.datasetStorageDir, created.datasetId);
      mkdirSync(datasetDir, { recursive: true });
      const permanentPath = join(datasetDir, req.file.originalname);
      copyFileSync(tempPath, permanentPath);

      tableName = sanitizeTableName(req.file.originalname, created.datasetId);

      // Save metadata (columns, sample, eda) so hydration works immediately
      await datasetRepository.update(created.datasetId, (current) => ({
        ...current,
        metadata: { ...(current.metadata ?? {}), tableName, eda }
      }));

      // ── Respond NOW — frontend gets preview instantly ──
      await regenerateProjectNlSuggestionsSilently(parseResult.data.projectId, 'upload');

      res.status(201).json({
        dataset: {
          datasetId: created.datasetId,
          filename: created.filename,
          fileType: created.fileType,
          size: created.size,
          n_rows: profiling.nRows,
          n_cols: profiling.columns.length,
          columns: profiling.columns.map((c) => c.name),
          dtypes: Object.fromEntries(profiling.columns.map((c) => [c.name, c.dtype])),
          null_counts: Object.fromEntries(profiling.columns.map((c) => [c.name, c.nullCount])),
          sample: profiling.sample,
          createdAt: created.createdAt,
          tableName,
          eda,
          warning: undefined
        },
        warning: undefined
      });

      // ── Background: PG insertion (fire-and-forget) ──
      if (hasDatabaseConfiguration()) {
        const bgDatasetId = created.datasetId;
        const bgFilename = req.file.originalname;
        const bgColumns = profiling.columns;

        void (async () => {
          try {
            const { streamLoadXlsxIntoPostgres } = await import('../../services/datasetLoader.js');
            const { tableName: loadedTable, rowsLoaded } = await streamLoadXlsxIntoPostgres({
              filePath: permanentPath,
              filename: bgFilename,
              datasetId: bgDatasetId,
              columns: bgColumns
            });

            await datasetRepository.update(bgDatasetId, (current) => ({
              ...current,
              nRows: rowsLoaded,
              metadata: {
                ...(current.metadata ?? {}),
                tableName: loadedTable,
                rowsLoaded
              }
            }));

            appLogger.info(`[datasets] Background PG load complete: ${bgFilename} → "${loadedTable}" (${rowsLoaded} rows)`);
          } catch (bgError) {
            const msg = bgError instanceof Error ? bgError.message : String(bgError);
            appLogger.error(`[datasets] Background PG load failed for ${bgFilename}: ${msg}`);

            await datasetRepository.update(bgDatasetId, (current) => ({
              ...current,
              metadata: { ...(current.metadata ?? {}), loadWarning: msg }
            })).catch(() => {});
          }
        })();
      }

      return;
    }

    // ── Standard path: csv/json or xlsx without database ──
    if (isXlsx) {
      // xlsx without PG — use the sample-only streaming parser
      const { parseXlsxSample } = await import('../../services/datasetLoader.js');
      const sample = await parseXlsxSample(tempPath, req.file.originalname, EDA_MAX_ROWS);
      rows = sample.sampleRows;
      totalRowCount = sample.totalRowCount;
    } else {
      rows = await parseDatasetRows(readFileSync(tempPath), fileType, req.file.originalname);
      totalRowCount = rows.length;
    }

    if (totalRowCount === 0) {
      res.status(400).json({ error: 'Dataset has no rows to process' });
      return;
    }

    profiling = profileDatasetRows(rows);
    if (isXlsx) {
      profiling.nRows = totalRowCount;
    }

    const rowsForEda = rows.slice(0, EDA_MAX_ROWS);
    const eda = buildEdaSummary(rowsForEda, {
      source: 'dataset-profile',
      totalRows: totalRowCount
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
    copyFileSync(tempPath, filePath);

    tableName = sanitizeTableName(req.file.originalname, dataset.datasetId);

    if (hasDatabaseConfiguration()) {
      try {
        const { tableName: loadedTableName, rowsLoaded } = await loadDatasetIntoPostgres({
              datasetId: dataset.datasetId,
              filename: req.file.originalname,
              fileType,
              buffer: Buffer.alloc(0),
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

        appLogger.info(
          `[datasets] Stored ${req.file.originalname} (${fileType}) -> table "${tableName}" (${rowsLoaded} rows)`
        );
      } catch (loadError) {
        loadWarning = loadError instanceof Error ? loadError.message : String(loadError);
        appLogger.error(
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

      appLogger.info(
        `[datasets] Stored ${req.file.originalname} (${fileType}) without database load`
      );
    }

    await regenerateProjectNlSuggestionsSilently(parseResult.data.projectId, 'upload');

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
        eda,
        warning: loadWarning
      },
      warning: loadWarning
    });
  } finally {
    cleanupTempFile();
  }
}
