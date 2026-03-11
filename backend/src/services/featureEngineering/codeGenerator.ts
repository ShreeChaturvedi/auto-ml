/**
 * Feature Engineering — Code Generator
 *
 * Maps each FeatureMethod to the Python code snippet that implements it.
 * Consumed by the script builder to assemble the full feature-engineering script.
 */

import type { FeatureMethod, FeatureSpec } from '../featureEngineering.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

export function pyString(value: string): string {
  return JSON.stringify(value);
}

export function pyBool(value: unknown, defaultValue = false): string {
  return value === undefined || value === null
    ? defaultValue ? 'True' : 'False'
    : value === true ? 'True' : 'False';
}

export function numericParam(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/* ------------------------------------------------------------------ */
/*  Codegen map                                                       */
/* ------------------------------------------------------------------ */

type CodegenFn = (
  feature: FeatureSpec,
  dataframeName: string,
  src: string,
  dst: string,
  secondary: string | undefined
) => string;

export const FEATURE_CODEGEN_MAP = new Map<FeatureMethod, CodegenFn>([
  ['log_transform', (feature, df, src, dst) => {
    const offset = numericParam(feature.params?.offset, 1);
    return `${df}[${dst}] = np.log(${df}[${src}] + ${offset})`;
  }],
  ['log1p_transform', (_feature, df, src, dst) =>
    `${df}[${dst}] = np.log1p(${df}[${src}])`
  ],
  ['sqrt_transform', (_feature, df, src, dst) =>
    `${df}[${dst}] = np.sqrt(${df}[${src}])`
  ],
  ['square_transform', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}] ** 2`
  ],
  ['reciprocal_transform', (_feature, df, src, dst) =>
    `${df}[${dst}] = 1 / ${df}[${src}].replace(0, np.nan)`
  ],
  ['box_cox', (_feature, df, src, dst) =>
    `${df}[${dst}], _ = boxcox(${df}[${src}] + 1e-10)`
  ],
  ['yeo_johnson', (_feature, df, src, dst) =>
    `${df}[${dst}], _ = yeojohnson(${df}[${src}])`
  ],
  ['standardize', (_feature, df, src, dst) =>
    `${df}[${dst}] = (${df}[${src}] - ${df}[${src}].mean()) / ${df}[${src}].std()`
  ],
  ['min_max_scale', (feature, df, src, dst) => {
    const minVal = numericParam(feature.params?.min, 0);
    const maxVal = numericParam(feature.params?.max, 1);
    return `_min, _max = ${df}[${src}].min(), ${df}[${src}].max()
${df}[${dst}] = (${df}[${src}] - _min) / (_max - _min) * ${maxVal - minVal} + ${minVal}`;
  }],
  ['robust_scale', (_feature, df, src, dst) =>
    `_median = ${df}[${src}].median()
_q1, _q3 = ${df}[${src}].quantile(0.25), ${df}[${src}].quantile(0.75)
${df}[${dst}] = (${df}[${src}] - _median) / (_q3 - _q1)`
  ],
  ['max_abs_scale', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}] / ${df}[${src}].abs().max()`
  ],
  ['bucketize', (feature, df, src, dst) => {
    const bins = numericParam(feature.params?.bins, 5);
    return `${df}[${dst}] = pd.cut(${df}[${src}], bins=${bins}, labels=False)`;
  }],
  ['quantile_bin', (feature, df, src, dst) => {
    const quantiles = numericParam(feature.params?.quantiles, 4);
    return `${df}[${dst}] = pd.qcut(${df}[${src}], q=${quantiles}, labels=False, duplicates='drop')`;
  }],
  ['one_hot_encode', (feature, df, src, dst) => {
    const dropFirst = pyBool(feature.params?.drop_first, false);
    return `_dummies = pd.get_dummies(${df}[${src}], prefix=${dst}, drop_first=${dropFirst})
${df} = pd.concat([${df}, _dummies], axis=1)`;
  }],
  ['label_encode', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}].astype('category').cat.codes`
  ],
  ['target_encode', (feature, df, src, dst) => {
    const targetColumn = feature.params?.targetColumn ? pyString(String(feature.params.targetColumn)) : undefined;
    const smoothing = numericParam(feature.params?.smoothing, 1);
    return `_target = ${targetColumn}
_global_mean = ${df}[_target].mean()
_stats = ${df}.groupby(${src})[_target].agg(['mean', 'count'])
_smooth = (_stats['mean'] * _stats['count'] + _global_mean * ${smoothing}) / (_stats['count'] + ${smoothing})
${df}[${dst}] = ${df}[${src}].map(_smooth)`;
  }],
  ['frequency_encode', (feature, df, src, dst) => {
    const normalize = pyBool(feature.params?.normalize, true);
    return normalize === 'True'
      ? `_counts = ${df}[${src}].value_counts(normalize=True)
${df}[${dst}] = ${df}[${src}].map(_counts)`
      : `_counts = ${df}[${src}].value_counts()
