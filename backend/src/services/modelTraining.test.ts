import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockRandomUUID: vi.fn(),
  mockExistsSync: vi.fn(),
  mockCopyFile: vi.fn(),
  mockMkdir: vi.fn(),
  mockReadFile: vi.fn(),
  mockRm: vi.fn(),
  mockStat: vi.fn(),
  mockWriteFile: vi.fn(),
  mockDatasetGetById: vi.fn(),
  mockModelCreate: vi.fn(),
  mockModelUpdate: vi.fn(),
  mockGetOrCreateContainer: vi.fn(),
  mockIsDockerAvailable: vi.fn(),
  mockSyncWorkspaceDatasets: vi.fn(),
  mockKernelExecute: vi.fn(),
  mockRunEvaluation: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomUUID: hoisted.mockRandomUUID,
}));

vi.mock('node:fs', () => ({
  existsSync: hoisted.mockExistsSync,
}));

vi.mock('node:fs/promises', () => ({
  copyFile: hoisted.mockCopyFile,
  mkdir: hoisted.mockMkdir,
  readFile: hoisted.mockReadFile,
  rm: hoisted.mockRm,
  stat: hoisted.mockStat,
  writeFile: hoisted.mockWriteFile,
}));

vi.mock('../config.js', () => ({
  env: {
    datasetMetadataPath: '/tmp/test-datasets.json',
    modelMetadataPath: '/tmp/test-models.json',
    modelStorageDir: '/tmp/model-storage',
    executionWorkspaceDir: '/tmp/test-workspaces',
    datasetStorageDir: '/tmp/test-datasets',
    executionTimeoutMs: 30_000,
  },
}));

vi.mock('../repositories/datasetRepository.js', () => ({
  createDatasetRepository: () => ({
    getById: hoisted.mockDatasetGetById,
  }),
}));

