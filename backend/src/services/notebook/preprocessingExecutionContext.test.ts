import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPreprocessingExecutionCode,
  resolvePreprocessingExecutionContext
} from './preprocessingExecutionContext.js';

const getByIdMock = vi.fn();
const { runGetByIdMock } = vi.hoisted(() => {
  const runGetByIdMock = vi.fn();
  return { runGetByIdMock };
});

vi.mock('../../repositories/datasetRepository.js', () => ({
  createDatasetRepository: vi.fn(() => ({
    getById: getByIdMock
  }))
}));

vi.mock('../../repositories/preprocessingRunRepository.js', () => ({
  createFilePreprocessingRunRepository: vi.fn(() => ({
    getById: runGetByIdMock
  }))
}));

describe('preprocessingExecutionContext', () => {
  beforeEach(() => {
    getByIdMock.mockReset();
    runGetByIdMock.mockReset();
  });

  it('resolves preprocessing metadata into an execution context', async () => {
    getByIdMock.mockResolvedValue({
      datasetId: 'ds-1',
      projectId: 'project-1',
      filename: 'subscriptions.csv',
      fileType: 'csv'
    });

    const context = await resolvePreprocessingExecutionContext('project-1', {
      preprocessing: {
        runId: 'prep-1',
        stepId: 'step-1',
        datasetId: 'ds-1',
        dataframeName: 'df'
      }
    });

    expect(context).toEqual({
      runId: 'prep-1',
      stepId: 'step-1',
      datasetId: 'ds-1',
      filename: 'subscriptions.csv',
      fileType: 'csv',
      dataframeName: 'df'
    });
  });

  it('resolves datasetId from run checkpoint when missing from metadata', async () => {
    runGetByIdMock.mockResolvedValue({
      runId: 'prep-1',
      activeDatasetId: 'ds-1',
      checkpoints: [
        { checkpointId: 'ckpt-1', datasetId: 'ds-1', stepIds: ['step-1'], label: 'test', createdAt: '', replayUntilEventSequence: 1 }
      ]
    });
    getByIdMock.mockResolvedValue({
      datasetId: 'ds-1',
      projectId: 'project-1',
      filename: 'data.csv',
      fileType: 'csv'
    });

    const context = await resolvePreprocessingExecutionContext('project-1', {
      preprocessing: { runId: 'prep-1', stepId: 'step-1' }
    });

    expect(context).toEqual({
      runId: 'prep-1',
      stepId: 'step-1',
      datasetId: 'ds-1',
      filename: 'data.csv',
      fileType: 'csv',
      dataframeName: 'df'
    });
  });

  it('falls back to activeDatasetId when no checkpoint matches', async () => {
    runGetByIdMock.mockResolvedValue({
      runId: 'prep-1',
      activeDatasetId: 'ds-2',
      checkpoints: []
    });
    getByIdMock.mockResolvedValue({
      datasetId: 'ds-2',
      projectId: 'project-1',
      filename: 'other.csv',
      fileType: 'csv'
    });

    const context = await resolvePreprocessingExecutionContext('project-1', {
      preprocessing: { runId: 'prep-1', stepId: 'step-1' }
    });

    expect(context).toEqual({
      runId: 'prep-1',
      stepId: 'step-1',
      datasetId: 'ds-2',
      filename: 'other.csv',
      fileType: 'csv',
      dataframeName: 'df'
    });
  });

  it('returns null when run has no datasetId and no checkpoints', async () => {
    runGetByIdMock.mockResolvedValue({
      runId: 'prep-1',
      checkpoints: []
    });

    const context = await resolvePreprocessingExecutionContext('project-1', {
      preprocessing: { runId: 'prep-1', stepId: 'step-1' }
    });

    expect(context).toBeNull();
  });

  it('returns null when preprocessing metadata lacks runId and stepId', async () => {
    const context = await resolvePreprocessingExecutionContext('project-1', {
      preprocessing: {}
    });

    expect(context).toBeNull();
    expect(getByIdMock).not.toHaveBeenCalled();
  });

  it('wraps cell code with deterministic dataframe load and persistence', () => {
    const code = buildPreprocessingExecutionCode({
      runId: 'prep-1',
      stepId: 'step-1',
      datasetId: 'ds-1',
      filename: 'subscriptions.csv',
      fileType: 'csv',
      dataframeName: 'df'
    }, 'df["subscriptions"] = df["subscriptions"].fillna(df["subscriptions"].median())');

    expect(code).toContain('dataset_path = _automl_preprocessing["dataset_path"]');
    expect(code).toContain('df = _automl_preprocessing_df');
    expect(code).toContain('df = pd.read_csv(dataset_path)');
    expect(code).toContain('df["subscriptions"] = df["subscriptions"].fillna(df["subscriptions"].median())');
    expect(code).toContain('_automl_preprocessing_df = df');
    expect(code).toContain('df.to_csv(dataset_path, index=False)');
  });
});
