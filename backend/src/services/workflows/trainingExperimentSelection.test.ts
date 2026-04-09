import { describe, expect, it } from 'vitest';

import { parseApprovedTrainingExperimentNames } from './trainingExperimentSelection.js';

describe('parseApprovedTrainingExperimentNames', () => {
  it('accepts the plural approval message but limits execution to the first selected model', () => {
    expect(
      parseApprovedTrainingExperimentNames(
        'Approved. Proceed with training the selected models: ridge, random forest, linear baseline.'
      )
    ).toEqual(['ridge']);
  });

  it('accepts the singular approval message for one-at-a-time training', () => {
    expect(
      parseApprovedTrainingExperimentNames(
        'Approved. Proceed with training the selected model: ridge.'
      )
    ).toEqual(['ridge']);
  });
});
