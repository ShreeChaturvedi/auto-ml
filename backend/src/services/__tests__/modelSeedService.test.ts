import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                      */
/* ------------------------------------------------------------------ */

const hoisted = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockListByProject = vi.fn();
  const mockMkdir = vi.fn();
  const mockWriteFile = vi.fn();

  return { mockCreate, mockListByProject, mockMkdir, mockWriteFile };
});

vi.mock('../../repositories/modelRepository.js', () => ({
  createModelRepository: () => ({
    create: hoisted.mockCreate,
  }),
}));

vi.mock('../../repositories/datasetRepository.js', () => ({
  createDatasetRepository: () => ({
    listByProject: hoisted.mockListByProject,
  }),
}));

vi.mock('../../config.js', () => ({
  env: {
    modelMetadataPath: '/tmp/test-models.json',
    datasetMetadataPath: '/tmp/test-datasets.json',
    modelStorageDir: '/tmp/test-model-storage',
  },
}));

vi.mock('node:fs/promises', () => ({
  mkdir: hoisted.mockMkdir,
  writeFile: hoisted.mockWriteFile,
}));

import { seedModels, seedOneModel } from '../modelSeedService.js';

const { mockCreate, mockListByProject, mockMkdir, mockWriteFile } = hoisted;

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                   */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockListByProject.mockResolvedValue([
    { datasetId: 'ds-real-123' },
  ]);
  mockCreate.mockImplementation(async (input: Record<string, unknown>) => ({
    ...input,
    modelId: `model-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
});

afterEach(() => vi.restoreAllMocks());

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('seedModels', () => {
  it('creates five seed models for the given project', async () => {
    const models = await seedModels('proj-1');
    expect(models).toHaveLength(5);
    expect(mockCreate).toHaveBeenCalledTimes(5);
  });

  it('resolves the real dataset ID from the project', async () => {
    await seedModels('proj-1');
    const firstCall = mockCreate.mock.calls[0][0];
    expect(firstCall.datasetId).toBe('ds-real-123');
  });

  it('falls back to a placeholder dataset ID when project has no datasets', async () => {
    mockListByProject.mockResolvedValue([]);
    await seedModels('proj-empty');
    const firstCall = mockCreate.mock.calls[0][0];
    expect(firstCall.datasetId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('writes evaluation.json, shap.json, and baseline.json artifacts for each model', async () => {
    await seedModels('proj-1');
    // 5 models × 3 files = 15 writes
    expect(mockWriteFile).toHaveBeenCalledTimes(15);
    // Every write should produce valid JSON
    for (const [, content] of mockWriteFile.mock.calls) {
      expect(() => JSON.parse(content as string)).not.toThrow();
    }
  });

  it('creates artifact directories under modelStorageDir', async () => {
    await seedModels('proj-1');
    expect(mockMkdir).toHaveBeenCalledTimes(5);
    for (const [dir, opts] of mockMkdir.mock.calls) {
      expect(dir).toMatch(/^\/tmp\/test-model-storage\/model-/);
      expect(opts).toEqual({ recursive: true });
    }
  });

  it('sets all models to completed with evaluationStatus ready', async () => {
    await seedModels('proj-1');
    for (const [input] of mockCreate.mock.calls) {
      expect(input.status).toBe('completed');
      expect(input.evaluationStatus).toBe('ready');
    }
  });

  it('includes featureColumns as an array of strings', async () => {
    await seedModels('proj-1');
    for (const [input] of mockCreate.mock.calls) {
      expect(Array.isArray(input.featureColumns)).toBe(true);
      expect(input.featureColumns.length).toBeGreaterThan(0);
      for (const col of input.featureColumns) {
        expect(typeof col).toBe('string');
      }
    }
  });
});

describe('seedOneModel', () => {
  it('creates a single model with the specified parameters', async () => {
    const model = await seedOneModel('proj-1', {
      name: 'Test Model',
      taskType: 'classification',
      algorithm: 'RandomForestClassifier',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(model.name).toBe('Test Model');
  });

  it('writes evaluation, shap, and baseline artifacts', async () => {
    await seedOneModel('proj-1', {
      name: 'Test Reg',
      taskType: 'regression',
      algorithm: 'LinearRegression',
    });

    expect(mockWriteFile).toHaveBeenCalledTimes(3);
    const [evalPath, evalContent] = mockWriteFile.mock.calls[0];
    const [shapPath, shapContent] = mockWriteFile.mock.calls[1];
    const [baselinePath] = mockWriteFile.mock.calls[2];
    expect(evalPath).toContain('evaluation.json');
    expect(shapPath).toContain('shap.json');
    expect(baselinePath).toContain('baseline.json');
    const evalData = JSON.parse(evalContent as string);
    expect(evalData.taskType).toBe('regression');
    const shapData = JSON.parse(shapContent as string);
    expect(shapData.feature_names).toBeDefined();
  });

  it('resolves templateId from ALGORITHM_TO_TEMPLATE mapping', async () => {
    await seedOneModel('proj-1', {
      name: 'KNN Test',
      taskType: 'classification',
      algorithm: 'KNeighborsClassifier',
    });
    expect(mockCreate.mock.calls[0][0].templateId).toBe('knn_classifier');
  });

  it('generates a fallback templateId for unknown algorithms', async () => {
    await seedOneModel('proj-1', {
      name: 'Custom Algo',
      taskType: 'classification',
      algorithm: 'MyCustomAlgo',
    });
    expect(mockCreate.mock.calls[0][0].templateId).toBe('seed-mycustomalgo');
  });

  it('handles clustering task type', async () => {
    await seedOneModel('proj-1', {
      name: 'Cluster Test',
      taskType: 'clustering',
      algorithm: 'KMeans',
    });
    const input = mockCreate.mock.calls[0][0];
    expect(input.taskType).toBe('clustering');
    expect(input.targetColumn).toBeUndefined();
  });
});
