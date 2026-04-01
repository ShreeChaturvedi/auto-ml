import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveWorkspaceFilePath } from './processedDatasetPersistence.js';

const createdDirs: string[] = [];

describe('resolveWorkspaceFilePath', () => {
  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map(async (dir) => {
      await import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
    }));
  });

  it('prefers the newest container workspace copy over static project files', () => {
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

    expect(resolveWorkspaceFilePath({
      executionWorkspaceDir: rootDir,
      projectId: 'project-1',
      filename: 'train.csv',
      datasetId: 'dataset-1'
    })).toBe(newerContainerPath);
  });
});
