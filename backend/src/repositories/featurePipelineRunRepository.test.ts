import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createFileFeaturePipelineRunRepository,
  type FeaturePipelineRunRepository,
  type FeaturePipelineRunState
} from './featurePipelineRunRepository.js';

describe('FileFeaturePipelineRunRepository', () => {
  let repo: FeaturePipelineRunRepository;
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `feat-repo-test-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
    filePath = join(tempDir, 'runs.json');
    repo = createFileFeaturePipelineRunRepository(filePath);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates the storage file on construction', () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it('getOrCreate creates a new run with feat- prefix', async () => {
    const run = await repo.getOrCreate('project-1');
    expect(run.runId).toMatch(/^feat-/);
    expect(run.projectId).toBe('project-1');
    expect(run.features).toEqual({});
    expect(run.createdAt).toBeTruthy();
    expect(run.updatedAt).toBeTruthy();
  });

  it('getOrCreate returns existing run for same project on second call', async () => {
    const run1 = await repo.getOrCreate('project-1');
    const run2 = await repo.getOrCreate('project-1');
    expect(run2.runId).toBe(run1.runId);
  });

  it('getOrCreate reuses the same notebook-scoped run', async () => {
    const run1 = await repo.getOrCreate('project-1', undefined, { notebookId: 'nb-1' });
    const run2 = await repo.getOrCreate('project-1', undefined, { notebookId: 'nb-1' });

    expect(run2.runId).toBe(run1.runId);
    expect(run2.scopeNotebookId).toBe('nb-1');
  });

  it('getOrCreate isolates runs across different notebooks in the same project', async () => {
    const run1 = await repo.getOrCreate('project-1', undefined, { notebookId: 'nb-1' });
    const run2 = await repo.getOrCreate('project-1', undefined, { notebookId: 'nb-2' });

    expect(run2.runId).not.toBe(run1.runId);
    expect(run1.scopeNotebookId).toBe('nb-1');
    expect(run2.scopeNotebookId).toBe('nb-2');
  });

  it('getOrCreate with explicit runId creates run with that ID', async () => {
    const run = await repo.getOrCreate('project-1', 'feat-explicit-123');
    expect(run.runId).toBe('feat-explicit-123');
  });

  it('getOrCreate with explicit runId returns existing if found', async () => {
    const run1 = await repo.getOrCreate('project-1', 'feat-test-id');
    run1.features['f1'] = {
      featureId: 'f1',
      name: 'test_feature',
      method: 'log_transform',
      status: 'proposed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await repo.save(run1);

    const run2 = await repo.getOrCreate('project-1', 'feat-test-id');
    expect(run2.features['f1']).toBeDefined();
    expect(run2.features['f1'].name).toBe('test_feature');
  });

  it('save persists run and getById retrieves it', async () => {
    const run = await repo.getOrCreate('project-1');
    run.features['f1'] = {
      featureId: 'f1',
      name: 'sqrt_col',
      method: 'sqrt_transform',
      status: 'proposed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await repo.save(run);

    const retrieved = await repo.getById(run.runId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.features['f1'].name).toBe('sqrt_col');
  });

  it('save updates existing run in place', async () => {
    const run = await repo.getOrCreate('project-1');
    run.features['f1'] = {
      featureId: 'f1',
      name: 'feature_v1',
      method: 'log_transform',
      status: 'proposed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await repo.save(run);

    run.features['f1'].status = 'code_ready';
    run.features['f1'].code = 'df["log_col"] = np.log(df["col"])';
    await repo.save(run);

    const retrieved = await repo.getById(run.runId);
    expect(retrieved!.features['f1'].status).toBe('code_ready');
    expect(retrieved!.features['f1'].code).toBeTruthy();
  });

  it('getById returns undefined for non-existent runId', async () => {
    const result = await repo.getById('nonexistent');
    expect(result).toBeUndefined();
  });

  it('listByProjectId filters by projectId', async () => {
    await repo.getOrCreate('project-a');
    await repo.getOrCreate('project-b', 'feat-b-run');

    const runsA = await repo.listByProjectId('project-a');
    const runsB = await repo.listByProjectId('project-b');
    const runsC = await repo.listByProjectId('project-c');

    expect(runsA).toHaveLength(1);
    expect(runsA[0].projectId).toBe('project-a');
    expect(runsB).toHaveLength(1);
    expect(runsB[0].projectId).toBe('project-b');
    expect(runsC).toHaveLength(0);
  });

  it('listByProjectId returns runs sorted by updatedAt descending', async () => {
    await repo.getOrCreate('project-1', 'feat-run-1');

    // Save a second run after a small delay to ensure different updatedAt
    await new Promise((resolve) => setTimeout(resolve, 15));

    const run2: FeaturePipelineRunState = {
      runId: 'feat-run-2',
      projectId: 'project-1',
      features: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await repo.save(run2);

    const runs = await repo.listByProjectId('project-1');
    expect(runs).toHaveLength(2);
    // Verify sorted by updatedAt descending
    expect(runs[0].updatedAt >= runs[1].updatedAt).toBe(true);
  });
});
