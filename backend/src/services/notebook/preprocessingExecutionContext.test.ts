import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPreprocessingExecutionCode,
  resolvePreprocessingExecutionContext
} from './preprocessingExecutionContext.js';

const getByIdMock = vi.fn();

vi.mock('../../repositories/datasetRepository.js', () => ({
  createDatasetRepository: vi.fn(() => ({
    getById: getByIdMock
  }))
}));

describe('preprocessingExecutionContext', () => {
  beforeEach(() => {
    getByIdMock.mockReset();
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

  it('returns null when preprocessing metadata lacks a dataset binding', async () => {
    const context = await resolvePreprocessingExecutionContext('project-1', {
      preprocessing: {
        runId: 'prep-1',
        stepId: 'step-1'
      }
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