${df}[${dst}] = ${df}[${src}].map(_counts)`;
  }],
  ['binary_encode', (feature, df, src) => {
    const prefix = pyString(feature.featureName);
    return `_series = ${df}[${src}].astype('category')
_codes = _series.cat.codes
_codes = _codes.where(_codes >= 0, 0)
_max = int(_codes.max()) if len(_codes) else 0
_bits = int(np.ceil(np.log2(_max + 1))) if _max > 0 else 1
for _i in range(_bits):
    ${df}[${prefix} + '_bin' + str(_i)] = ((_codes >> _i) & 1).astype(int)`;
  }],
  ['extract_year', (_feature, df, src, dst) =>
    `${df}[${dst}] = pd.to_datetime(${df}[${src}]).dt.year`
  ],
  ['extract_month', (_feature, df, src, dst) =>
    `${df}[${dst}] = pd.to_datetime(${df}[${src}]).dt.month`
  ],
  ['extract_day', (_feature, df, src, dst) =>
    `${df}[${dst}] = pd.to_datetime(${df}[${src}]).dt.day`
  ],
  ['extract_weekday', (_feature, df, src, dst) =>
    `${df}[${dst}] = pd.to_datetime(${df}[${src}]).dt.weekday`
  ],
  ['extract_hour', (_feature, df, src, dst) =>
    `${df}[${dst}] = pd.to_datetime(${df}[${src}]).dt.hour`
  ],
  ['cyclical_encode', (feature, df, src) => {
    const periodKey = String(feature.params?.period ?? 'month');
    const periodMap: Record<string, { attr: string; period: number }> = {
      hour: { attr: 'hour', period: 24 },
      weekday: { attr: 'weekday', period: 7 },
      month: { attr: 'month', period: 12 },
      day_of_year: { attr: 'dayofyear', period: 365 }
    };
    const mapping = periodMap[periodKey] ?? periodMap.month;
    const prefix = pyString(feature.featureName);
    return `_val = pd.to_datetime(${df}[${src}]).dt.${mapping.attr}
${df}[${prefix} + '_sin'] = np.sin(2 * np.pi * _val / ${mapping.period})
${df}[${prefix} + '_cos'] = np.cos(2 * np.pi * _val / ${mapping.period})`;
  }],
  ['time_since', (feature, df, src, dst) => {
    const unitMap: Record<string, string> = {
      days: 'D',
      hours: 'h',
      weeks: 'W',
      months: 'M'
    };
    const unit = unitMap[String(feature.params?.unit ?? 'days')] ?? 'D';
    return `${df}[${dst}] = (pd.Timestamp.now() - pd.to_datetime(${df}[${src}])) / np.timedelta64(1, '${unit}')`;
  }],
  ['polynomial', (feature, df, src) => {
    const degree = Math.max(2, Math.round(numericParam(feature.params?.degree, 2)));
    const prefix = pyString(feature.featureName);
    return `for _i in range(2, ${degree + 1}):
    ${df}[${prefix} + '_pow' + str(_i)] = ${df}[${src}] ** _i`;
  }],
  ['ratio', (_feature, df, src, dst, secondary) => {
    if (!secondary) return '# Missing secondary column for ratio';
    return `${df}[${dst}] = ${df}[${src}] / ${df}[${secondary}].replace(0, np.nan)`;
  }],
  ['difference', (_feature, df, src, dst, secondary) => {
    if (!secondary) return '# Missing secondary column for difference';
    return `${df}[${dst}] = ${df}[${src}] - ${df}[${secondary}]`;
  }],
  ['product', (_feature, df, src, dst, secondary) => {
    if (!secondary) return '# Missing secondary column for product';
    return `${df}[${dst}] = ${df}[${src}] * ${df}[${secondary}]`;
  }],
  ['text_length', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}].astype(str).str.len()`
  ],
  ['word_count', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}].astype(str).str.split().str.len()`
  ],
  ['contains_pattern', (feature, df, src, dst) => {
    const pattern = pyString(String(feature.params?.pattern ?? ''));
    const caseSensitive = pyBool(feature.params?.case_sensitive, false);
    return `${df}[${dst}] = ${df}[${src}].astype(str).str.contains(${pattern}, case=${caseSensitive}, regex=False).astype(int)`;
  }],
  ['missing_indicator', (_feature, df, src, dst) =>
    `${df}[${dst}] = ${df}[${src}].isna().astype(int)`
  ]
]);

/**
 * Generate the Python code snippet for a single feature transformation.
 */
export function buildFeatureCode(feature: FeatureSpec, dataframeName: string): string {
  const src = pyString(feature.sourceColumn);
  const dst = pyString(feature.featureName);
  const secondary = feature.secondaryColumn ? pyString(feature.secondaryColumn) : undefined;

  const codegen = FEATURE_CODEGEN_MAP.get(feature.method);
  if (!codegen) {
    return `# Unsupported method: ${feature.method}`;
  }
  return codegen(feature, dataframeName, src, dst, secondary);
}
