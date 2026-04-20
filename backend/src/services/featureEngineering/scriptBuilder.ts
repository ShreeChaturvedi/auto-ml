/**
 * Feature Engineering — Script Builder
 *
 * Assembles a complete Python script from a list of feature specs.
 * The generated script reads the source dataset, applies all transformations,
 * writes the output file, and emits a JSON metadata sidecar.
 */

import type { DatasetFileType } from '../../types/dataset.js';
import type { FeatureSpec } from '../featureEngineering.js';

import { buildFeatureCode, pyString } from './codeGenerator.js';

export function buildFeatureEngineeringScript(params: {
  datasetFilename: string;
  datasetId: string;
  outputFilename: string;
  outputFormat: DatasetFileType;
  features: FeatureSpec[];
}): string {
  const { datasetFilename, datasetId, outputFilename, outputFormat, features } = params;
  const dataframeName = 'df';
  const lines: string[] = [];

  lines.push('import json');
  lines.push('import numpy as np');
  lines.push('import pandas as pd');

  const needsBoxCox = features.some((feature) => feature.method === 'box_cox');
  const needsYeoJohnson = features.some((feature) => feature.method === 'yeo_johnson');
  if (needsBoxCox) {
    lines.push('from scipy.stats import boxcox');
  }
  if (needsYeoJohnson) {
    lines.push('from scipy.stats import yeojohnson');
  }

  lines.push('');
  lines.push(`dataset_path = resolve_dataset_path(${pyString(datasetFilename)}, ${pyString(datasetId)})`);

  const ext = datasetFilename.split('.').pop()?.toLowerCase();
  if (ext === 'tsv' || ext === 'tab') {
    // Tab-separated — mirrors kernelManager's load_preprocessing_dataset
    // so FE never chokes on .tsv that the upload layer accepted. Issue #341/#343.
    lines.push(`${dataframeName} = pd.read_csv(dataset_path, sep='\\t', on_bad_lines='skip', engine='python')`);
  } else if (ext === 'jsonl' || ext === 'ndjson') {
    lines.push(`${dataframeName} = pd.read_json(dataset_path, lines=True)`);
  } else if (ext === 'json') {
    lines.push(`try:
    ${dataframeName} = pd.read_json(dataset_path)
except ValueError:
    ${dataframeName} = pd.read_json(dataset_path, lines=True)`);
  } else if (ext === 'xlsx' || ext === 'xls') {
    lines.push(`${dataframeName} = pd.read_excel(dataset_path)`);
  } else {
    // Default to CSV with lenient parse (matches the ingest-layer defaults)
    // so ragged / Latin-1 files don't crash the FE script.
    lines.push(`${dataframeName} = pd.read_csv(dataset_path, on_bad_lines='skip', engine='python')`);
  }

  lines.push('');

  for (const feature of features) {
    lines.push(`# Feature: ${feature.featureName}`);
    lines.push(buildFeatureCode(feature, dataframeName));
    lines.push('');
  }

  const outputPath = `/workspace/${outputFilename}`;
  lines.push(`output_path = ${pyString(outputPath)}`);
  if (outputFormat === 'csv') {
    lines.push(`${dataframeName}.to_csv(output_path, index=False)`);
  } else if (outputFormat === 'json') {
    lines.push(`${dataframeName}.to_json(output_path, orient='records')`);
  } else {
    lines.push(`${dataframeName}.to_excel(output_path, index=False)`);
  }

  lines.push('');
  lines.push('from pandas.api import types as _types');
  lines.push('def _map_dtype(series):');
  lines.push('    if _types.is_bool_dtype(series):');
  lines.push("        return 'boolean'");
  lines.push('    if _types.is_numeric_dtype(series):');
  lines.push("        return 'number'");
  lines.push('    if _types.is_datetime64_any_dtype(series):');
  lines.push("        return 'date'");
  lines.push("    return 'string'");
  lines.push('');
  lines.push('_columns = []');
  lines.push(`for _col in ${dataframeName}.columns:`);
  lines.push(`    _series = ${dataframeName}[_col]`);
  lines.push('    _columns.append({');
  lines.push('        "name": _col,');
  lines.push('        "dtype": _map_dtype(_series),');
  lines.push('        "nullCount": int(_series.isna().sum())');
  lines.push('    })');
  lines.push('');
  lines.push(`_sample = json.loads(${dataframeName}.head(20).to_json(orient='records'))`);
  lines.push('_meta = {');
  lines.push(`    "nRows": int(len(${dataframeName})),`);
  lines.push('    "columns": _columns,');
  lines.push('    "sample": _sample');
  lines.push('}');
  lines.push(`with open('/workspace/_feature_meta.json', 'w') as _f:`);
  lines.push('    json.dump(_meta, _f)');

  return lines.join('\n');
}
