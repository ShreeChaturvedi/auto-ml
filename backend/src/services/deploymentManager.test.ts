import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModelRecord } from '../types/model.js';

const mockGetModelById = vi.fn();
const mockEnsureRuntimeImage = vi.fn();
const mockExecDocker = vi.fn();
const mockBuildInferenceDockerRunArgs = vi.fn();
const mockBuildInferenceServerScript = vi.fn(() => 'print("ok")');

const mockDeploymentRepo = {
  listByProject: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getById: vi.fn(),
  delete: vi.fn(),
  listNonStopped: vi.fn(),
};

let tmpRoot = '';
let deploymentStorageDir = '';
let modelStorageDir = '';

vi.mock('../config.js', () => ({
  env: {
    get modelMetadataPath() { return join(tmpRoot || tmpdir(), 'models.json'); },
    get modelStorageDir() { return modelStorageDir; },
    get deploymentStorageDir() { return deploymentStorageDir; },
  },
}));

vi.mock('../repositories/modelRepository.js', () => ({
  createModelRepository: vi.fn(() => ({
    getById: mockGetModelById,
  })),
}));

vi.mock('../repositories/deploymentRepository.js', () => ({
  createDeploymentRepository: vi.fn(async () => mockDeploymentRepo),
}));

vi.mock('./container/imageManager.js', () => ({
  ensureRuntimeImage: mockEnsureRuntimeImage,
}));

vi.mock('./dockerUtils.js', () => ({
  execDocker: mockExecDocker,
}));

vi.mock('./container/inferenceDockerBuilder.js', () => ({
  buildInferenceDockerRunArgs: mockBuildInferenceDockerRunArgs,
}));

vi.mock('./inferenceServerBuilder.js', () => ({
  buildInferenceServerScript: mockBuildInferenceServerScript,
}));

const { deployModel, startDeployment } = await import('./deploymentManager.js');

function makeModel(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    modelId: 'model-1',
    projectId: 'project-1',
    datasetId: 'dataset-1',
    name: 'Ridge Regression',
    templateId: 'template-1',
    taskType: 'regression',
    library: 'sklearn',
    algorithm: 'ridge',
    parameters: {},
    metrics: { rmse: 1.23 },
    status: 'completed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    artifact: {
      filename: 'model.joblib',
      path: join(modelStorageDir, 'artifact-dir', 'model.joblib'),
      size: 42,
    },
    featureColumns: ['age'],
    featureTypes: { age: 'float' },
    sampleRequest: { age: 42 },
    ...overrides,
  };
}

async function persistArtifact(model: ModelRecord): Promise<void> {
  const artifactPath = model.artifact?.path;
  if (!artifactPath) {
    throw new Error('Model artifact path is required for this test');
  }
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, 'fake-model-bytes', 'utf8');
}

