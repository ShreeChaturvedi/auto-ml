import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPreprocessingCellContent,
  buildPreprocessingCellContents,
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

  it('sanitizes invalid dataframeName to default', async () => {
    getByIdMock.mockResolvedValue({
      datasetId: 'ds-1',
      projectId: 'project-1',
      filename: 'data.csv',
      fileType: 'csv'
    });

    for (const bad of ['df; import os', 'a b', '123abc', '', 'x'.repeat(100)]) {
      const context = await resolvePreprocessingExecutionContext('project-1', {
        preprocessing: {
          runId: 'prep-1',
          stepId: 'step-1',
          datasetId: 'ds-1',
          dataframeName: bad
        }
      });
      expect(context?.dataframeName).toBe('df');
    }
  });

  it('builds visible cell content with load/save helper calls around user code', () => {
    const content = buildPreprocessingCellContent({
      filename: 'subscriptions.csv', datasetId: 'ds-1', fileType: 'csv', dataframeName: 'df',
      userCode: 'df["subscriptions"] = df["subscriptions"].fillna(df["subscriptions"].median())'
    });

    expect(content).toContain('import pandas as pd');
    expect(content).toContain('import numpy as np');
    expect(content).toContain('load_preprocessing_dataset("subscriptions.csv", "ds-1", "csv", "df")');
    expect(content).toContain('df["subscriptions"] = df["subscriptions"].fillna(df["subscriptions"].median())');
    expect(content).toContain('save_preprocessing_dataset("subscriptions.csv", "ds-1", "csv", "df")');
  });

  it('does not contain invisible Python wrapping or hidden file I/O logic', () => {
    const content = buildPreprocessingCellContent({
      filename: 'data.json', datasetId: 'ds-1', fileType: 'json', dataframeName: 'df',
      userCode: 'df = df.dropna()'
    });

    // No invisible globals and no raw file I/O. Visible standard imports are intentional.
    expect(content).not.toContain('_automl_preprocessing_df');
    expect(content).not.toContain('_automl_preprocessing');
    expect(content).not.toContain('pd.read_');
    expect(content).not.toContain('.to_json(');
    expect(content).not.toContain('.to_csv(');
  });

  it('handles xlsx file type with custom dataframe name', () => {
    const content = buildPreprocessingCellContent({
      filename: 'data.xlsx', datasetId: 'ds-1', fileType: 'xlsx', dataframeName: 'my_df',
      userCode: 'my_df = my_df.head(10)'
    });

    expect(content).toContain('load_preprocessing_dataset("data.xlsx", "ds-1", "xlsx", "my_df")');
    expect(content).toContain('my_df = my_df.head(10)');
    expect(content).toContain('save_preprocessing_dataset("data.xlsx", "ds-1", "xlsx", "my_df")');
  });

  it('cell content matches what the kernel executes (no invisible wrapping)', () => {
    const content = buildPreprocessingCellContent({
      filename: 'data.csv', datasetId: 'ds-1', fileType: 'csv', dataframeName: 'df',
      userCode: 'df["age"] = df["age"].fillna(0)'
    });

    // The content IS the execution code — verify its structure
    const lines = content.split('\n');
    expect(lines[0]).toBe('import numpy as np');
    expect(lines[1]).toBe('import pandas as pd');
    expect(lines[3]).toBe('df = load_preprocessing_dataset("data.csv", "ds-1", "csv", "df")');
    expect(lines[lines.length - 1]).toBe('save_preprocessing_dataset("data.csv", "ds-1", "csv", "df")');
    expect(content).toContain('df["age"] = df["age"].fillna(0)');
  });

  it('splits code with explicit cell markers into separate visible notebook cells', () => {
    const cells = buildPreprocessingCellContents({
      filename: 'data.csv',
      datasetId: 'ds-1',
      fileType: 'csv',
      dataframeName: 'df',
      userCode: [
        '# Cell 1',
        'missing_before = df.isna().sum()',
        'print(missing_before)',
        '',
        '# Cell 2',
        'df = df.fillna(0)'
      ].join('\n')
    });

    expect(cells).toHaveLength(2);
    expect(cells[0]).toContain('import pandas as pd');
    expect(cells[0]).toContain('load_preprocessing_dataset("data.csv", "ds-1", "csv", "df")');
    expect(cells[0]).toContain('missing_before = df.isna().sum()');
    expect(cells[0]).not.toContain('save_preprocessing_dataset(');
    expect(cells[1]).toContain('import pandas as pd');
    expect(cells[1]).toContain('df = df.fillna(0)');
    expect(cells[1]).toContain('save_preprocessing_dataset("data.csv", "ds-1", "csv", "df")');
    expect(cells[1]).not.toContain('load_preprocessing_dataset(');
  });

  it('guarantees pandas imports for transformations that call pd.get_dummies()', () => {
    const content = buildPreprocessingCellContent({
      filename: 'data.csv',
      datasetId: 'ds-1',
      fileType: 'csv',
      dataframeName: 'df',
      userCode: 'df = pd.get_dummies(df, columns=["segment"], dtype="uint8")'
    });

    expect(content).toContain('import pandas as pd');
    expect(content).toContain('df = pd.get_dummies(df, columns=["segment"], dtype="uint8")');
  });
});
