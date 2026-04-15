import { describe, expect, it } from 'vitest';

import { buildFeatureIntentPrompt } from '../featurePrompt';

describe('buildFeatureIntentPrompt', () => {
  it('anchors feature requests to the current dataset and explicit user notes', () => {
    const prompt = buildFeatureIntentPrompt(
      'Potential next FE-prep actions:\n- missing text values remain in CF EE Division',
      {
        datasetLabel: 'tableau_usage_field_summary_processed_workbook_1.csv',
        targetColumn: 'usage_count'
      }
    );

    expect(prompt).toContain('Use only the currently selected dataset "tableau_usage_field_summary_processed_workbook_1.csv"');
    expect(prompt).toContain('Treat the user\'s explicit notes, dataset summary, and requested next actions in this message as the primary source of truth');
    expect(prompt).toContain('propose features tied to those named items first');
    expect(prompt).toContain('Use "usage_count" as the current target context');
  });

  it('tells the model not to invent a target when FE target is unset', () => {
    const prompt = buildFeatureIntentPrompt('Suggest some date features.', {
      datasetLabel: 'feature_v1.csv'
    });

    expect(prompt).toContain('No target column is selected. Do not invent one or assume the first column is the target.');
  });
});
