import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { env } from '../../../config.js';
import { hasDatabaseConfiguration } from '../../../db.js';
import { appLogger } from '../../../logging/logger.js';
import type { DatasetRepository } from '../../../repositories/datasetRepository.js';
import { getNotebook } from '../../../repositories/notebook/index.js';
import type { PreprocessingRunState } from '../../../repositories/preprocessingRunRepository.js';
import { loadDatasetIntoPostgres, parseDatasetRows } from '../../datasetLoader.js';
import { profileDatasetRows } from '../../datasetProfiler.js';

export interface ResolveWorkspaceFilePathParams {
  executionWorkspaceDir: string;
  projectId: string;
  filename: string;
  datasetId: string;
}

export function resolveWorkspaceFilePath(params: ResolveWorkspaceFilePathParams): string | undefined {
  const projectDir = join(params.executionWorkspaceDir, params.projectId);
  const containerCandidates = findContainerWorkspaceFiles(projectDir, params.filename, params.datasetId);
  const staticCandidates = [
    join(projectDir, params.filename),
    join(projectDir, 'datasets', params.filename),
    join(projectDir, 'datasets', params.datasetId, params.filename)
  ].filter((candidate) => existsSync(candidate));
  const allCandidates = [...containerCandidates, ...staticCandidates];

  if (allCandidates.length === 0) {
    return undefined;
  }

  return allCandidates.reduce((best, candidate) => {
    const bestMtime = statSync(best).mtimeMs;
    const candidateMtime = statSync(candidate).mtimeMs;
    return candidateMtime > bestMtime ? candidate : best;
  });
}

function findContainerWorkspaceFiles(projectDir: string, filename: string, datasetId: string): string[] {
  if (!existsSync(projectDir)) {
    return [];
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const results: Array<{ path: string; mtimeMs: number }> = [];

  try {
    const entries = readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !uuidRe.test(entry.name)) {
        continue;
      }

      const candidates = [
        join(projectDir, entry.name, filename),
        join(projectDir, entry.name, 'datasets', filename),
        join(projectDir, entry.name, 'datasets', datasetId, filename)
      ];

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          results.push({ path: candidate, mtimeMs: statSync(candidate).mtimeMs });
        }
      }
    }
  } catch {
    // Ignore directory read errors and fall back to static candidates.
  }

  results.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return results.map((result) => result.path);
}

function sanitizeForFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function deriveProcessedFilename(originalFilename: string, workbookName?: string): string {
  const ext = extname(originalFilename);
  let base = basename(originalFilename, ext);
  base = base.replace(/_processed(?:_[a-z0-9_]*)?$/, '');
  const suffix = workbookName ? `_${sanitizeForFilename(workbookName)}` : '';
  return `${base}_processed${suffix}${ext}`;
}

async function resolveWorkbookName(notebookId: string | undefined): Promise<string | undefined> {
  if (!notebookId || !hasDatabaseConfiguration()) {
    return undefined;
  }

  try {
    const notebook = await getNotebook(notebookId);
    if (!notebook) {
      return undefined;
    }
    const meta = notebook.metadata as Record<string, unknown> | undefined;
    const tabName = typeof meta?.tabName === 'string' ? meta.tabName : undefined;
    return tabName ?? notebook.name ?? undefined;
  } catch {
    return undefined;
  }
}

