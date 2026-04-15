import { pyString } from './codeGenerator.js';

export function buildFeatureLoadCell(dataset: { datasetId: string; filename: string }): string {
  return [
    'import json',
    'from pathlib import Path',
    'import numpy as np',
    'import pandas as pd',
    '',
    `dataset_path = resolve_dataset_path(${pyString(dataset.filename)}, ${pyString(dataset.datasetId)})`,
    '_source_ext = Path(dataset_path).suffix.lower()',
    "if _source_ext == '.json':",
    '    try:',
    '        df = pd.read_json(dataset_path)',
    '    except ValueError:',
    '        df = pd.read_json(dataset_path, lines=True)',
    "elif _source_ext in {'.xlsx', '.xls'}:",
    '    df = pd.read_excel(dataset_path)',
    'else:',
    '    df = pd.read_csv(dataset_path)',
    '_original_row_count = int(len(df))',
    'print(json.dumps({"loadedRows": _original_row_count, "datasetPath": dataset_path}))'
  ].join('\n');
}

export function buildFeatureCodeCellTitle(featureId: string): string {
  const titleBase = featureId.replace(/^feat-/, '').replace(/[-_]+/g, ' ').trim() || featureId;
  return `Create ${titleBase} feature`;
}
