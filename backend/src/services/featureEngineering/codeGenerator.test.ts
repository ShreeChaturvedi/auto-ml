import { describe, expect, it } from 'vitest';

import type { FeatureSpec } from '../featureEngineering.js';

import { buildFeatureCode, isActionableFeatureCode, stripSelfLoadingPrelude, wrapLlmFeatureCode } from './codeGenerator.js';

describe('isActionableFeatureCode', () => {
  it('rejects undefined, null, and empty strings', () => {
    expect(isActionableFeatureCode(undefined)).toBe(false);
    expect(isActionableFeatureCode(null)).toBe(false);
    expect(isActionableFeatureCode('')).toBe(false);
  });

  it('rejects whitespace-only strings', () => {
    expect(isActionableFeatureCode('   \n\t  ')).toBe(false);
  });

  it('rejects the reported placeholder comment verbatim (the actual bug)', () => {
    expect(
      isActionableFeatureCode('# Placeholder: materialization deferred until proposal confirmation\n')
    ).toBe(false);
  });

  it('rejects multi-line comment blocks without code', () => {
    expect(isActionableFeatureCode('# TODO\n# implement later\n# ---')).toBe(false);
  });

  it('rejects code that does not reference df', () => {
    expect(isActionableFeatureCode('x = 1 + 2\nprint(x)')).toBe(false);
  });

  it('rejects code that uses a differently-named dataframe', () => {
    expect(isActionableFeatureCode("input_df['x'] = 1")).toBe(false);
  });

  it('accepts a single simple df mutation', () => {
    expect(isActionableFeatureCode("df['x'] = 1")).toBe(true);
  });

  it('accepts code with a comment preamble followed by a df mutation', () => {
    expect(isActionableFeatureCode("# header comment\ndf['salary_log'] = np.log1p(df['salary'])")).toBe(true);
  });

  it('accepts multi-line real feature code (Department Usage Share groupby)', () => {
    const code = [
      'import numpy as np',
      "division_total = df.groupby('CF EE Division')['usage_count'].transform('sum')",
      "df['dept_share'] = np.where(division_total > 0, df['usage_count'] / division_total, 0.0)"
    ].join('\n');
    expect(isActionableFeatureCode(code)).toBe(true);
  });

  it('handles Windows CRLF line endings', () => {
    expect(isActionableFeatureCode("# comment\r\ndf['x'] = 1")).toBe(true);
  });

  it('rejects df_temp as a different variable (word boundary)', () => {
    // \bdf\b should NOT match df_temp because underscore is a word char
    expect(isActionableFeatureCode("df_temp = 1")).toBe(false);
  });
});

describe('stripSelfLoadingPrelude', () => {
  it('returns code unchanged when no self-loading lines present', () => {
    const code = "df['new_col'] = df['old_col'] * 2";
    expect(stripSelfLoadingPrelude(code)).toBe(code);
  });

  it('strips a simple single-line dataset_path + pd.read_csv pair', () => {
    const code = [
      'import pandas as pd',
      'dataset_path = resolve_dataset_path("train.csv", "ds-1")',
      'df = pd.read_csv(dataset_path)',
      "df['new_col'] = df['old_col'] * 2"
    ].join('\n');

    const result = stripSelfLoadingPrelude(code);
    expect(result).not.toContain('resolve_dataset_path');
    expect(result).not.toContain('pd.read_csv');
    expect(result).toContain('import pandas as pd');
    expect(result).toContain("df['new_col'] = df['old_col'] * 2");
  });

  it('strips a multi-line resolve_dataset_path call with trailing comma (adversarial Shape A\' from Agent 4)', () => {
    const code = [
      'import pandas as pd',
      'dataset_path = resolve_dataset_path(',
      '    "tableau_usage_field_summary_with_dept_features.csv",',
      '    "bb1e3f02-667f-4758-bb3c-e36654f9d109",',
      ')',
      'df = pd.read_csv(dataset_path)',
      "df['score'] = df['value'] * 2"
    ].join('\n');

    const result = stripSelfLoadingPrelude(code);
    // All 5 lines of the multi-line call should be stripped
    expect(result).not.toContain('resolve_dataset_path');
    expect(result).not.toContain('"tableau_usage_field_summary_with_dept_features.csv"');
    expect(result).not.toContain('"bb1e3f02-667f-4758-bb3c-e36654f9d109"');
    expect(result).not.toContain('pd.read_csv');
    expect(result).toContain("df['score'] = df['value'] * 2");
  });

  it('strips pd.read_json', () => {
    const code = [
      'dataset_path = resolve_dataset_path("data.json", "ds-1")',
      'df = pd.read_json(dataset_path)',
      "df['x'] = 1"
    ].join('\n');

    const result = stripSelfLoadingPrelude(code);
    expect(result).not.toContain('read_json');
    expect(result).toContain("df['x'] = 1");
  });

  it('strips pd.read_excel with kwargs', () => {
    const code = [
      'dataset_path = resolve_dataset_path("data.xlsx", "ds-1")',
      'df = pd.read_excel(dataset_path, sheet_name=0)',
      "df['x'] = 1"
    ].join('\n');

    const result = stripSelfLoadingPrelude(code);
    expect(result).not.toContain('read_excel');
    expect(result).toContain("df['x'] = 1");
  });

  it('preserves legitimate df reassignments like df = df.copy()', () => {
    const code = [
      'df = df.copy()',
      "df['new_col'] = df['old_col'] * 2"
    ].join('\n');

    const result = stripSelfLoadingPrelude(code);
    expect(result).toContain('df = df.copy()');
    expect(result).toContain("df['new_col']");
  });

  it('preserves function definitions that contain df', () => {
    const code = [
      'def add_score(input_df):',
      '    result = input_df.copy()',
      '    result["score"] = result["value"] * 2',
      '    return result',
      'df = add_score(df)'
    ].join('\n');

    const result = stripSelfLoadingPrelude(code);
    expect(result).toContain('def add_score(input_df):');
    expect(result).toContain('return result');
    expect(result).toContain('df = add_score(df)');
  });

  it('handles Windows CRLF line endings', () => {
    const code = 'dataset_path = resolve_dataset_path("x.csv", "id")\r\ndf = pd.read_csv(dataset_path)\r\ndf[\'x\'] = 1';
    const result = stripSelfLoadingPrelude(code);
    expect(result).not.toContain('resolve_dataset_path');
    expect(result).toContain("df['x'] = 1");
  });
});

