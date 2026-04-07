import { describe, expect, it } from 'vitest';

import { assertFeaturesProducedNewColumns } from './featureEngineering.js';

describe('assertFeaturesProducedNewColumns — apply pipeline degenerate guard', () => {
  it('throws when output columns are identical to source columns', () => {
    expect(() =>
      assertFeaturesProducedNewColumns(
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        [{ featureName: 'placeholder_feature' }],
        'train.csv',
        1
      )
    ).toThrow(/produced no new columns/);
  });

  it('throws when output columns are a strict subset of source columns', () => {
    // e.g., script dropped a column but added nothing
    expect(() =>
      assertFeaturesProducedNewColumns(
        ['a', 'b', 'c'],
        ['a', 'b'],
        [{ featureName: 'useless_feature' }],
        'train.csv',
        1
      )
    ).toThrow(/produced no new columns/);
  });

  it('does not throw when at least one new column is added', () => {
    expect(() =>
      assertFeaturesProducedNewColumns(
        ['a', 'b', 'c'],
        ['a', 'b', 'c', 'a_log'],
        [{ featureName: 'log_a' }],
        'train.csv',
        1
      )
    ).not.toThrow();
  });

  it('does not throw for multi-feature case with mixed new columns', () => {
    expect(() =>
      assertFeaturesProducedNewColumns(
        ['usage_count', 'DATE'],
        ['usage_count', 'DATE', 'usage_count_log1p', 'date_weekday'],
        [
          { featureName: 'usage_count_log1p' },
          { featureName: 'date_weekday' }
        ],
        'tableau.csv',
        2
      )
    ).not.toThrow();
  });

  it('error message includes dataset filename and feature names for debugging', () => {
    let caught: Error | undefined;
    try {
      assertFeaturesProducedNewColumns(
        ['usage_count'],
        ['usage_count'],
        [
          { featureName: 'presentation_expression_text_length' },
          { featureName: 'business_model_frequency' }
        ],
        'tableau_usage.csv',
        2
      );
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught?.message).toContain('tableau_usage.csv');
    expect(caught?.message).toContain('presentation_expression_text_length');
    expect(caught?.message).toContain('business_model_frequency');
    expect(caught?.message).toContain('2 feature');
  });

  it('throws for the exact Department Usage Share failure case (placeholder code produces zero new columns)', () => {
    // Reproduces the real failing scenario: 5 features registered with
    // placeholder code, apply script runs but adds no new columns because
    // the LLM code was literal comments.
    expect(() =>
      assertFeaturesProducedNewColumns(
        ['CF EE Division', 'CF EE Department', 'usage_count', 'DATE', 'USER_NAME', 'Subject Area', 'Presentation Table', 'Expression - Presentation Column'],
        ['CF EE Division', 'CF EE Department', 'usage_count', 'DATE', 'USER_NAME', 'Subject Area', 'Presentation Table', 'Expression - Presentation Column'],
        [
          { featureName: 'presentation_expression_text_length' },
          { featureName: 'logical_description_word_count' },
          { featureName: 'business_model_frequency' },
          { featureName: 'presentation_table_one_hot' },
          { featureName: 'description_missing_indicator' }
        ],
        'tableau_usage_field_summary_with_dept_processed_workbook_1.csv',
        5
      )
    ).toThrow(/placeholder|targeted columns that don't exist|produced no new columns/);
  });
});