export async function persistProcessedDataset(
  run: PreprocessingRunState,
  sourceDataset: { datasetId: string; filename: string; fileType?: string; projectId?: string },
  notebookId?: string,
  datasetRepository?: DatasetRepository
): Promise<string | undefined> {
  if (!datasetRepository) {
    throw new Error('persistProcessedDataset requires a dataset repository instance.');
  }
  const workspacePath = resolveWorkspaceFilePath({
    executionWorkspaceDir: env.executionWorkspaceDir,
    projectId: run.projectId,
    filename: sourceDataset.filename,
    datasetId: sourceDataset.datasetId
  });

  if (!workspacePath) {
    appLogger.warn('[persistProcessedDataset] Could not find workspace file for dataset', {
      projectId: run.projectId,
      filename: sourceDataset.filename,
      datasetId: sourceDataset.datasetId
    });
    return undefined;
  }

  const buffer = readFileSync(workspacePath);
  const fileType = (extname(sourceDataset.filename).replace('.', '').toLowerCase() || 'csv') as 'csv' | 'json' | 'xlsx';
  const rows = await parseDatasetRows(buffer, fileType, sourceDataset.filename);
  if (rows.length === 0) {
    appLogger.warn('[persistProcessedDataset] Parsed 0 rows from workspace file, skipping');
    return undefined;
  }

  const profile = profileDatasetRows(rows);
  const workbookName = await resolveWorkbookName(notebookId);
  const processedFilename = deriveProcessedFilename(sourceDataset.filename, workbookName);
  const fileSize = statSync(workspacePath).size;

  const allDatasets = await datasetRepository.listByProject(run.projectId);
  const sourceMeta = allDatasets.find((dataset) => dataset.datasetId === sourceDataset.datasetId);
  const originalSourceId = typeof sourceMeta?.metadata?.derivedFrom === 'string'
    ? sourceMeta.metadata.derivedFrom
    : sourceDataset.datasetId;
  const existingDerived = allDatasets.find((dataset) =>
    dataset.metadata?.derivedFrom === originalSourceId &&
    (dataset.metadata?.preprocessing as Record<string, unknown> | undefined)?.runId === run.runId
  );

  let derivedDatasetId: string;

  if (existingDerived) {
    derivedDatasetId = existingDerived.datasetId;
    const storageDir = join(env.datasetStorageDir, derivedDatasetId);
    mkdirSync(storageDir, { recursive: true });
    copyFileSync(workspacePath, join(storageDir, processedFilename));

    await datasetRepository.update(derivedDatasetId, (current) => ({
      ...current,
      filename: processedFilename,
      size: fileSize,
      nRows: profile.nRows,
      nCols: profile.columns.length,
      columns: profile.columns,
      sample: profile.sample,
      metadata: {
        ...(current.metadata ?? {}),
        derivedFrom: originalSourceId,
        preprocessing: { runId: run.runId }
      }
    }));
  } else {
    const created = await datasetRepository.create({
      projectId: run.projectId,
      filename: processedFilename,
      fileType,
      size: fileSize,
      profile: {
        nRows: profile.nRows,
        columns: profile.columns,
        sample: profile.sample
      },
      metadata: {
        derivedFrom: originalSourceId,
        preprocessing: { runId: run.runId }
      }
    });
    derivedDatasetId = created.datasetId;

    const storageDir = join(env.datasetStorageDir, derivedDatasetId);
    mkdirSync(storageDir, { recursive: true });
    copyFileSync(workspacePath, join(storageDir, processedFilename));
    run.derivedDatasetIds.push(derivedDatasetId);
  }

  if (hasDatabaseConfiguration()) {
    try {
      const { tableName, rowsLoaded } = await loadDatasetIntoPostgres({
        datasetId: derivedDatasetId,
        filename: processedFilename,
        fileType,
        buffer,
        columns: profile.columns,
        rows
      });

      await datasetRepository.update(derivedDatasetId, (current) => ({
        ...current,
        nRows: rowsLoaded,
        metadata: {
          ...(current.metadata ?? {}),
          tableName,
          rowsLoaded
        }
      }));

      appLogger.info('[persistProcessedDataset] Loaded processed dataset into Postgres', {
        derivedDatasetId,
        tableName,
        rowsLoaded
      });
    } catch (pgError) {
      appLogger.error('[persistProcessedDataset] Failed to load into Postgres (non-fatal)', pgError);
    }
  }

  appLogger.info('[persistProcessedDataset] Persisted processed dataset', {
    derivedDatasetId,
    processedFilename,
    sourceDatasetId: sourceDataset.datasetId,
    nRows: profile.nRows
  });

  return derivedDatasetId;
}