describe('wrapLlmFeatureCode', () => {
  it('wraps code in a Python function scope and rebinds df from the return value', () => {
    const code = "df['new_col'] = df['old_col'] * 2";
    const result = wrapLlmFeatureCode(code, 'My Feature');

    expect(result).toContain('def _apply_llm_feature_my_feature(df):');
    expect(result).toContain("    df['new_col'] = df['old_col'] * 2");
    expect(result).toContain('    return df');
    expect(result).toContain('df = _apply_llm_feature_my_feature(df)');
  });

  it('sanitizes non-alphanumeric characters in the feature name', () => {
    const result = wrapLlmFeatureCode("df['x'] = 1", 'Feature-Name With Spaces & Symbols!');
    // Trailing underscores are trimmed; internal runs of non-alphanumerics become underscores.
    expect(result).toContain('def _apply_llm_feature_feature_name_with_spaces___symbols(df):');
  });

  it('prefixes leading digits to produce a valid Python identifier', () => {
    const result = wrapLlmFeatureCode("df['x'] = 1", '123 Numeric Start');
    expect(result).toMatch(/def _apply_llm_feature_f_\d+_numeric_start\(df\):/);
  });

  it('strips Shape B self-loading prelude before wrapping', () => {
    const code = [
      'import pandas as pd',
      'dataset_path = resolve_dataset_path("train.csv", "ds-1")',
      'df = pd.read_csv(dataset_path)',
      "df['usage_count_log1p'] = np.log1p(df['usage_count'])"
    ].join('\n');

    const result = wrapLlmFeatureCode(code, 'Usage Count Log1p');
    expect(result).not.toContain('resolve_dataset_path');
    expect(result).not.toContain('pd.read_csv');
    // Shape A parts are preserved (import + actual mutation)
    expect(result).toContain('import pandas as pd');
    expect(result).toContain("df['usage_count_log1p'] = np.log1p(df['usage_count'])");
  });

  it('preserves groupby transforms (the Department Usage Share case)', () => {
    const code = [
      'import pandas as pd',
      'import numpy as np',
      "df['CF EE Division'] = df['CF EE Division'].astype('string').fillna('__MISSING__')",
      "division_total_usage = df.groupby('CF EE Division', dropna=False)['usage_count'].transform('sum')",
      "df['department_usage_share'] = np.where(division_total_usage > 0, df['usage_count'] / division_total_usage, 0.0)"
    ].join('\n');

    const result = wrapLlmFeatureCode(code, 'Department Usage Share');
    expect(result).toContain("df.groupby('CF EE Division'");
    expect(result).toContain("df['department_usage_share']");
    expect(result).toContain('def _apply_llm_feature_department_usage_share(df):');
    expect(result).toContain('df = _apply_llm_feature_department_usage_share(df)');
  });
});