describe('deploymentManager', () => {
  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'deployment-manager-test-'));
    deploymentStorageDir = join(tmpRoot, 'deployments');
    modelStorageDir = join(tmpRoot, 'models');
    await mkdir(deploymentStorageDir, { recursive: true });
    await mkdir(modelStorageDir, { recursive: true });

    mockGetModelById.mockReset();
    mockEnsureRuntimeImage.mockReset();
    mockExecDocker.mockReset();
    mockBuildInferenceDockerRunArgs.mockReset();
    mockBuildInferenceServerScript.mockClear();

    mockDeploymentRepo.listByProject.mockReset();
    mockDeploymentRepo.create.mockReset();
    mockDeploymentRepo.update.mockReset();
    mockDeploymentRepo.getById.mockReset();
    mockDeploymentRepo.delete.mockReset();
    mockDeploymentRepo.listNonStopped.mockReset();

    mockEnsureRuntimeImage.mockResolvedValue('automl-python-runtime:3.11');
    mockBuildInferenceDockerRunArgs.mockReturnValue(['run', 'fake']);
    mockExecDocker
      .mockResolvedValueOnce({ stdout: 'container-123\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '0.0.0.0:55001\n', stderr: '' });

    mockDeploymentRepo.listByProject.mockResolvedValue([]);
    mockDeploymentRepo.create.mockResolvedValue({
      deploymentId: 'deployment-1',
      modelId: 'model-1',
      projectId: 'project-1',
      name: 'endpoint',
      status: 'creating',
      config: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mockDeploymentRepo.update.mockImplementation(async (_deploymentId: string, fields: Record<string, unknown>) => ({
      deploymentId: 'deployment-1',
      modelId: 'model-1',
      projectId: 'project-1',
      name: 'endpoint',
      status: fields.status ?? 'creating',
      config: {},
      containerId: fields.containerId as string | undefined,
      port: fields.port as number | undefined,
      endpointUrl: fields.endpointUrl as string | undefined,
      errorMessage: fields.errorMessage as string | undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('mounts the directory that actually contains the persisted model artifact during deploy', async () => {
    const model = makeModel({
      modelId: '360a43cf-c361-4f42-970b-f83d627b3680',
      artifact: {
        filename: 'model.joblib',
        path: join(modelStorageDir, '8a658025-65da-41d3-9dae-771454c49ba9-tuned-1775192508361', 'model.joblib'),
        size: 80680,
      },
    });
    await persistArtifact(model);
    mockGetModelById.mockResolvedValue(model);

    await deployModel(model.modelId, model.projectId, 'endpoint');

    expect(mockBuildInferenceDockerRunArgs).toHaveBeenCalledWith(expect.objectContaining({
      modelArtifactPath: dirname(model.artifact!.path),
    }));
  });

  it('forwards runtimeDependencies from model.metadata to the docker-args builder (xgboost deploy)', async () => {
    const model = makeModel({
      modelId: 'xgb-model',
      algorithm: 'xgboost',
      metadata: { runtimeDependencies: ['xgboost'] } as Record<string, unknown>,
    });
    await persistArtifact(model);
    mockGetModelById.mockResolvedValue(model);

    await deployModel(model.modelId, model.projectId, 'endpoint');

    expect(mockBuildInferenceDockerRunArgs).toHaveBeenCalledWith(expect.objectContaining({
      runtimeDependencies: expect.arrayContaining(['xgboost']),
    }));
  });

  it('infers runtimeDependencies from model.algorithm when metadata is empty (catboost deploy)', async () => {
    const model = makeModel({
      modelId: 'cat-model',
      algorithm: 'catboost',
    });
    await persistArtifact(model);
    mockGetModelById.mockResolvedValue(model);

    await deployModel(model.modelId, model.projectId, 'endpoint');

    expect(mockBuildInferenceDockerRunArgs).toHaveBeenCalledWith(expect.objectContaining({
      runtimeDependencies: expect.arrayContaining(['catboost']),
    }));
  });

  it('passes empty runtimeDependencies for plain sklearn models (no regression)', async () => {
    const model = makeModel({ modelId: 'sk-model', algorithm: 'ridge' });
    await persistArtifact(model);
    mockGetModelById.mockResolvedValue(model);

    await deployModel(model.modelId, model.projectId, 'endpoint');

    expect(mockBuildInferenceDockerRunArgs).toHaveBeenCalledWith(expect.objectContaining({
      runtimeDependencies: [],
    }));
  });

  it('mounts the persisted artifact directory when restarting a stopped deployment', async () => {
    const model = makeModel({
      modelId: '360a43cf-c361-4f42-970b-f83d627b3680',
      artifact: {
        filename: 'model.joblib',
        path: join(modelStorageDir, '8a658025-65da-41d3-9dae-771454c49ba9-tuned-1775192508361', 'model.joblib'),
        size: 80680,
      },
    });
    await persistArtifact(model);
    mockGetModelById.mockResolvedValue(model);
    mockDeploymentRepo.getById.mockResolvedValue({
      deploymentId: 'deployment-1',
      modelId: model.modelId,
      projectId: model.projectId,
      name: 'endpoint',
      status: 'stopped',
      containerId: 'old-container',
      port: 55001,
      endpointUrl: 'http://127.0.0.1:55001',
      config: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await startDeployment('deployment-1');

    expect(mockBuildInferenceDockerRunArgs).toHaveBeenCalledWith(expect.objectContaining({
      modelArtifactPath: dirname(model.artifact!.path),
    }));
  });

  it('rejects relative artifact paths instead of mounting arbitrary directories', async () => {
    const model = makeModel({
      artifact: {
        filename: 'model.joblib',
        path: 'model.joblib',
        size: 42,
      },
    });
    mockGetModelById.mockResolvedValue(model);

    await expect(deployModel(model.modelId, model.projectId, 'endpoint')).rejects.toThrow();
    expect(mockBuildInferenceDockerRunArgs).not.toHaveBeenCalled();
  });

  it('rejects models that belong to a different project as not found', async () => {
    const model = makeModel({ projectId: 'project-2' });
    await persistArtifact(model);
    mockGetModelById.mockResolvedValue(model);

    await expect(deployModel(model.modelId, 'project-1', 'endpoint')).rejects.toMatchObject({
      code: 'MODEL_PROJECT_MISMATCH',
      message: 'Model not found',
    });
    expect(mockDeploymentRepo.create).not.toHaveBeenCalled();
  });

  it('marks the deployment failed when the inference container exits during readiness', async () => {
    vi.useFakeTimers();

    const model = makeModel();
    await persistArtifact(model);
    mockGetModelById.mockResolvedValue(model);

    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    mockExecDocker.mockReset();
    mockExecDocker
      .mockResolvedValueOnce({ stdout: 'container-123\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '0.0.0.0:55001\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '{"Status":"exited","ExitCode":3}', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'Application startup failed. Exiting.', stderr: '' });

    const deployPromise = deployModel(model.modelId, model.projectId, 'endpoint');
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(deployPromise).rejects.toThrow();
    expect(mockDeploymentRepo.update).toHaveBeenLastCalledWith(
      'deployment-1',
      expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringContaining('Application startup failed'),
      }),
    );
  });
});
