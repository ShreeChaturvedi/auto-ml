import { describe, expect, it } from 'vitest';

import { buildDatasetContinuityPrompt } from '../continuityPrompt';

describe('buildDatasetContinuityPrompt', () => {
  it('adds continue directive for current working dataset mode', () => {
    const result = buildDatasetContinuityPrompt(
      'Impute missing values safely.',
      'continue',
      {
        datasetId: 'dataset-1',
        datasetLabel: 'usage.csv'
      }
    );

    expect(result).toContain('Impute missing values safely.');
    expect(result).toContain('Continue from the CURRENT working edited dataset');
    expect(result).toContain('Do not reload the original source dataset');
  });

  it('adds restart directive when restarting from original', () => {
    const result = buildDatasetContinuityPrompt(
      'Profile missing values.',
      'restart_from_original',
      {
        datasetId: 'dataset-1',
        datasetLabel: 'usage.csv'
      }
    );

    expect(result).toContain('Start from the ORIGINAL source dataset "usage.csv"');
    expect(result).toContain('Begin a NEW preprocessing run');
    expect(result).toContain('proceed directly to profiling and planning');
  });

  it('handles restart mode without dataset id', () => {
    const result = buildDatasetContinuityPrompt(
      'Check outliers.',
      'restart_from_original',
      {
        datasetId: null,
        datasetLabel: null
      }
    );

    expect(result).toContain('selected dataset');
    expect(result).toContain('proceed directly to profiling and planning');
  });
});
