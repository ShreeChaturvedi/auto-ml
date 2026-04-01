import { existsSync, mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileDatasetRepository } from '../../../repositories/datasetRepository.js';

const createdDirs: string[] = [];
const originalEnv = {
  datasetMetadataPath: process.env.DATASET_METADATA_PATH,
  datasetStorageDir: process.env.DATASET_STORAGE_DIR,
  executionWorkspaceDir: process.env.EXECUTION_WORKSPACE_DIR,
  databaseUrl: process.env.DATABASE_URL
};

async function loadPersistenceModule() {
  vi.resetModules();
  return import('./processedDatasetPersistence.js');
}

function setPersistenceEnv(rootDir: string): void {
  process.env.DATASET_METADATA_PATH = join(rootDir, 'datasets', 'metadata.json');
  process.env.DATASET_STORAGE_DIR = join(rootDir, 'datasets', 'files');
  process.env.EXECUTION_WORKSPACE_DIR = join(rootDir, 'workspaces');
  delete process.env.DATABASE_URL;
}

describe('resolveWorkspaceFilePath', () => {
  beforeEach(() => {
    process.env.DATASET_METADATA_PATH = originalEnv.datasetMetadataPath;
    process.env.DATASET_STORAGE_DIR = originalEnv.datasetStorageDir;
    process.env.EXECUTION_WORKSPACE_DIR = originalEnv.executionWorkspaceDir;
    process.env.DATABASE_URL = originalEnv.databaseUrl;
  });

  afterEach(async () => {
    process.env.DATASET_METADATA_PATH = originalEnv.datasetMetadataPath;
    process.env.DATASET_STORAGE_DIR = originalEnv.datasetStorageDir;
    process.env.EXECUTION_WORKSPACE_DIR = originalEnv.executionWorkspaceDir;
    process.env.DATABASE_URL = originalEnv.databaseUrl;
    vi.resetModules();

    await Promise.all(createdDirs.splice(0).map(async (dir) => {
      await import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
    }));
  });

  it('prefers the newest container workspace copy over static project files', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'issue-249-persist-'));
    createdDirs.push(rootDir);

    const projectDir = join(rootDir, 'project-1');
    const staticDir = join(projectDir, 'datasets');
    const olderContainerDir = join(projectDir, '11111111-1111-1111-1111-111111111111', 'datasets');
    const newerContainerDir = join(projectDir, '22222222-2222-2222-2222-222222222222', 'datasets', 'dataset-1');

    mkdirSync(staticDir, { recursive: true });
    mkdirSync(olderContainerDir, { recursive: true });
    mkdirSync(newerContainerDir, { recursive: true });

    const staticPath = join(staticDir, 'train.csv');
    const olderContainerPath = join(olderContainerDir, 'train.csv');
    const newerContainerPath = join(newerContainerDir, 'train.csv');

    writeFileSync(staticPath, 'static');
    writeFileSync(olderContainerPath, 'older');
    writeFileSync(newerContainerPath, 'newer');

    utimesSync(staticPath, new Date('2026-03-01T00:00:01.000Z'), new Date('2026-03-01T00:00:01.000Z'));
    utimesSync(olderContainerPath, new Date('2026-03-01T00:00:02.000Z'), new Date('2026-03-01T00:00:02.000Z'));
    utimesSync(newerContainerPath, new Date('2026-03-01T00:00:03.000Z'), new Date('2026-03-01T00:00:03.000Z'));

    const { resolveWorkspaceFilePath } = await loadPersistenceModule();
    expect(resolveWorkspaceFilePath({
      executionWorkspaceDir: rootDir,
      projectId: 'project-1',
      filename: 'train.csv',
      datasetId: 'dataset-1'
    })).toBe(newerContainerPath);
  });

  it('reuses the existing derived dataset for the same run when the source dataset is already derived', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'issue-249-persist-'));
    createdDirs.push(rootDir);
    setPersistenceEnv(rootDir);

    const metadataPath = process.env.DATASET_METADATA_PATH;
    expect(metadataPath).toBeTruthy();
    const repo = new FileDatasetRepository(metadataPath ?? join(rootDir, 'datasets', 'metadata.json'));
    const sourceDataset = await repo.create({
      projectId: 'project-1',
      filename: 'train_processed.csv',
      fileType: 'csv',
      size: 32,
      profile: {
        nRows: 1,
        columns: [
          { name: 'age', dtype: 'integer', nullCount: 0 },
          { name: 'income', dtype: 'float', nullCount: 0 }
        ],
        sample: [{ age: 30, income: 10.5 }]
      },
      metadata: {
        derivedFrom: 'dataset-original'
      }
    });
    const existingDerived = await repo.create({
      projectId: 'project-1',
      filename: 'train_processed.csv',
      fileType: 'csv',
      size: 32,
      profile: {
        nRows: 1,
        columns: [
          { name: 'age', dtype: 'integer', nullCount: 0 },
          { name: 'income', dtype: 'float', nullCount: 0 }
        ],
        sample: [{ age: 30, income: 10.5 }]
      },
      metadata: {
        derivedFrom: 'dataset-original',
        preprocessing: { runId: 'prep-run-1' }
      }
    });

    const workspaceFile = join(
      process.env.EXECUTION_WORKSPACE_DIR ?? join(rootDir, 'workspaces'),
      'project-1',
      'datasets',
      sourceDataset.datasetId,
      sourceDataset.filename
    );
    mkdirSync(join(workspaceFile, '..'), { recursive: true });
    writeFileSync(workspaceFile, 'age,income\n31,9.5\n42,11.2\n');

    const { persistProcessedDataset } = await loadPersistenceModule();
    const run = {
      runId: 'prep-run-1',
      projectId: 'project-1',
      derivedDatasetIds: [],
      steps: {},
      checkpoints: [],
      events: [],
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    };

    const derivedDatasetId = await persistProcessedDataset(run, sourceDataset);

    expect(derivedDatasetId).toBe(existingDerived.datasetId);
    expect(run.derivedDatasetIds).toEqual([]);

    const updatedDerived = await repo.get(existingDerived.datasetId);
    expect(updatedDerived?.filename).toBe('train_processed.csv');
    expect(updatedDerived?.metadata?.derivedFrom).toBe('dataset-original');
    expect(updatedDerived?.metadata?.preprocessing).toEqual({ runId: 'prep-run-1' });
    expect(existsSync(join(
      process.env.DATASET_STORAGE_DIR ?? join(rootDir, 'datasets', 'files'),
      existingDerived.datasetId,
      'train_processed.csv'
    ))).toBe(true);
  });
});
