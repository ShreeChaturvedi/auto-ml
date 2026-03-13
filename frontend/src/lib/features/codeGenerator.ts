/**
 * Feature Engineering Code Generator
 *
 * Converts FeatureSpec objects into executable Python code for use in code cells.
 * This bridges the UI-based feature engineering with the notebook-style training environment.
 */

import type { FeatureSpec, FeatureMethod } from '@/types/feature';

/**
 * Generate Python code for a single feature transformation
 */
function generateFeatureCode(feature: FeatureSpec, dataframeName = 'df'): string {
  const { sourceColumn, secondaryColumn, featureName, method } = feature;
  const params = feature.params ?? {};
  const stringLiteral = (value: string) => JSON.stringify(value);
  const src = stringLiteral(sourceColumn);
  const dst = stringLiteral(featureName);
  const secondaryValue =
    secondaryColumn ||
    (typeof params.secondaryColumn === 'string' ? params.secondaryColumn : undefined);
  const secondary = secondaryValue ? stringLiteral(secondaryValue) : undefined;
  const targetColumn =
    typeof params.targetColumn === 'string' ? params.targetColumn : undefined;

  const generators: Record<FeatureMethod, () => string> = {
    // Numeric transforms
    log_transform: () => {
      const offset = params.offset ?? 1;
      return `${dataframeName}[${dst}] = np.log(${dataframeName}[${src}] + ${offset})`;
    },
    log1p_transform: () =>
      `${dataframeName}[${dst}] = np.log1p(${dataframeName}[${src}])`,
    sqrt_transform: () =>
      `${dataframeName}[${dst}] = np.sqrt(${dataframeName}[${src}])`,
    square_transform: () =>
      `${dataframeName}[${dst}] = ${dataframeName}[${src}] ** 2`,
    reciprocal_transform: () =>
      `${dataframeName}[${dst}] = 1 / ${dataframeName}[${src}].replace(0, np.nan)`,
    box_cox: () => `# Box-Cox requires scipy
from scipy.stats import boxcox
${dataframeName}[${dst}], _ = boxcox(${dataframeName}[${src}] + 1e-10)`,
    yeo_johnson: () => `# Yeo-Johnson handles negative values
from scipy.stats import yeojohnson
${dataframeName}[${dst}], _ = yeojohnson(${dataframeName}[${src}])`,

    // Scaling
    standardize: () => `${dataframeName}[${dst}] = (${dataframeName}[${src}] - ${dataframeName}[${src}].mean()) / ${dataframeName}[${src}].std()`,
    min_max_scale: () => {
      const minVal = Number(params.min ?? 0);
      const maxVal = Number(params.max ?? 1);
      return `_min, _max = ${dataframeName}[${src}].min(), ${dataframeName}[${src}].max()
${dataframeName}[${dst}] = (${dataframeName}[${src}] - _min) / (_max - _min) * ${maxVal - minVal} + ${minVal}`;
    },
    robust_scale: () => `_median = ${dataframeName}[${src}].median()
_q1, _q3 = ${dataframeName}[${src}].quantile(0.25), ${dataframeName}[${src}].quantile(0.75)
${dataframeName}[${dst}] = (${dataframeName}[${src}] - _median) / (_q3 - _q1)`,
    max_abs_scale: () =>
      `${dataframeName}[${dst}] = ${dataframeName}[${src}] / ${dataframeName}[${src}].abs().max()`,

    // Binning
    bucketize: () => {
      const bins = params.bins ?? 5;
      return `${dataframeName}[${dst}] = pd.cut(${dataframeName}[${src}], bins=${bins}, labels=False)`;
    },
    quantile_bin: () => {
      const quantiles = params.quantiles ?? 4;
      return `${dataframeName}[${dst}] = pd.qcut(${dataframeName}[${src}], q=${quantiles}, labels=False, duplicates='drop')`;
    },

    // Encoding
    one_hot_encode: () => {
      const dropFirst = params.drop_first ? 'True' : 'False';
      return `# One-hot encoding creates multiple columns
_dummies = pd.get_dummies(${dataframeName}[${src}], prefix=${dst}, drop_first=${dropFirst})
${dataframeName} = pd.concat([${dataframeName}, _dummies], axis=1)`;
    },
    label_encode: () => `${dataframeName}[${dst}] = ${dataframeName}[${src}].astype('category').cat.codes`,
    target_encode: () => {
      if (!targetColumn) {
        return `# Target encoding requires a target column parameter`;
      }
      const smoothing = params.smoothing ?? 1;
      const target = stringLiteral(targetColumn);
      return `# Target encoding (mean + smoothing)
_global_mean = ${dataframeName}[${target}].mean()
_stats = ${dataframeName}.groupby(${src})[${target}].agg(['mean', 'count'])
_smooth = (_stats['mean'] * _stats['count'] + _global_mean * ${smoothing}) / (_stats['count'] + ${smoothing})
${dataframeName}[${dst}] = ${dataframeName}[${src}].map(_smooth)`;
    },
    frequency_encode: () => {
      const normalize = params.normalize !== false;
      return normalize
        ? `_counts = ${dataframeName}[${src}].value_counts(normalize=True)
${dataframeName}[${dst}] = ${dataframeName}[${src}].map(_counts)`
        : `_counts = ${dataframeName}[${src}].value_counts()
${dataframeName}[${dst}] = ${dataframeName}[${src}].map(_counts)`;
    },
    binary_encode: () => `# Binary encoding without external dependencies
_series = ${dataframeName}[${src}].astype('category')
_codes = _series.cat.codes
_codes = _codes.where(_codes >= 0, 0)
_max = int(_codes.max()) if len(_codes) else 0
_bits = int(np.ceil(np.log2(_max + 1))) if _max > 0 else 1
for _i in range(_bits):
    ${dataframeName}[${dst} + '_bin' + str(_i)] = ((_codes >> _i) & 1).astype(int)`,

    // DateTime
    extract_year: () => `${dataframeName}[${dst}] = pd.to_datetime(${dataframeName}[${src}]).dt.year`,
    extract_month: () => `${dataframeName}[${dst}] = pd.to_datetime(${dataframeName}[${src}]).dt.month`,
    extract_day: () => `${dataframeName}[${dst}] = pd.to_datetime(${dataframeName}[${src}]).dt.day`,
    extract_weekday: () => `${dataframeName}[${dst}] = pd.to_datetime(${dataframeName}[${src}]).dt.weekday`,
    extract_hour: () => `${dataframeName}[${dst}] = pd.to_datetime(${dataframeName}[${src}]).dt.hour`,
    cyclical_encode: () => {
      const periodMap: Record<string, number> = {
        hour: 24,
        weekday: 7,
        month: 12,
        day_of_year: 365
      };
      const periodKey = (params.period as string) ?? 'month';
      const period = periodMap[periodKey] ?? 12;
      const attrMap: Record<string, string> = {
        hour: 'hour',
        weekday: 'weekday',
        month: 'month',
        day_of_year: 'dayofyear'
      };
      const attr = attrMap[periodKey] ?? 'month';
      return `_val = pd.to_datetime(${dataframeName}[${src}]).dt.${attr}
${dataframeName}[${dst} + '_sin'] = np.sin(2 * np.pi * _val / ${period})
${dataframeName}[${dst} + '_cos'] = np.cos(2 * np.pi * _val / ${period})`;
    },
    time_since: () => {
      const unitMap: Record<string, string> = {
        days: 'D',
        hours: 'h',
        weeks: 'W',
        months: 'M'
      };
      const unit = unitMap[params.unit as string] ?? 'D';
      return `${dataframeName}[${dst}] = (pd.Timestamp.now() - pd.to_datetime(${dataframeName}[${src}])) / np.timedelta64(1, '${unit}')`;
    },

    // Interactions
    polynomial: () => {
      const degree = Number(params.degree ?? 2);
      return `# Polynomial features for degree ${degree}
for _i in range(2, ${degree + 1}):
    ${dataframeName}[${dst} + '_pow' + str(_i)] = ${dataframeName}[${src}] ** _i`;
    },
    ratio: () =>
      secondary
        ? `${dataframeName}[${dst}] = ${dataframeName}[${src}] / ${dataframeName}[${secondary}].replace(0, np.nan)`
        : '# Ratio feature requires a secondary column',
    difference: () =>
      secondary
        ? `${dataframeName}[${dst}] = ${dataframeName}[${src}] - ${dataframeName}[${secondary}]`
        : '# Difference feature requires a secondary column',
    product: () =>
      secondary
        ? `${dataframeName}[${dst}] = ${dataframeName}[${src}] * ${dataframeName}[${secondary}]`
        : '# Product feature requires a secondary column',

    // Text
    text_length: () =>
      `${dataframeName}[${dst}] = ${dataframeName}[${src}].astype(str).str.len()`,
    word_count: () =>
      `${dataframeName}[${dst}] = ${dataframeName}[${src}].astype(str).str.split().str.len()`,
    contains_pattern: () => {
      const pattern = String(params.pattern ?? '');
      const caseSensitive = params.case_sensitive === true;
      return `${dataframeName}[${dst}] = ${dataframeName}[${src}].astype(str).str.contains(${stringLiteral(pattern)}, case=${caseSensitive ? 'True' : 'False'}, regex=False).astype(int)`;
    },
    missing_indicator: () =>
      `${dataframeName}[${dst}] = ${dataframeName}[${src}].isna().astype(int)`
  };

  const generator = generators[method];
  return generator ? generator() : `# Unknown method: ${method}`;
}