vi.mock('../repositories/modelRepository.js', () => ({
  createModelRepository: () => ({
    create: hoisted.mockModelCreate,
    update: hoisted.mockModelUpdate,
    getById: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock('./containerManager.js', () => ({
  getOrCreateContainer: hoisted.mockGetOrCreateContainer,
  isDockerAvailable: hoisted.mockIsDockerAvailable,
}));

vi.mock('./executionWorkspace.js', () => ({
  syncWorkspaceDatasets: hoisted.mockSyncWorkspaceDatasets,
}));

vi.mock('./kernelManager.js', () => ({
  execute: hoisted.mockKernelExecute,
}));

vi.mock('./evaluationService.js', () => ({
  runEvaluation: hoisted.mockRunEvaluation,
}));

vi.mock('./tuningService.js', () => ({
  deleteTuningStudiesByModelId: vi.fn(),
}));

import { buildTrainingScript, trainModel } from './modelTraining.js';

const {
  mockRandomUUID,
  mockExistsSync,
  mockCopyFile,
  mockMkdir,
  mockReadFile,
  mockRm,
  mockStat,
  mockWriteFile,
  mockDatasetGetById,
  mockModelCreate,
  mockModelUpdate,
  mockGetOrCreateContainer,
  mockIsDockerAvailable,
  mockSyncWorkspaceDatasets,
  mockKernelExecute,
  mockRunEvaluation,
} = hoisted;

function makeCreatedRecord(overrides: Record<string, unknown> = {}) {
  return {
    modelId: 'persisted-model-id',
    projectId: 'project-1',
    datasetId: 'dataset-1',
    name: 'Model',
    templateId: 'random_forest_regressor',
    taskType: 'regression',
    library: 'sklearn',
    algorithm: 'RandomForestRegressor',
    parameters: {},
    metrics: {},
    status: 'completed',
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
    evaluationStatus: 'pending',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRandomUUID.mockReturnValue('workspace-model-id');
  mockExistsSync.mockImplementation((path: string) => !String(path).endsWith('baseline.json'));
  mockCopyFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
  mockRm.mockResolvedValue(undefined);
  mockStat.mockResolvedValue({ size: 1234 });
  mockWriteFile.mockResolvedValue(undefined);
  mockDatasetGetById.mockResolvedValue({
    datasetId: 'dataset-1',
    filename: 'data.csv',
    projectId: 'project-1',
  });
  mockIsDockerAvailable.mockResolvedValue(true);
  mockGetOrCreateContainer.mockResolvedValue({
    workspacePath: '/tmp/test-workspaces/project-1/model-runtime',
  });
  mockSyncWorkspaceDatasets.mockResolvedValue(undefined);
  mockKernelExecute.mockResolvedValue({ status: 'success' });
  mockRunEvaluation.mockResolvedValue(undefined);
});

describe('buildTrainingScript', () => {
  it('does not stratify regression train/test splits', () => {
    const script = buildTrainingScript({
      datasetFilename: 'data.csv',
      datasetId: 'dataset-1',
      templateId: 'random_forest_regressor',
      targetColumn: 'target',
      parameters: {},
      testSize: 0.2,
      outputDir: '/workspace/models/run-1',
    });

    expect(script).not.toContain('stratify = y');
    expect(script).not.toContain('stratify=stratify');
    expect(script).toContain('X_train, X_test, y_train, y_test = train_test_split(');
    expect(script).toContain('X, y, test_size=test_size, random_state=42');
  });

  it('caps categorical one-hot width for high-cardinality direct training datasets', () => {
    const script = buildTrainingScript({
      datasetFilename: 'data.csv',
      datasetId: 'dataset-1',
      templateId: 'linear_regression',
      targetColumn: 'target',
      parameters: {},
      testSize: 0.2,
      outputDir: '/workspace/models/run-2',
    });

    expect(script).toContain("OneHotEncoder(handle_unknown='infrequent_if_exist', min_frequency=10, max_categories=50, sparse_output=False)");
  });

  it('keeps random-forest direct training sparse instead of forcing dense categorical matrices', () => {
    const script = buildTrainingScript({
      datasetFilename: 'data.csv',
      datasetId: 'dataset-1',
      templateId: 'random_forest_regressor',
      targetColumn: 'target',
      parameters: {},
      testSize: 0.2,
      outputDir: '/workspace/models/run-rf',
    });

    expect(script).toContain("numeric_pipeline = Pipeline([('imputer', SimpleImputer(strategy='median'))])");
    expect(script).toContain("OneHotEncoder(handle_unknown='infrequent_if_exist', min_frequency=10, max_categories=50))");
    expect(script).not.toContain("OneHotEncoder(handle_unknown='infrequent_if_exist', min_frequency=10, max_categories=50, sparse_output=False)");
  });

  it('caps clustering categorical width before one-hot expansion', () => {
    const script = buildTrainingScript({
      datasetFilename: 'data.csv',
      datasetId: 'dataset-1',
      templateId: 'kmeans',
      parameters: {},
      testSize: 0.2,
      outputDir: '/workspace/models/run-3',
    });

    expect(script).toContain("X[categorical_cols] = X[categorical_cols].fillna('missing').astype(str)");
    expect(script).toContain('value_counts().nlargest(50).index');
    expect(script).toContain('X[col] = np.where(X[col].isin(top_categories), X[col], "__OTHER__")');
    expect(script).toContain('silhouette_sample_size = min(len(X), 2000)');
    expect(script).toContain('silhouette_score(X, labels, sample_size=silhouette_sample_size, random_state=42)');
  });
});

describe('trainModel', () => {
  it('stores copied artifacts under the persisted modelId instead of the workspace UUID', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      metrics: { rmse: 1.23 },
      featureColumns: ['feat_a'],
      sampleCount: 12,
      targetColumn: 'target',
      featureTypes: { feat_a: 'float' },
      sampleRequest: { feat_a: 1.5 },
    }));

    const createdRecord = makeCreatedRecord();
    let currentRecord = createdRecord;
    mockModelCreate.mockResolvedValue(createdRecord);
    mockModelUpdate.mockImplementation(async (_id: string, updater: (current: typeof createdRecord) => typeof createdRecord) => {
      currentRecord = updater(currentRecord);
      return currentRecord;
    });

    const result = await trainModel({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      templateId: 'random_forest_regressor',
      targetColumn: 'target',
    });

    expect(mockCopyFile).toHaveBeenCalledWith(
      '/tmp/test-workspaces/project-1/model-runtime/models/workspace-model-id/model.joblib',
      '/tmp/model-storage/persisted-model-id/model.joblib',
    );
    expect(mockCopyFile).toHaveBeenCalledWith(
      '/tmp/test-workspaces/project-1/model-runtime/models/workspace-model-id/metrics.json',
      '/tmp/model-storage/persisted-model-id/metrics.json',
    );
    expect(result.model.artifact?.path).toBe('/tmp/model-storage/persisted-model-id/model.joblib');
    expect(mockRunEvaluation).toHaveBeenCalledWith('persisted-model-id');
  });

  it('adds n_jobs=-1 for random-forest direct training when not explicitly provided', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      metrics: { rmse: 1.23 },
      featureColumns: ['feat_a'],
      sampleCount: 12,
      targetColumn: 'target',
    }));

    const createdRecord = makeCreatedRecord();
    let currentRecord = createdRecord;
    mockModelCreate.mockResolvedValue(createdRecord);
    mockModelUpdate.mockImplementation(async (_id: string, updater: (current: typeof createdRecord) => typeof createdRecord) => {
      currentRecord = updater(currentRecord);
      return currentRecord;
    });

    await trainModel({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      templateId: 'random_forest_regressor',
      targetColumn: 'target',
    });

    expect(mockKernelExecute.mock.calls[0]?.[1]).toContain('RandomForestRegressor(n_estimators=200, max_depth=10, random_state=42, n_jobs=-1)');
    expect(mockModelCreate.mock.calls[0]?.[0]?.parameters).toMatchObject({ n_jobs: -1 });
  });

  it('writes a clustering evaluation artifact immediately and skips background evaluation', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      metrics: { silhouette: 0.42 },
      featureColumns: ['feat_a'],
      sampleCount: 20,
      clusterSizes: { '0': 8, '1': 12 },
    }));

    const createdRecord = makeCreatedRecord({
      modelId: 'persisted-cluster-id',
      templateId: 'kmeans',
      taskType: 'clustering',
      algorithm: 'KMeans',
    });
    let currentRecord = createdRecord;
    mockModelCreate.mockResolvedValue(createdRecord);
    mockModelUpdate.mockImplementation(async (_id: string, updater: (current: typeof createdRecord) => typeof createdRecord) => {
      currentRecord = updater(currentRecord);
      return currentRecord;
    });

    const result = await trainModel({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      templateId: 'kmeans',
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/model-storage/persisted-cluster-id/evaluation.json',
      expect.stringContaining('"taskType":"clustering"'),
      'utf8',
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/model-storage/persisted-cluster-id/evaluation.json',
      expect.stringContaining('"cluster_sizes":{"0":8,"1":12}'),
      'utf8',
    );
    expect(result.model.evaluationStatus).toBe('ready');
    expect(mockRunEvaluation).not.toHaveBeenCalled();
  });

  it('marks direct training failures as evaluation failures immediately', async () => {
    mockKernelExecute.mockResolvedValue({
      status: 'error',
      stderr: 'Execution timed out after 30000ms',
    });

    const failedRecord = makeCreatedRecord({
      modelId: 'failed-model-id',
      status: 'failed',
      error: 'Execution timed out after 30000ms',
      evaluationStatus: 'failed',
      evaluationError: 'Execution timed out after 30000ms',
    });
    mockModelCreate.mockResolvedValue(failedRecord);

    const result = await trainModel({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      templateId: 'random_forest_regressor',
      targetColumn: 'target',
    });

    expect(mockModelCreate.mock.calls[0]?.[0]).toMatchObject({
      status: 'failed',
      evaluationStatus: 'failed',
      evaluationError: 'Execution timed out after 30000ms',
    });
    expect(result.success).toBe(false);
    expect(result.model.evaluationStatus).toBe('failed');
    expect(result.model.evaluationError).toBe('Execution timed out after 30000ms');
  });
});
