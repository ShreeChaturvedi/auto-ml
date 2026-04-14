import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listModels, trainModel } from '../../lib/api/models';
import type { ModelRecord } from '../../types/model';
import { useModelStore } from '../modelStore';

vi.mock('../../lib/api/models', () => ({
  listModelTemplates: vi.fn(),
  listModels: vi.fn(),
  trainModel: vi.fn(),
  deleteModel: vi.fn(),
}));

vi.mock('../experimentsStore', () => ({
  useExperimentsStore: {
    getState: () => ({
      selectedModelId: null,
      comparisonModelIds: [],
      selectModel: vi.fn(),
      toggleComparison: vi.fn(),
      purgeModelCache: vi.fn(),
    }),
  },
}));

const listModelsMock = vi.mocked(listModels);
const trainModelMock = vi.mocked(trainModel);

function resetModelStore() {
  useModelStore.setState({
    templates: [],
    models: [],
    modelsProjectId: null,
    isLoadingTemplates: false,
    isLoadingModels: false,
    activeModelsRequestScope: null,
    isTraining: false,
    error: null,
    trainingRunStates: {},
    currentStage: null,
    trainingRunId: null,
  });
}

function buildModel(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    modelId: 'model-1',
    projectId: 'project-1',
    datasetId: 'dataset-1',
    name: 'Model 1',
    templateId: 'template-1',
    taskType: 'classification',
    library: 'sklearn',
    algorithm: 'RandomForestClassifier',
    parameters: {},
    metrics: { accuracy: 0.91 },
    status: 'completed',
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z',
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('modelStore.refreshModels', () => {
  beforeEach(() => {
    resetModelStore();
    vi.clearAllMocks();
  });

  it('shows the loading flag for a cold project fetch', async () => {
    const deferred = createDeferred<{ models: ModelRecord[] }>();
    listModelsMock.mockReturnValueOnce(deferred.promise);

    const refreshPromise = useModelStore.getState().refreshModels('project-1');

    expect(useModelStore.getState().isLoadingModels).toBe(true);
    expect(useModelStore.getState().activeModelsRequestScope).toBe('project-1');

    deferred.resolve({ models: [buildModel()] });
    await refreshPromise;

    expect(useModelStore.getState().isLoadingModels).toBe(false);
    expect(useModelStore.getState().modelsProjectId).toBe('project-1');
    expect(useModelStore.getState().models).toHaveLength(1);
  });

  it('keeps warm same-project models visible during a refresh', async () => {
    useModelStore.setState({
      models: [buildModel()],
      modelsProjectId: 'project-1',
      isLoadingModels: false,
    });

    const deferred = createDeferred<{ models: ModelRecord[] }>();
    listModelsMock.mockReturnValueOnce(deferred.promise);

    const refreshPromise = useModelStore.getState().refreshModels('project-1');

    expect(useModelStore.getState().isLoadingModels).toBe(false);
    expect(useModelStore.getState().models[0]?.modelId).toBe('model-1');

    deferred.resolve({ models: [buildModel({ modelId: 'model-2', name: 'Model 2' })] });
    await refreshPromise;

    expect(useModelStore.getState().isLoadingModels).toBe(false);
    expect(useModelStore.getState().models[0]?.modelId).toBe('model-2');
  });

  it('deduplicates overlapping refreshes for the same scope', async () => {
    const deferred = createDeferred<{ models: ModelRecord[] }>();
    listModelsMock.mockReturnValueOnce(deferred.promise);

    const firstRefresh = useModelStore.getState().refreshModels('project-1');
    const secondRefresh = useModelStore.getState().refreshModels('project-1');

    expect(listModelsMock).toHaveBeenCalledTimes(1);

    deferred.resolve({ models: [buildModel()] });
    await firstRefresh;
    await secondRefresh;
  });
});

describe('modelStore.trainModel', () => {
  beforeEach(() => {
    resetModelStore();
    vi.clearAllMocks();
  });

  it('re-scopes the model list to the trained model project', async () => {
    useModelStore.setState({
      models: [buildModel({ modelId: 'other-model', projectId: 'project-2', name: 'Other model' })],
      modelsProjectId: 'project-2',
    });

    const trainedModel = buildModel({ modelId: 'trained-model', name: 'Trained model' });
    trainModelMock.mockResolvedValue({
      model: trainedModel,
      success: true,
      message: 'ok',
    });

    await useModelStore.getState().trainModel({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      templateId: 'template-1',
    });

    expect(useModelStore.getState().modelsProjectId).toBe('project-1');
    expect(useModelStore.getState().models).toEqual([trainedModel]);
  });
});
