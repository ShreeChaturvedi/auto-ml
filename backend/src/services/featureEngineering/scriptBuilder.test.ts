import { describe, expect, it } from 'vitest';

import type { FeatureSpec } from '../featureEngineering.js';

import { buildFeatureEngineeringScript } from './scriptBuilder.js';

describe('buildFeatureEngineeringScript', () => {
  const baseParams = {
    datasetFilename: 'train.csv',
    datasetId: 'ds-123',
    outputFilename: 'train_features.csv',
    outputFormat: 'csv' as const
  };

  it('loads dataset and applies a simple template feature', () => {
    const features: FeatureSpec[] = [
      {
        sourceColumn: 'value',
        featureName: 'value_log',
        method: 'log1p_transform'
      }
    ];
    const script = buildFeatureEngineeringScript({ ...baseParams, features });

    expect(script).toContain('import pandas as pd');
    expect(script).toContain('dataset_path = resolve_dataset_path("train.csv", "ds-123")');
    expect(script).toContain('df = pd.read_csv(dataset_path)');
    expect(script).toContain('# Feature: value_log');
    expect(script).toContain('df["value_log"] = np.log1p(df["value"])');
    expect(script).toContain('df.to_csv(output_path, index=False)');
  });

  it('assembles a mixed script with both LLM-code features and template features', () => {
    const features: FeatureSpec[] = [
      {
        sourceColumn: 'value',
        featureName: 'value_log',
        method: 'log1p_transform'
        // no code — uses template
      },
      {
        sourceColumn: 'CF EE Division',
        secondaryColumn: 'CF EE Department',
        featureName: 'Department Usage Share',
        method: 'ratio',
        code: [
          "division_total = df.groupby('CF EE Division')['usage_count'].transform('sum')",
          "df['department_usage_share'] = df['usage_count'] / division_total"
        ].join('\n')
      },
      {
        sourceColumn: 'DATE',
        featureName: 'date_weekday',
        method: 'extract_weekday'
        // no code — uses template
      }
    ];
    const script = buildFeatureEngineeringScript({ ...baseParams, features });

    // Dataset loads once at the top
    expect((script.match(/pd\.read_csv\(dataset_path\)/g) ?? []).length).toBe(1);

    // Simple template for log1p
    expect(script).toContain('df["value_log"] = np.log1p(df["value"])');

    // LLM code for the groupby ratio (wrapped in function scope)
    expect(script).toContain('def _apply_llm_feature_department_usage_share(df):');
    expect(script).toContain("df.groupby('CF EE Division')");
    expect(script).toContain('df = _apply_llm_feature_department_usage_share(df)');

    // Simple template for extract_weekday
    expect(script).toContain('df["date_weekday"] = pd.to_datetime(df["DATE"]).dt.weekday');

    // All three features appear in order with their headers
    const logIdx = script.indexOf('# Feature: value_log');
    const ratioIdx = script.indexOf('# Feature: Department Usage Share');
    const weekdayIdx = script.indexOf('# Feature: date_weekday');
    expect(logIdx).toBeGreaterThan(-1);
    expect(ratioIdx).toBeGreaterThan(logIdx);
    expect(weekdayIdx).toBeGreaterThan(ratioIdx);
  });

  it('ensures LLM code with self-loading prelude does NOT clobber the shared df', () => {
    const features: FeatureSpec[] = [
      {
        sourceColumn: 'value',
        featureName: 'log_feature',
        method: 'log1p_transform',
        code: [
          'import pandas as pd',
          'dataset_path = resolve_dataset_path("other.csv", "other-id")',
          'df = pd.read_csv(dataset_path)',
          "df['log_feature'] = df['value'].apply(lambda x: x * 2)"
        ].join('\n')
      }
    ];
    const script = buildFeatureEngineeringScript({ ...baseParams, features });

    // The outer script's dataset load should be intact
    expect(script).toContain('dataset_path = resolve_dataset_path("train.csv", "ds-123")');

    // The LLM's self-loading prelude should have been stripped BEFORE wrapping
    // (we should not see the LLM's "other.csv" load path in the wrapped function)
    const wrapperIdx = script.indexOf('def _apply_llm_feature_log_feature');
    expect(wrapperIdx).toBeGreaterThan(-1);
    const wrapperEndIdx = script.indexOf('df = _apply_llm_feature_log_feature(df)');
    expect(wrapperEndIdx).toBeGreaterThan(wrapperIdx);
    const wrappedRegion = script.slice(wrapperIdx, wrapperEndIdx);
    expect(wrappedRegion).not.toContain('other.csv');
    expect(wrappedRegion).not.toContain('pd.read_csv(dataset_path)');

    // The actual mutation is preserved
    expect(wrappedRegion).toContain("df['log_feature'] = df['value'].apply");
  });

  it('emits metadata sidecar write at the end', () => {
    const features: FeatureSpec[] = [
      {
        sourceColumn: 'value',
        featureName: 'value_log',
        method: 'log1p_transform'
      }
    ];
    const script = buildFeatureEngineeringScript({ ...baseParams, features });

    expect(script).toContain('/workspace/_feature_meta.json');
    expect(script).toContain('json.dump(_meta, _f)');
  });
});
