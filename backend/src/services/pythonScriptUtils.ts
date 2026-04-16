/**
 * Shared Python script generation utilities.
 *
 * Centralizes the duplicated preprocessing / train-test-split code
 * that was previously copy-pasted across evaluationService and
 * tuningService.
 */

/* ------------------------------------------------------------------ */
/*  Dataset loading                                                    */
/* ------------------------------------------------------------------ */

/**
 * Return Python lines that load a CSV into a DataFrame called `df`.
 */
export function buildDatasetLoadLines(datasetPath: string): string[] {
  return [`df = pd.read_csv(${JSON.stringify(datasetPath)})`];
}

/* ------------------------------------------------------------------ */
/*  Preprocessing                                                      */
/* ------------------------------------------------------------------ */

export interface PreprocessingOptions {
  targetColumn: string;
  /**
   * When true, emits a guard that raises ValueError if the target
   * column is missing from the dataframe.  Used by tuningService.
   */
  validateColumnExists?: boolean;
  /**
   * When true, emits `feature_columns = list(X.columns)` at the end.
   * Used by evaluationService.
   */
  includeFeatureColumns?: boolean;
}

/**
 * Return the Python lines for the standard preprocessing block:
 * dropna(subset=[target_col]), fillna, get_dummies, fillna(0).
 *
 * Produces variables: target_col, y, X, numeric_cols, categorical_cols,
 * and optionally feature_columns.
 */
export function buildPreprocessingLines(options: PreprocessingOptions): string[] {
  const { targetColumn, validateColumnExists, includeFeatureColumns } = options;

  const lines: string[] = [];

  lines.push(`target_col = ${JSON.stringify(targetColumn)}`);

  if (validateColumnExists) {
    lines.push('if target_col not in df.columns:');
    lines.push('    raise ValueError(f"Target column {target_col} not found in dataset.")');
  }

  lines.push('df = df.dropna(subset=[target_col])');
  lines.push('y = df[target_col]');
  lines.push('X = df.drop(columns=[target_col])');
  lines.push('');
  lines.push('numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()');
  lines.push('categorical_cols = [col for col in X.columns if col not in numeric_cols]');
  lines.push('if numeric_cols:');
  lines.push('    X[numeric_cols] = X[numeric_cols].fillna(X[numeric_cols].median())');
  lines.push('if categorical_cols:');
  lines.push("    X[categorical_cols] = X[categorical_cols].fillna('missing')");
  lines.push('if categorical_cols:');
  lines.push('    X = pd.get_dummies(X, columns=categorical_cols, drop_first=False)');
  lines.push('X = X.fillna(0)');

  if (includeFeatureColumns) {
    lines.push('feature_columns = list(X.columns)');
  }

  return lines;
}

/* ------------------------------------------------------------------ */
/*  Train / test split                                                 */
/* ------------------------------------------------------------------ */

export interface TrainTestSplitOptions {
  taskType: string;
  testSize: number;
}

/**
 * Return the Python lines for train_test_split with optional stratify
 * (classification only).
 *
 * Produces variables: test_size, stratify, X_train, X_test, y_train, y_test.
 */
export function buildTrainTestSplitLines(options: TrainTestSplitOptions): string[] {
  const { taskType, testSize } = options;
  const lines: string[] = [];

  lines.push(`test_size = ${testSize}`);
  lines.push('stratify = None');

  if (taskType === 'classification') {
    lines.push('if len(y.unique()) > 1 and len(y) >= 10:');
    lines.push('    stratify = y');
  }

  lines.push('X_train, X_test, y_train, y_test = train_test_split(');
  lines.push('    X, y, test_size=test_size, random_state=42, stratify=stratify');
  lines.push(')');

  return lines;
}

/* ------------------------------------------------------------------ */
/*  Standard imports                                                   */
/* ------------------------------------------------------------------ */

/**
 * Return the Python lines for standard imports used across services.
 * Always includes: json, os, numpy, pandas
 * Optionally adds extra imports passed in.
 *
 * Example: buildStandardImports(['from sklearn.tree import DecisionTreeClassifier'])
 * produces: import json, import os, import numpy as np, import pandas as pd,
 *           from sklearn.tree import DecisionTreeClassifier
 */
export function buildStandardImports(extras?: string[]): string[] {
  const lines: string[] = [];

  lines.push('import json');
  lines.push('import os');
  lines.push('import numpy as np');
  lines.push('import pandas as pd');

  if (extras && extras.length > 0) {
    extras.forEach((extra) => lines.push(extra));
  }

  lines.push('');
  lines.push('def _sanitize_json_value(value):');
  lines.push('    if value is None:');
  lines.push('        return None');
  lines.push('    if isinstance(value, dict):');
  lines.push('        return {str(key): _sanitize_json_value(val) for key, val in value.items()}');
  lines.push('    if isinstance(value, (list, tuple)):');
  lines.push('        return [_sanitize_json_value(item) for item in value]');
  lines.push('    if isinstance(value, np.ndarray):');
  lines.push('        return _sanitize_json_value(value.tolist())');
  lines.push('    if isinstance(value, pd.Series):');
  lines.push('        return _sanitize_json_value(value.tolist())');
  lines.push('    if isinstance(value, pd.Index):');
  lines.push('        return _sanitize_json_value(value.tolist())');
  lines.push('    if isinstance(value, pd.Timestamp):');
  lines.push('        return value.isoformat()');
  lines.push('    if isinstance(value, (np.bool_, bool)):');
  lines.push('        return bool(value)');
  lines.push('    if isinstance(value, (np.integer, int)):');
  lines.push('        return int(value)');
  lines.push('    if isinstance(value, (np.floating, float)):');
  lines.push('        return None if not np.isfinite(value) else float(value)');
  lines.push('    if isinstance(value, np.generic):');
  lines.push('        return _sanitize_json_value(value.item())');
  lines.push('    return value');
  lines.push('');

  return lines;
}

/* ------------------------------------------------------------------ */
/*  Output directory setup                                             */
/* ------------------------------------------------------------------ */

export interface OutputDirSetupOptions {
  outputDirVar?: string;
}

/**
 * Return the Python lines to create an output directory.
 * Default variable name is `output_dir`.
 *
 * Produces: output_dir = <path>, os.makedirs(output_dir, exist_ok=True)
 */
export function buildOutputDirSetup(outputDir: string, options?: OutputDirSetupOptions): string[] {
  const varName = options?.outputDirVar ?? 'output_dir';
  return [
    `${varName} = ${JSON.stringify(outputDir)}`,
    `os.makedirs(${varName}, exist_ok=True)`,
    '',
  ];
}

/* ------------------------------------------------------------------ */
/*  Result saving                                                      */
/* ------------------------------------------------------------------ */

export interface ResultSavingOptions {
  resultVar?: string;
  filename?: string;
}

/**
 * Return the Python lines to save a result dictionary to JSON.
 * Default result variable: `result`
 * Default filename: `result.json`
 *
 * Produces: with open(..., 'w') as f: json.dump(result, f)
 */
export function buildResultSaving(outputDirVar: string = 'output_dir', options?: ResultSavingOptions): string[] {
  const resultVar = options?.resultVar ?? 'result';
  const filename = options?.filename ?? 'result.json';

  return [
    "# Save result",
    `with open(os.path.join(${outputDirVar}, ${JSON.stringify(filename)}), 'w') as f:`,
    `    json.dump(_sanitize_json_value(${resultVar}), f, allow_nan=False)`,
    '',
  ];
}