describe('buildFeatureCode', () => {
  it('falls back to the codegen template when feature.code is absent', () => {
    const feature: FeatureSpec = {
      sourceColumn: 'value',
      featureName: 'value_log',
      method: 'log1p_transform'
    };
    const result = buildFeatureCode(feature, 'df');
    expect(result).toBe('df["value_log"] = np.log1p(df["value"])');
  });

  it('falls back to the codegen template when feature.code is an empty string', () => {
    const feature: FeatureSpec = {
      sourceColumn: 'value',
      featureName: 'value_log',
      method: 'log1p_transform',
      code: ''
    };
    const result = buildFeatureCode(feature, 'df');
    expect(result).toBe('df["value_log"] = np.log1p(df["value"])');
  });

  it('falls back to the codegen template when feature.code is whitespace only', () => {
    const feature: FeatureSpec = {
      sourceColumn: 'value',
      featureName: 'value_log',
      method: 'log1p_transform',
      code: '   \n\t  '
    };
    const result = buildFeatureCode(feature, 'df');
    expect(result).toBe('df["value_log"] = np.log1p(df["value"])');
  });

  it('uses LLM code verbatim (wrapped) when feature.code is present', () => {
    const feature: FeatureSpec = {
      sourceColumn: 'CF EE Division',
      featureName: 'Department Usage Share',
      method: 'ratio',
      code: "df['department_usage_share'] = df.groupby('CF EE Division')['usage_count'].transform(lambda x: x / x.sum())"
    };
    const result = buildFeatureCode(feature, 'df');
    // Should use LLM code (groupby), NOT the ratio template (simple division)
    expect(result).toContain('groupby');
    expect(result).toContain('department_usage_share');
    expect(result).toContain('def _apply_llm_feature_department_usage_share(df):');
    // Should NOT contain the codegen template fallback
    expect(result).not.toContain('.replace(0, np.nan)');
  });

  it('handles a ratio feature with code as the Department Usage Share regression case', () => {
    const feature: FeatureSpec = {
      sourceColumn: 'CF EE Division',
      secondaryColumn: 'CF EE Department',
      featureName: 'Department Usage Share',
      method: 'ratio',
      code: [
        'import pandas as pd',
        'import numpy as np',
        "division_total = df.groupby('CF EE Division')['usage_count'].transform('sum')",
        "df['department_usage_share'] = np.where(division_total > 0, df['usage_count'] / division_total, 0.0)"
      ].join('\n')
    };
    const result = buildFeatureCode(feature, 'df');
    // The LLM's groupby transform is used, not the template's df[a]/df[b]
    expect(result).toContain('groupby');
    expect(result).toContain('transform');
    expect(result).not.toContain("df['CF EE Division'] / df['CF EE Department'].replace(0, np.nan)");
  });

  it('uses LLM code even for methods not in FEATURE_CODEGEN_MAP', () => {
    const feature = {
      sourceColumn: 'name',
      featureName: 'custom_feature',
      method: 'custom' as unknown as FeatureSpec['method'],
      code: "df['custom_feature'] = df['name'].str.upper()"
    } as FeatureSpec;
    const result = buildFeatureCode(feature, 'df');
    expect(result).toContain("df['name'].str.upper()");
    expect(result).toContain('def _apply_llm_feature_custom_feature(df):');
  });

  it('falls back to codegen template when feature.code is a placeholder comment', () => {
    const feature: FeatureSpec = {
      sourceColumn: 'value',
      featureName: 'value_log',
      method: 'log1p_transform',
      code: '# Placeholder: materialization deferred until proposal confirmation\n'
    };
    const result = buildFeatureCode(feature, 'df');
    // Template fallback produces the simple form, NOT the wrapped LLM code
    expect(result).toBe('df["value_log"] = np.log1p(df["value"])');
    expect(result).not.toContain('Placeholder');
    expect(result).not.toContain('_apply_llm_feature');
  });

  it('emits a raise RuntimeError when placeholder code has no template fallback', () => {
    const feature = {
      sourceColumn: 'x',
      featureName: 'custom_feature',
      method: 'custom' as unknown as FeatureSpec['method'],
      code: '# deferred\n'
    } as FeatureSpec;
    const result = buildFeatureCode(feature, 'df');
    // No LLM code (not actionable) AND no template → hard error
    expect(result).toContain('raise RuntimeError');
    expect(result).toContain('custom_feature');
  });
});