/**
 * Generate complete Python code for all features in a project
 */
export function generateFeatureEngineeringCode(
  features: FeatureSpec[],
  datasetFilename: string,
  options: {
    datasetId?: string;
    dataframeName?: string;
    includeImports?: boolean;
    includeComments?: boolean;
  } = {}
): string {
  const {
    datasetId,
    dataframeName = 'df',
    includeImports = true,
    includeComments = true
  } = options;

  const enabledFeatures = features.filter(f => f.enabled);

  if (enabledFeatures.length === 0) {
    return '# No features to generate';
  }

  const lines: string[] = [];

  if (includeImports) {
    lines.push('import numpy as np');
    lines.push('import pandas as pd');
    lines.push('');
  }

  if (includeComments) {
    lines.push(`# Feature Engineering Code`);
    lines.push(`# Generated for dataset: ${datasetFilename}`);
    lines.push(`# ${enabledFeatures.length} feature(s) to create`);
    lines.push('');
  }

  // Load the dataset (resolve_dataset_path is provided by the runtime)
  const ext = datasetFilename.split('.').pop()?.toLowerCase();
  const quotedFilename = JSON.stringify(datasetFilename);
  const datasetArgs = datasetId
    ? `${quotedFilename}, ${JSON.stringify(datasetId)}`
    : `${quotedFilename}`;
  lines.push(`dataset_path = resolve_dataset_path(${datasetArgs})`);
  if (ext === 'csv') {
    lines.push(`${dataframeName} = pd.read_csv(dataset_path)`);
  } else if (ext === 'json') {
    lines.push(`${dataframeName} = pd.read_json(dataset_path)`);
  } else if (ext === 'xlsx' || ext === 'xls') {
    lines.push(`${dataframeName} = pd.read_excel(dataset_path)`);
  } else {
    lines.push(`# Unsupported file type: ${datasetFilename}`);
    lines.push(`# ${dataframeName} = pd.read_csv(dataset_path)`);
  }
  lines.push('');

  // Generate each feature
  for (const feature of enabledFeatures) {
    if (includeComments) {
      lines.push(`# Feature: ${feature.featureName}`);
      lines.push(`# Method: ${feature.method} | Source: ${feature.sourceColumn}`);
      if (feature.description) {
        lines.push(`# ${feature.description}`);
      }
    }
    lines.push(generateFeatureCode(feature, dataframeName));
    lines.push('');
  }

  // Show result
  lines.push(`print(f"Created {len(${dataframeName}.columns)} columns from {len(${dataframeName})} rows")`);
  lines.push(`print(${dataframeName}.head())`);

  return lines.join('\n');
}

/**
 * Generate a snippet for a single feature (for preview)
 */
export function generateFeatureSnippet(feature: FeatureSpec): string {
  return generateFeatureCode(feature, 'df');
}
