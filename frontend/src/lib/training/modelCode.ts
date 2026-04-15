import type { ModelTemplate } from '@/types/model';

function pyLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(pyLiteral).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${JSON.stringify(key)}: ${pyLiteral(val)}`);
    return `{${entries.join(', ')}}`;
  }
  return JSON.stringify(String(value));
}

function loadDatasetLines(filename: string): string[] {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'json') {
    return [
      'try:',
      '    df = pd.read_json(dataset_path)',
      'except ValueError:',
      '    df = pd.read_json(dataset_path, lines=True)'
    ];
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return ['df = pd.read_excel(dataset_path)'];
  }
  return ['df = pd.read_csv(dataset_path)'];
}

export interface ModelTrainingCodeParams {
  template: ModelTemplate;
  datasetFilename: string;
  datasetId?: string;
  targetColumn?: string;
  parameters: Record<string, unknown>;
  testSize?: number;
}

export function generateModelTrainingCode({
  template,
  datasetFilename,
  datasetId,
  targetColumn,
  parameters,
  testSize = 0.2
}: ModelTrainingCodeParams): string {
  const normalizedTest = Math.max(0.05, Math.min(testSize, 0.5));
  const lines: string[] = [];

  lines.push('import numpy as np');
  lines.push('import pandas as pd');
  lines.push(`from ${template.importPath} import ${template.modelClass}`);

  if (template.taskType !== 'clustering') {
    lines.push('from sklearn.model_selection import train_test_split');
    lines.push('from sklearn.pipeline import Pipeline');
    lines.push('from sklearn.compose import ColumnTransformer');
    lines.push('from sklearn.preprocessing import StandardScaler, OneHotEncoder');
    lines.push('from sklearn.impute import SimpleImputer');
  }

  if (template.taskType === 'classification') {
    lines.push('from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score');
  } else if (template.taskType === 'regression') {
    lines.push('from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score');
  } else {
    lines.push('from sklearn.metrics import silhouette_score');
  }

  lines.push('');
  const datasetArgs = datasetId
    ? `${JSON.stringify(datasetFilename)}, ${JSON.stringify(datasetId)}`
    : `${JSON.stringify(datasetFilename)}`;
  lines.push(`dataset_path = resolve_dataset_path(${datasetArgs})`);
  lines.push(...loadDatasetLines(datasetFilename));
  lines.push('');

  if (template.taskType !== 'clustering') {
    lines.push(`target_col = ${JSON.stringify(targetColumn ?? '')}`);
    lines.push('if target_col not in df.columns:');
    lines.push('    raise ValueError(f"Target column {target_col} not found in dataset.")');
    lines.push('df = df.dropna(subset=[target_col])');
    lines.push('y = df[target_col]');
    lines.push('X = df.drop(columns=[target_col])');
  } else {
    lines.push('X = df.copy()');
  }

  const paramEntries = Object.entries(parameters)
    .map(([key, value]) => `${key}=${pyLiteral(value)}`);
  const paramArgs = paramEntries.join(', ');

  if (template.taskType === 'clustering') {
    lines.push('numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()');
    lines.push('categorical_cols = [col for col in X.columns if col not in numeric_cols]');
    lines.push('if numeric_cols:');
    lines.push('    X[numeric_cols] = X[numeric_cols].fillna(X[numeric_cols].median())');
    lines.push('if categorical_cols:');
    lines.push("    X[categorical_cols] = X[categorical_cols].fillna('missing')");
    lines.push('if categorical_cols:');
    lines.push('    X = pd.get_dummies(X, columns=categorical_cols, drop_first=False)');
    lines.push('X = X.fillna(0)');
    lines.push('');
    lines.push(`model = ${template.modelClass}(${paramArgs})`);
    lines.push('labels = model.fit_predict(X)');
  } else {
    lines.push(`test_size = ${normalizedTest}`);
    lines.push('stratify = None');
    lines.push('if len(y.unique()) > 1 and len(y) >= 10:');
    lines.push('    stratify = y');
    lines.push('X_train, X_test, y_train, y_test = train_test_split(');
    lines.push('    X, y, test_size=test_size, random_state=42, stratify=stratify');
    lines.push(')');
    lines.push('');
    lines.push('# Identify column types');
    lines.push('numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()');
    lines.push('categorical_cols = [col for col in X.columns if col not in numeric_cols]');
    lines.push('');
    lines.push('# Build preprocessing pipeline');
    lines.push("numeric_pipeline = Pipeline([('imputer', SimpleImputer(strategy='median')), ('scaler', StandardScaler())])");
    lines.push("categorical_pipeline = Pipeline([('imputer', SimpleImputer(strategy='constant', fill_value='missing')), ('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=False))])");
    lines.push('transformers = []');
    lines.push("if numeric_cols: transformers.append(('num', numeric_pipeline, numeric_cols))");
    lines.push("if categorical_cols: transformers.append(('cat', categorical_pipeline, categorical_cols))");
    lines.push("preprocessor = ColumnTransformer(transformers=transformers, remainder='drop')");
    lines.push('');
    lines.push(`pipeline = Pipeline([('preprocessor', preprocessor), ('model', ${template.modelClass}(${paramArgs}))])`);
    lines.push('pipeline.fit(X_train, y_train)');
    lines.push('y_pred = pipeline.predict(X_test)');
  }

  lines.push('metrics = {}');

  if (template.taskType === 'classification') {
    lines.push('metrics["accuracy"] = float(accuracy_score(y_test, y_pred))');
    lines.push('metrics["precision"] = float(precision_score(y_test, y_pred, average="weighted", zero_division=0))');
    lines.push('metrics["recall"] = float(recall_score(y_test, y_pred, average="weighted", zero_division=0))');
    lines.push('metrics["f1"] = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))');
  } else if (template.taskType === 'regression') {
    lines.push('metrics["rmse"] = float(np.sqrt(mean_squared_error(y_test, y_pred)))');
    lines.push('metrics["mae"] = float(mean_absolute_error(y_test, y_pred))');
    lines.push('metrics["r2"] = float(r2_score(y_test, y_pred))');
  } else {
    lines.push('if len(set(labels)) > 1 and len(labels) > 1:');
    lines.push('    metrics["silhouette"] = float(silhouette_score(X, labels))');
    lines.push('else:');
    lines.push('    metrics["silhouette"] = 0.0');
  }

  lines.push('');
  lines.push('print("Metrics:", metrics)');

  return lines.join('\n');
}
