/**
 * Screenshot capture script for README documentation.
 *
 * Uses Playwright to navigate the running dev server with mocked API
 * responses and pre-populated localStorage state, then captures
 * screenshots of each major view.
 *
 * Prerequisites: dev server running at localhost:5173 / localhost:4000
 *
 * Usage:
 *   npx playwright test scripts/capture-screenshots.ts --headed
 *   # or headless:
 *   npx playwright test scripts/capture-screenshots.ts
 */

import { test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/screenshots');
const BASE_URL = 'http://localhost:5173';
const PROJECT_ID = 'proj-screenshot-1';
const DATASET_ID = 'ds-housing-1';
const NOTEBOOK_ID = 'nb-training-1';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

// Build a valid JWT with far-future expiry so isJwtExpired() returns false.
// Format: base64url(header).base64url(payload).signature
function makeMockJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
  const payload = btoa(JSON.stringify({ sub: 'user-screenshot-1', exp: 9999999999, iat: 1710720000 })).replace(/=/g, '');
  return `${header}.${payload}.mock-signature`;
}
const MOCK_JWT = makeMockJwt();

const MOCK_USER = {
  user_id: 'user-screenshot-1',
  email: 'demo@agentic-automl.dev',
  name: 'Alex Chen',
  role: 'user',
  email_verified: true,
  created_at: '2025-09-15T00:00:00Z',
  updated_at: '2026-03-18T00:00:00Z',
  last_login_at: '2026-03-18T10:00:00Z',
};

const MOCK_PROJECT = {
  id: PROJECT_ID,
  title: 'Housing Price Prediction',
  description: 'Predict residential housing prices using structured data and domain context',
  icon: 'Home',
  color: 'blue',
  createdAt: '2026-03-10T00:00:00.000Z',
  updatedAt: '2026-03-18T00:00:00.000Z',
  unlockedPhases: [
    'upload', 'data-viewer', 'preprocessing',
    'feature-engineering', 'training', 'experiments',
  ],
  currentPhase: 'experiments',
  completedPhases: ['upload', 'data-viewer', 'preprocessing', 'feature-engineering', 'training'],
  metadata: {},
};

const COLUMNS = [
  'id', 'price', 'bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot',
  'floors', 'waterfront', 'view', 'condition', 'grade', 'yr_built',
  'zipcode', 'lat', 'long', 'sqft_above', 'sqft_basement', 'neighborhood',
];

const NUMERIC_COLS = ['price', 'bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors', 'view', 'condition', 'grade', 'yr_built', 'sqft_above', 'sqft_basement', 'lat', 'long'];
const CATEGORICAL_COLS = ['waterfront', 'zipcode', 'neighborhood'];

function generateSampleRows(n: number) {
  const neighborhoods = ['Capitol Hill', 'Ballard', 'Fremont', 'Wallingford', 'Queen Anne', 'Magnolia', 'Beacon Hill', 'University District'];
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: 1000 + i,
      price: Math.round(250000 + Math.random() * 600000),
      bedrooms: Math.floor(2 + Math.random() * 4),
      bathrooms: Math.round((1 + Math.random() * 3) * 2) / 2,
      sqft_living: Math.round(800 + Math.random() * 3200),
      sqft_lot: Math.round(2000 + Math.random() * 15000),
      floors: Math.round((1 + Math.random() * 2) * 2) / 2,
      waterfront: Math.random() > 0.95 ? 'Yes' : 'No',
      view: Math.floor(Math.random() * 5),
      condition: Math.floor(2 + Math.random() * 4),
      grade: Math.floor(5 + Math.random() * 8),
      yr_built: Math.floor(1920 + Math.random() * 105),
      zipcode: String(98101 + Math.floor(Math.random() * 80)),
      lat: +(47.5 + Math.random() * 0.3).toFixed(4),
      long: +(-122.4 + Math.random() * 0.3).toFixed(4),
      sqft_above: Math.round(800 + Math.random() * 2500),
      sqft_basement: Math.round(Math.random() * 1200),
      neighborhood: neighborhoods[Math.floor(Math.random() * neighborhoods.length)],
    });
  }
  return rows;
}

const SAMPLE_ROWS = generateSampleRows(100);

const EDA_SUMMARY = {
  scope: { source: 'dataset-profile', rowsAnalyzed: 21613, totalRows: 21613 },
  numericColumns: [
    { column: 'price', min: 75000, max: 7700000, mean: 540088, median: 450000, stdDev: 367127, skewness: 4.02, q1: 321950, q3: 645000, outlierCount: 1148 },
    { column: 'sqft_living', min: 290, max: 13540, mean: 2079, median: 1910, stdDev: 918, skewness: 1.47, q1: 1427, q3: 2550, outlierCount: 574 },
    { column: 'bedrooms', min: 0, max: 33, mean: 3.37, median: 3, stdDev: 0.93, skewness: 1.98, q1: 3, q3: 4, outlierCount: 245 },
    { column: 'bathrooms', min: 0, max: 8, mean: 2.11, median: 2.25, stdDev: 0.77, skewness: 0.52, q1: 1.75, q3: 2.5, outlierCount: 89 },
    { column: 'sqft_lot', min: 520, max: 1651359, mean: 15106, median: 7618, stdDev: 41420, skewness: 13.1, q1: 5040, q3: 10688, outlierCount: 1821 },
    { column: 'grade', min: 1, max: 13, mean: 7.66, median: 7, stdDev: 1.17, skewness: 0.76, q1: 7, q3: 8, outlierCount: 78 },
    { column: 'yr_built', min: 1900, max: 2015, mean: 1971, median: 1975, stdDev: 29.3, skewness: -0.47, q1: 1951, q3: 1997, outlierCount: 0 },
    { column: 'sqft_above', min: 290, max: 9410, mean: 1788, median: 1560, stdDev: 828, skewness: 1.44, q1: 1190, q3: 2210, outlierCount: 460 },
    { column: 'sqft_basement', min: 0, max: 4820, mean: 291, median: 0, stdDev: 442, skewness: 1.56, q1: 0, q3: 560, outlierCount: 285 },
    { column: 'lat', min: 47.1559, max: 47.7776, mean: 47.5608, median: 47.5718, stdDev: 0.1386, skewness: -0.31, q1: 47.4711, q3: 47.678, outlierCount: 0 },
    { column: 'long', min: -122.519, max: -121.315, mean: -122.214, median: -122.23, stdDev: 0.1407, skewness: 1.15, q1: -122.328, q3: -122.125, outlierCount: 162 },
  ],
  categoricalColumns: [
    { column: 'waterfront', uniqueCount: 2, topValues: [{ value: 'No', count: 21183, percentage: 98.0 }, { value: 'Yes', count: 430, percentage: 2.0 }], missingCount: 0, mode: 'No' },
    { column: 'zipcode', uniqueCount: 70, topValues: [{ value: '98103', count: 602, percentage: 2.8 }, { value: '98038', count: 590, percentage: 2.7 }, { value: '98115', count: 583, percentage: 2.7 }], missingCount: 0, mode: '98103' },
    { column: 'neighborhood', uniqueCount: 8, topValues: [{ value: 'Capitol Hill', count: 3102, percentage: 14.4 }, { value: 'Ballard', count: 2980, percentage: 13.8 }, { value: 'Fremont', count: 2841, percentage: 13.1 }], missingCount: 0, mode: 'Capitol Hill' },
  ],
  dataQuality: COLUMNS.map((col) => ({
    column: col,
    dataType: NUMERIC_COLS.includes(col) ? 'numeric' as const : (CATEGORICAL_COLS.includes(col) ? 'categorical' as const : 'numeric' as const),
    totalCount: 21613,
    missingCount: col === 'sqft_basement' ? 1842 : (col === 'yr_built' ? 312 : 0),
    missingPercentage: col === 'sqft_basement' ? 8.52 : (col === 'yr_built' ? 1.44 : 0),
    uniqueCount: col === 'price' ? 4028 : (col === 'zipcode' ? 70 : 500),
    uniquePercentage: col === 'price' ? 18.6 : 2.3,
  })),
  histograms: [
    { column: 'price', buckets: [
      { start: 75000, end: 225000, count: 2841 }, { start: 225000, end: 375000, count: 5928 },
      { start: 375000, end: 525000, count: 5012 }, { start: 525000, end: 675000, count: 3490 },
      { start: 675000, end: 825000, count: 1892 }, { start: 825000, end: 975000, count: 1023 },
      { start: 975000, end: 1200000, count: 745 }, { start: 1200000, end: 1500000, count: 412 },
      { start: 1500000, end: 2000000, count: 178 }, { start: 2000000, end: 7700000, count: 92 },
    ]},
    { column: 'sqft_living', buckets: [
      { start: 290, end: 800, count: 1245 }, { start: 800, end: 1300, count: 3890 },
      { start: 1300, end: 1800, count: 5102 }, { start: 1800, end: 2300, count: 4567 },
      { start: 2300, end: 2800, count: 3012 }, { start: 2800, end: 3300, count: 1678 },
      { start: 3300, end: 4000, count: 1234 }, { start: 4000, end: 5000, count: 556 },
      { start: 5000, end: 7000, count: 212 }, { start: 7000, end: 13540, count: 117 },
    ]},
    { column: 'bedrooms', buckets: [
      { start: 0, end: 1, count: 199 }, { start: 1, end: 2, count: 1824 },
      { start: 2, end: 3, count: 5812 }, { start: 3, end: 4, count: 9824 },
      { start: 4, end: 5, count: 2718 }, { start: 5, end: 6, count: 1028 },
      { start: 6, end: 33, count: 208 },
    ]},
  ],
  correlations: [
    { columnA: 'price', columnB: 'sqft_living', coefficient: 0.702 },
    { columnA: 'price', columnB: 'grade', coefficient: 0.667 },
    { columnA: 'price', columnB: 'sqft_above', coefficient: 0.606 },
    { columnA: 'price', columnB: 'bathrooms', coefficient: 0.525 },
    { columnA: 'price', columnB: 'bedrooms', coefficient: 0.308 },
    { columnA: 'sqft_living', columnB: 'sqft_above', coefficient: 0.877 },
    { columnA: 'sqft_living', columnB: 'grade', coefficient: 0.762 },
    { columnA: 'sqft_living', columnB: 'bathrooms', coefficient: 0.755 },
    { columnA: 'sqft_living', columnB: 'bedrooms', coefficient: 0.578 },
    { columnA: 'sqft_above', columnB: 'grade', coefficient: 0.756 },
    { columnA: 'grade', columnB: 'bathrooms', coefficient: 0.665 },
    { columnA: 'sqft_basement', columnB: 'sqft_living', coefficient: 0.435 },
    { columnA: 'yr_built', columnB: 'condition', coefficient: -0.361 },
    { columnA: 'lat', columnB: 'price', coefficient: 0.307 },
  ],
  scatterPairs: [
    { xColumn: 'sqft_living', yColumn: 'price', points: SAMPLE_ROWS.slice(0, 50).map((r) => ({ x: r.sqft_living as number, y: r.price as number })), regressionLine: { slope: 280.5, intercept: -43456, r2: 0.493 } },
  ],
  missingMatrix: {
    columns: COLUMNS,
    matrix: COLUMNS.map((col) =>
      Array.from({ length: 50 }, () =>
        col === 'sqft_basement' ? (Math.random() > 0.91 ? 1 : 0)
        : col === 'yr_built' ? (Math.random() > 0.985 ? 1 : 0)
        : 0
      )
    ),
  },
};

const DATASET_PROFILE = {
  datasetId: DATASET_ID,
  projectId: PROJECT_ID,
  filename: 'housing_data.csv',
  fileType: 'csv',
  size: 3_456_789,
  nRows: 21613,
  nCols: COLUMNS.length,
  columns: COLUMNS.map((name) => ({
    name,
    dtype: NUMERIC_COLS.includes(name) ? 'float' : (CATEGORICAL_COLS.includes(name) ? 'string' : 'integer'),
    nullCount: name === 'sqft_basement' ? 1842 : (name === 'yr_built' ? 312 : 0),
  })),
  sample: SAMPLE_ROWS.slice(0, 50),
  createdAt: '2026-03-10T12:00:00Z',
  updatedAt: '2026-03-18T10:00:00Z',
  tableName: 'housing_data_ds_housing',
  metadata: { tableName: 'housing_data_ds_housing', rowsLoaded: 21613, eda: EDA_SUMMARY },
};

const MODEL_TEMPLATES = [
  {
    id: 'tpl-rf', name: 'Random Forest', taskType: 'classification', description: 'Ensemble of decision trees with bagging',
    library: 'scikit-learn', importPath: 'sklearn.ensemble', modelClass: 'RandomForestClassifier',
    parameters: [
      { key: 'n_estimators', label: 'Number of trees', type: 'number', default: 100, min: 10, max: 1000, step: 10 },
      { key: 'max_depth', label: 'Max depth', type: 'number', default: 10, min: 1, max: 50 },
      { key: 'criterion', label: 'Criterion', type: 'select', default: 'gini', options: [{ value: 'gini', label: 'Gini' }, { value: 'entropy', label: 'Entropy' }] },
    ],
    defaultParams: { n_estimators: 100, max_depth: 10, criterion: 'gini' }, metrics: ['accuracy', 'f1', 'precision', 'recall'],
  },
  {
    id: 'tpl-gb', name: 'Gradient Boosting', taskType: 'regression', description: 'Sequential boosting with gradient descent',
    library: 'scikit-learn', importPath: 'sklearn.ensemble', modelClass: 'GradientBoostingRegressor',
    parameters: [
      { key: 'n_estimators', label: 'Boosting rounds', type: 'number', default: 200, min: 50, max: 2000, step: 50 },
      { key: 'learning_rate', label: 'Learning rate', type: 'number', default: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { key: 'max_depth', label: 'Max depth', type: 'number', default: 5, min: 1, max: 20 },
    ],
    defaultParams: { n_estimators: 200, learning_rate: 0.1, max_depth: 5 }, metrics: ['r2', 'rmse', 'mae'],
  },
  {
    id: 'tpl-xgb', name: 'XGBoost', taskType: 'regression', description: 'Extreme gradient boosting with regularization',
    library: 'xgboost', importPath: 'xgboost', modelClass: 'XGBRegressor',
    parameters: [
      { key: 'n_estimators', label: 'Rounds', type: 'number', default: 300, min: 50, max: 3000, step: 50 },
      { key: 'learning_rate', label: 'Learning rate', type: 'number', default: 0.05, min: 0.001, max: 0.5, step: 0.01 },
      { key: 'max_depth', label: 'Max depth', type: 'number', default: 6, min: 1, max: 15 },
    ],
    defaultParams: { n_estimators: 300, learning_rate: 0.05, max_depth: 6 }, metrics: ['r2', 'rmse', 'mae'],
  },
  {
    id: 'tpl-lr', name: 'Linear Regression', taskType: 'regression', description: 'Ordinary least squares linear regression',
    library: 'scikit-learn', importPath: 'sklearn.linear_model', modelClass: 'LinearRegression',
    parameters: [{ key: 'fit_intercept', label: 'Fit intercept', type: 'boolean', default: true }],
    defaultParams: { fit_intercept: true }, metrics: ['r2', 'rmse', 'mae'],
  },
];

const TRAINED_MODELS = [
  {
    modelId: 'model-xgb-1', projectId: PROJECT_ID, datasetId: DATASET_ID,
    name: 'XGBoost — Housing v3', templateId: 'tpl-xgb', taskType: 'regression',
    library: 'xgboost', algorithm: 'XGBRegressor',
    parameters: { n_estimators: 500, learning_rate: 0.03, max_depth: 7 },
    metrics: { r2: 0.8923, rmse: 98412.5, mae: 62180.3 },
    status: 'completed', createdAt: '2026-03-18T09:30:00Z', updatedAt: '2026-03-18T09:32:15Z',
    trainingMs: 12450, targetColumn: 'price', sampleCount: 17290,
    featureColumns: ['bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'grade', 'yr_built', 'lat', 'long'],
    artifact: { filename: 'model-xgb-1.pkl', path: '/models/model-xgb-1.pkl', size: 2_345_678 },
  },
  {
    modelId: 'model-gb-1', projectId: PROJECT_ID, datasetId: DATASET_ID,
    name: 'Gradient Boosting — Housing v2', templateId: 'tpl-gb', taskType: 'regression',
    library: 'scikit-learn', algorithm: 'GradientBoostingRegressor',
    parameters: { n_estimators: 300, learning_rate: 0.08, max_depth: 6 },
    metrics: { r2: 0.8745, rmse: 106234.1, mae: 68910.2 },
    status: 'completed', createdAt: '2026-03-17T16:45:00Z', updatedAt: '2026-03-17T16:48:30Z',
    trainingMs: 18920, targetColumn: 'price', sampleCount: 17290,
    featureColumns: ['bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'grade', 'yr_built'],
    artifact: { filename: 'model-gb-1.pkl', path: '/models/model-gb-1.pkl', size: 1_890_432 },
  },
  {
    modelId: 'model-rf-1', projectId: PROJECT_ID, datasetId: DATASET_ID,
    name: 'Random Forest — Housing v1', templateId: 'tpl-rf', taskType: 'regression',
    library: 'scikit-learn', algorithm: 'RandomForestRegressor',
    parameters: { n_estimators: 200, max_depth: 12 },
    metrics: { r2: 0.8512, rmse: 115678.3, mae: 74230.1 },
    status: 'completed', createdAt: '2026-03-16T14:20:00Z', updatedAt: '2026-03-16T14:25:10Z',
    trainingMs: 8750, targetColumn: 'price', sampleCount: 17290,
    featureColumns: ['bedrooms', 'bathrooms', 'sqft_living', 'grade', 'yr_built'],
    artifact: { filename: 'model-rf-1.pkl', path: '/models/model-rf-1.pkl', size: 4_123_456 },
  },
  {
    modelId: 'model-lr-1', projectId: PROJECT_ID, datasetId: DATASET_ID,
    name: 'Linear Regression — Baseline', templateId: 'tpl-lr', taskType: 'regression',
    library: 'scikit-learn', algorithm: 'LinearRegression',
    parameters: { fit_intercept: true },
    metrics: { r2: 0.6534, rmse: 176543.2, mae: 129870.5 },
    status: 'completed', createdAt: '2026-03-15T11:00:00Z', updatedAt: '2026-03-15T11:00:45Z',
    trainingMs: 320, targetColumn: 'price', sampleCount: 17290,
    featureColumns: ['bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'grade', 'yr_built', 'lat', 'long'],
  },
  {
    modelId: 'model-xgb-fail', projectId: PROJECT_ID, datasetId: DATASET_ID,
    name: 'XGBoost — Overfit Attempt', templateId: 'tpl-xgb', taskType: 'regression',
    library: 'xgboost', algorithm: 'XGBRegressor',
    parameters: { n_estimators: 5000, learning_rate: 0.5, max_depth: 15 },
    metrics: {},
    status: 'failed', createdAt: '2026-03-14T09:00:00Z', updatedAt: '2026-03-14T09:01:00Z',
    trainingMs: 45200, targetColumn: 'price', sampleCount: 17290,
    error: 'Early stopping triggered — validation loss diverged after 120 rounds',
  },
];

const NOTEBOOK_CELLS = [
  {
    cellId: 'cell-001', notebookId: NOTEBOOK_ID, cellType: 'code',
    title: 'Import & Load', content: `import pandas as pd\nimport numpy as np\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.preprocessing import StandardScaler\n\ndf = pd.read_csv('/data/housing_data.csv')\nprint(f"Loaded {len(df)} rows, {len(df.columns)} columns")\ndf.head()`,
    position: 0, executionCount: 1, executionOrder: 1, executionStatus: 'success',
    executionDurationMs: 842, executedAt: '2026-03-18T09:15:00Z', isDirty: false,
    output: [
      { type: 'text', content: 'Loaded 21613 rows, 18 columns' },
      { type: 'table', content: 'DataFrame', data: { columns: COLUMNS, rows: SAMPLE_ROWS.slice(0, 5) } },
    ],
    outputRefs: [], lockedBy: null, lockedAt: null,
    createdAt: '2026-03-18T09:14:00Z', updatedAt: '2026-03-18T09:15:00Z',
  },
  {
    cellId: 'cell-002', notebookId: NOTEBOOK_ID, cellType: 'code',
    title: 'Feature Engineering', content: `# Engineer features based on domain knowledge\ndf['price_per_sqft'] = df['price'] / df['sqft_living']\ndf['age'] = 2026 - df['yr_built']\ndf['total_sqft'] = df['sqft_above'] + df['sqft_basement']\ndf['bed_bath_ratio'] = df['bedrooms'] / df['bathrooms'].clip(lower=0.5)\n\nprint(f"Added 4 engineered features")\ndf[['price_per_sqft', 'age', 'total_sqft', 'bed_bath_ratio']].describe()`,
    position: 1, executionCount: 1, executionOrder: 2, executionStatus: 'success',
    executionDurationMs: 156, executedAt: '2026-03-18T09:16:00Z', isDirty: false,
    output: [
      { type: 'text', content: 'Added 4 engineered features' },
      { type: 'table', content: 'Statistics', data: {
        columns: ['stat', 'price_per_sqft', 'age', 'total_sqft', 'bed_bath_ratio'],
        rows: [
          { stat: 'mean', price_per_sqft: 262.45, age: 55.3, total_sqft: 2079.4, bed_bath_ratio: 1.62 },
          { stat: 'std', price_per_sqft: 89.12, age: 29.3, total_sqft: 918.2, bed_bath_ratio: 0.41 },
          { stat: 'min', price_per_sqft: 48.20, age: 11, total_sqft: 290, bed_bath_ratio: 0.40 },
          { stat: 'max', price_per_sqft: 1243.80, age: 126, total_sqft: 13540, bed_bath_ratio: 6.60 },
        ],
      }},
    ],
    outputRefs: [], lockedBy: null, lockedAt: null,
    createdAt: '2026-03-18T09:15:30Z', updatedAt: '2026-03-18T09:16:00Z',
  },
  {
    cellId: 'cell-003', notebookId: NOTEBOOK_ID, cellType: 'code',
    title: 'Train XGBoost Model', content: `from xgboost import XGBRegressor\nfrom sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error\n\nfeatures = ['bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot',\n            'grade', 'yr_built', 'lat', 'long',\n            'price_per_sqft', 'age', 'total_sqft']\n\nX = df[features].fillna(0)\ny = df['price']\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n\nmodel = XGBRegressor(n_estimators=500, learning_rate=0.03, max_depth=7)\nmodel.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)\n\ny_pred = model.predict(X_test)\nprint(f"R² Score:  {r2_score(y_test, y_pred):.4f}")\nprint(f"RMSE:      {np.sqrt(mean_squared_error(y_test, y_pred)):,.0f}")\nprint(f"MAE:       {mean_absolute_error(y_test, y_pred):,.0f}")`,
    position: 2, executionCount: 1, executionOrder: 3, executionStatus: 'success',
    executionDurationMs: 12450, executedAt: '2026-03-18T09:18:30Z', isDirty: false,
    output: [
      { type: 'text', content: 'R² Score:  0.8923\nRMSE:      98,413\nMAE:       62,180' },
    ],
    outputRefs: [], lockedBy: null, lockedAt: null,
    createdAt: '2026-03-18T09:17:00Z', updatedAt: '2026-03-18T09:18:30Z',
  },
];

// Preprocessing chat messages (stored in localStorage)
const PREPROCESSING_MESSAGES = {
  version: 2,
  messages: [
    {
      id: 'pp-msg-1', type: 'user', timestamp: Date.now() - 120000,
      content: 'Analyze the housing dataset and handle missing values, then scale numeric features for modeling.',
    },
    {
      id: 'pp-msg-2', type: 'thinking', isComplete: true, startTime: Date.now() - 119000,
      content: 'The user wants preprocessing for the housing dataset. I need to:\n1. Check for missing values in each column\n2. Decide on imputation strategy per column\n3. Scale numeric features\n\nLet me first propose a plan for handling missing values in sqft_basement (8.5% missing) and yr_built (1.4% missing).',
    },
    {
      id: 'pp-msg-3', type: 'assistant_text',
      content: 'I\'ll preprocess the housing dataset in two steps: **impute missing values** and **scale numeric features**. Let me start by handling the missing data.',
    },
    {
      id: 'pp-msg-4', type: 'tool_call',
      call: {
        id: 'tc-1', tool: 'propose_transformation_step',
        args: { title: 'Impute missing values in sqft_basement and yr_built', stepId: 'step-impute' },
        rationale: 'sqft_basement has 8.5% missing values — median imputation is appropriate since the distribution is right-skewed. yr_built has 1.4% missing — mode imputation preserves the most common construction year.',
      },
      result: { id: 'tr-1', tool: 'propose_transformation_step', output: { status: 'accepted', stepId: 'step-impute' } },
    },
    {
      id: 'pp-msg-5', type: 'tool_call',
      call: {
        id: 'tc-2', tool: 'materialize_step_code',
        args: { stepId: 'step-impute', code: `# Impute missing values\ndf['sqft_basement'] = df['sqft_basement'].fillna(df['sqft_basement'].median())\ndf['yr_built'] = df['yr_built'].fillna(df['yr_built'].mode()[0])\n\nprint(f"Remaining nulls: {df.isnull().sum().sum()}")` },
      },
      result: { id: 'tr-2', tool: 'materialize_step_code', output: { cellId: 'pp-cell-1' } },
    },
    {
      id: 'pp-msg-6', type: 'tool_call',
      call: { id: 'tc-3', tool: 'execute_transformation_step', args: { stepId: 'step-impute', cellId: 'pp-cell-1' } },
      result: { id: 'tr-3', tool: 'execute_transformation_step', output: { status: 'success', stdout: 'Remaining nulls: 0', duration: 245 } },
    },
    {
      id: 'pp-msg-7', type: 'tool_call',
      call: { id: 'tc-4', tool: 'validate_step_result', args: { stepId: 'step-impute' } },
      result: {
        id: 'tr-4', tool: 'validate_step_result',
        output: { passed: true, metrics: [
          { name: 'Total nulls', before: 2154, after: 0 },
          { name: 'sqft_basement median', before: 0, after: 0 },
          { name: 'yr_built mode preserved', before: 1975, after: 1975 },
        ]},
      },
    },
    {
      id: 'pp-msg-8', type: 'tool_call',
      call: { id: 'tc-5', tool: 'commit_transformation_step', args: { stepId: 'step-impute', title: 'Impute sqft_basement (median) and yr_built (mode)' } },
      result: { id: 'tr-5', tool: 'commit_transformation_step', output: { committed: true } },
    },
    {
      id: 'pp-msg-9', type: 'assistant_text',
      content: 'Missing values handled. Now let me scale the numeric features for modeling.',
    },
    {
      id: 'pp-msg-10', type: 'tool_call',
      call: {
        id: 'tc-6', tool: 'propose_transformation_step',
        args: { title: 'StandardScaler on numeric features', stepId: 'step-scale' },
        rationale: 'StandardScaler (z-score normalization) is appropriate for the numeric features since gradient-based models benefit from centered, unit-variance inputs. Preserving the original columns in a separate dataframe for interpretability.',
      },
      result: { id: 'tr-6', tool: 'propose_transformation_step', output: { status: 'accepted', stepId: 'step-scale' } },
    },
    {
      id: 'pp-msg-11', type: 'tool_call',
      call: {
        id: 'tc-7', tool: 'materialize_step_code',
        args: { stepId: 'step-scale', code: `from sklearn.preprocessing import StandardScaler\n\nnumeric_cols = ['sqft_living', 'sqft_lot', 'sqft_above', 'sqft_basement',\n                'bedrooms', 'bathrooms', 'grade', 'yr_built', 'lat', 'long']\n\nscaler = StandardScaler()\ndf[numeric_cols] = scaler.fit_transform(df[numeric_cols])\n\nprint("Scaled columns — mean ≈ 0, std ≈ 1:")\ndf[numeric_cols].describe().loc[['mean', 'std']]` },
      },
      result: { id: 'tr-7', tool: 'materialize_step_code', output: { cellId: 'pp-cell-2' } },
    },
    {
      id: 'pp-msg-12', type: 'tool_call',
      call: { id: 'tc-8', tool: 'execute_transformation_step', args: { stepId: 'step-scale', cellId: 'pp-cell-2' } },
      result: { id: 'tr-8', tool: 'execute_transformation_step', output: { status: 'success', stdout: 'Scaled columns — mean ≈ 0, std ≈ 1:', duration: 189 } },
    },
  ],
  savepoints: {},
};

// Training chat messages
const TRAINING_MESSAGES = {
  version: 2,
  messages: [
    {
      id: 'tr-msg-1', type: 'user', timestamp: Date.now() - 60000,
      content: 'Train an XGBoost regression model to predict housing prices. Use the engineered features and evaluate performance.',
    },
    {
      id: 'tr-msg-2', type: 'thinking', isComplete: true, startTime: Date.now() - 59000,
      content: 'The user wants to train an XGBoost model on the preprocessed housing data. I should:\n1. Set up the train/test split\n2. Train XGBRegressor with reasonable hyperparameters\n3. Evaluate with R², RMSE, and MAE\n4. Show feature importance\n\nI\'ll create notebook cells for each step.',
    },
    {
      id: 'tr-msg-3', type: 'assistant_text',
      content: 'I\'ll set up the training pipeline with data loading, feature engineering, model training, and evaluation. I\'ve created three cells in your notebook.',
    },
    {
      id: 'tr-msg-4', type: 'ui',
      schema: {
        version: '1' as const,
        kind: 'training' as const,
        title: 'XGBoost Training Plan',
        summary: 'Train XGBRegressor on housing data with engineered features',
        sections: [{
          id: 'sec-1',
          title: 'Training Pipeline',
          layout: 'column' as const,
          items: [
            { type: 'code_cell' as const, id: 'llm-cell-001', title: 'Import & Load Data', language: 'python' as const, content: NOTEBOOK_CELLS[0].content },
            { type: 'code_cell' as const, id: 'llm-cell-002', title: 'Feature Engineering', language: 'python' as const, content: NOTEBOOK_CELLS[1].content },
            { type: 'code_cell' as const, id: 'llm-cell-003', title: 'Train XGBoost Model', language: 'python' as const, content: NOTEBOOK_CELLS[2].content },
          ],
        }],
      },
    },
    {
      id: 'tr-msg-5', type: 'assistant_text',
      content: 'All three cells executed successfully. The XGBoost model achieves **R² = 0.8923** with RMSE of $98,413. The model explains ~89% of variance in housing prices. Key drivers are `sqft_living`, `grade`, and `lat` (location).',
    },
  ],
  savepoints: {},
};

// ---------------------------------------------------------------------------
// Route mocking
// ---------------------------------------------------------------------------

async function setupMocks(page: import('@playwright/test').Page) {
  // IMPORTANT: Playwright matches routes last-registered-first.
  // Register the catch-all FIRST (lowest priority), specific handlers LAST (highest priority).

  // Catch-all for any unhandled API calls (lowest priority — registered first)
  await page.route('http://localhost:4000/api/**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });

  // Auth — prevent redirects
  await page.route('http://localhost:4000/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: MOCK_USER }) })
  );
  await page.route('http://localhost:4000/api/auth/refresh', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: 'mock-token-fresh', refreshToken: 'mock-refresh-fresh' }) })
  );

  // Projects
  await page.route('http://localhost:4000/api/projects', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [MOCK_PROJECT] }) });
    }
    return route.continue();
  });
  await page.route(`http://localhost:4000/api/projects/${PROJECT_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROJECT) })
  );

  // Datasets
  await page.route('http://localhost:4000/api/datasets**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ datasets: [DATASET_PROFILE] }) });
    }
    return route.continue();
  });

  // Documents
  await page.route('http://localhost:4000/api/documents**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) })
  );

  // Models
  await page.route('http://localhost:4000/api/models/templates', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ templates: MODEL_TEMPLATES }) })
  );
  await page.route('http://localhost:4000/api/models?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: TRAINED_MODELS }) })
  );
  await page.route('http://localhost:4000/api/models', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: TRAINED_MODELS }) });
    }
    return route.continue();
  });

  // Notebooks
  await page.route(`http://localhost:4000/api/projects/${PROJECT_ID}/notebooks`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{
        notebookId: NOTEBOOK_ID, projectId: PROJECT_ID, name: 'Training Notebook',
        metadata: { phase: 'training' }, createdAt: '2026-03-18T09:00:00Z', updatedAt: '2026-03-18T09:30:00Z',
      }]),
    })
  );
  await page.route(`http://localhost:4000/api/projects/${PROJECT_ID}/notebook`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        notebookId: NOTEBOOK_ID, projectId: PROJECT_ID, name: 'Training Notebook',
        metadata: { phase: 'training' }, createdAt: '2026-03-18T09:00:00Z', updatedAt: '2026-03-18T09:30:00Z',
      }),
    })
  );
  await page.route(`http://localhost:4000/api/notebooks/${NOTEBOOK_ID}/cells`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NOTEBOOK_CELLS) })
  );
  NOTEBOOK_CELLS.forEach((cell) => {
    page.route(`http://localhost:4000/api/cells/${cell.cellId}`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cell) })
    );
  });

  // Preprocessing tables
  await page.route('http://localhost:4000/api/preprocessing/tables**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ tables: [{
        datasetId: DATASET_ID, name: 'housing_data', filename: 'housing_data.csv',
        sizeBytes: 3_456_789, nRows: 21613, nCols: 18,
        columns: COLUMNS.map((c) => ({ name: c, dtype: NUMERIC_COLS.includes(c) ? 'float64' : 'object' })),
      }]}),
    })
  );

  // LLM models list
  await page.route('http://localhost:4000/api/llm/models', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ models: [
        { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', capabilities: ['chat', 'tools'] },
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', capabilities: ['chat', 'tools'] },
      ]}),
    })
  );

  // Execution / runtime
  await page.route('http://localhost:4000/api/execute/runtimes', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('http://localhost:4000/api/execute/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ healthy: true, containerCount: 1 }) })
  );

  // NL query suggestions
  await page.route('http://localhost:4000/api/query/nl/suggestions**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ suggestions: [
        'What is the average price by neighborhood?',
        'Show the top 10 most expensive houses',
        'How many homes have waterfront access?',
        'What is the correlation between sqft and price?',
      ]}),
    })
  );

  // Query cache config
  await page.route('http://localhost:4000/api/query/cache/config', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, ttlSeconds: 3600 }) })
  );

  // Python LSP endpoints — return empty
  await page.route('http://localhost:4000/api/python/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
  );

  // Savepoints
  await page.route('http://localhost:4000/api/savepoints/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ savepoints: [] }) })
  );

}

/**
 * Inject localStorage values BEFORE page JavaScript executes.
 * This is critical because Zustand's persist middleware only hydrates once.
 */
async function injectLocalStorageBeforeLoad(page: import('@playwright/test').Page) {
  // Build the JWT in the browser context since btoa is guaranteed there
  await page.addInitScript(
    ({ project, user, projectId, preprocessingMessages, trainingMessages }) => {
      // Build a valid JWT with far-future expiry
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
      const payload = btoa(JSON.stringify({ sub: 'user-screenshot-1', exp: 9999999999, iat: 1710720000 })).replace(/=/g, '');
      const jwt = `${header}.${payload}.mock-signature`;

      // Auth store (Zustand persist format)
      localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          accessToken: jwt,
          refreshToken: jwt,
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
        version: 0,
      }));

      // Project store (Zustand persist format)
      localStorage.setItem('automl-projects-storage', JSON.stringify({
        state: {
          projects: [project],
          activeProjectId: projectId,
          isInitialized: true,
          isLoading: false,
        },
        version: 0,
      }));

      // Preprocessing AgenticShell messages
      const ppKey = `preprocessing-messages-v5-processing-tab-1-${projectId}`;
      localStorage.setItem(ppKey, JSON.stringify(preprocessingMessages));

      // Training AgenticShell messages
      const trainKey = `training-messages-v1-training-wb-1-${projectId}`;
      localStorage.setItem(trainKey, JSON.stringify(trainingMessages));

      // Theme — dark mode
      localStorage.setItem('theme', 'dark');
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    },
    {
      project: MOCK_PROJECT,
      user: MOCK_USER,
      projectId: PROJECT_ID,
      preprocessingMessages: PREPROCESSING_MESSAGES,
      trainingMessages: TRAINING_MESSAGES,
    },
  );
}

/** Navigate to a target URL with MOCKED API (for data-viewer, experiments). */
async function navigateWithMocks(page: import('@playwright/test').Page, targetUrl: string) {
  await setupMocks(page);
  await injectLocalStorageBeforeLoad(page);
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
}

// ---------------------------------------------------------------------------
// Real backend setup — for preprocessing/training views that need AgenticShell
// ---------------------------------------------------------------------------

const API = 'http://localhost:4000/api';
let realToken: string | null = null;
let realProjectId: string | null = null;
let realUser: Record<string, unknown> | null = null;

const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/mock-business');
const FIXTURE_CSVS = ['customers.csv', 'subscriptions.csv', 'support_tickets.csv', 'usage_metrics.csv', 'marketing_campaigns.csv'];
const FIXTURE_DOCS = ['novacraft_business_context.pdf'];

async function setupRealBackend() {
  if (realToken) return; // already set up

  // 1. Register or login
  let authRes = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'screenshot-bot@automl.test', password: 'Screenshot2026!', name: 'Screenshot Bot' }),
  });
  if (!authRes.ok) {
    authRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'screenshot-bot@automl.test', password: 'Screenshot2026!' }),
    });
  }
  if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status} ${await authRes.text()}`);
  const authData = await authRes.json() as { accessToken: string; refreshToken: string; user: Record<string, unknown> };
  realToken = authData.accessToken;
  realUser = authData.user;

  const authHeader = { Authorization: `Bearer ${realToken}`, 'Content-Type': 'application/json' };

  // 2. Reuse the first existing project that has data
  const projListRes = await fetch(`${API}/projects`, { headers: authHeader });
  const projList = await projListRes.json() as { projects: Array<{ id: string; title: string }> };

  if (projList.projects?.length > 0) {
    // Prefer a project with data — just use the first one
    realProjectId = projList.projects[0].id;
    return;
  }

  // 3. Create project
  const projRes = await fetch(`${API}/projects`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ name: 'NovaCraft Analytics', description: 'SaaS analytics with customer churn prediction', icon: 'BarChart3', color: 'violet' }),
  });
  if (!projRes.ok) throw new Error(`Project creation failed: ${projRes.status}`);
  const projData = await projRes.json() as { id: string };
  realProjectId = projData.id;

  // 4. Upload fixture CSVs as datasets
  for (const csvFile of FIXTURE_CSVS) {
    const filePath = path.join(FIXTURE_DIR, csvFile);
    if (!fs.existsSync(filePath)) continue;
    const fileData = fs.readFileSync(filePath);
    const blob = new Blob([fileData], { type: 'text/csv' });
    const form = new FormData();
    form.append('file', blob, csvFile);
    form.append('projectId', realProjectId);
    const res = await fetch(`${API}/upload/dataset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${realToken}` },
      body: form,
    });
    if (!res.ok) console.warn(`Upload ${csvFile} failed: ${res.status}`);
  }

  // 5. Upload context documents
  for (const docFile of FIXTURE_DOCS) {
    const filePath = path.join(FIXTURE_DIR, docFile);
    if (!fs.existsSync(filePath)) continue;
    const fileData = fs.readFileSync(filePath);
    const mimeType = docFile.endsWith('.pdf') ? 'application/pdf' : 'text/markdown';
    const blob = new Blob([fileData], { type: mimeType });
    const form = new FormData();
    form.append('file', blob, docFile);
    form.append('projectId', realProjectId);
    const res = await fetch(`${API}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${realToken}` },
      body: form,
    });
    if (!res.ok) console.warn(`Upload ${docFile} failed: ${res.status}`);
  }
}

/** Navigate using REAL auth token from the running backend (for AgenticShell views). */
async function navigateWithRealAuth(page: import('@playwright/test').Page, targetUrl: string) {
  await setupRealBackend();

  await page.addInitScript(
    ({ token, user, projectId, preprocessingMessages, trainingMessages }) => {
      // Set auth
      localStorage.setItem('auth-storage', JSON.stringify({
        state: { accessToken: token, refreshToken: token, user, isAuthenticated: true, isLoading: false, error: null },
        version: 0,
      }));

      // Set activeProjectId so the app selects the project on load
      localStorage.setItem('automl-projects-storage', JSON.stringify({
        state: { projects: [], activeProjectId: projectId, isInitialized: false, isLoading: false },
        version: 0,
      }));

      // Pre-populate chat messages for preprocessing and training
      const ppKey = `preprocessing-messages-v5-processing-tab-1-${projectId}`;
      localStorage.setItem(ppKey, JSON.stringify(preprocessingMessages));
      const trainKey = `training-messages-v1-training-wb-1-${projectId}`;
      localStorage.setItem(trainKey, JSON.stringify(trainingMessages));

      localStorage.setItem('theme', 'dark');
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    },
    {
      token: realToken!,
      user: realUser!,
      projectId: realProjectId!,
      preprocessingMessages: PREPROCESSING_MESSAGES,
      trainingMessages: TRAINING_MESSAGES,
    },
  );

  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
}

// ---------------------------------------------------------------------------
// Screenshot tests
// ---------------------------------------------------------------------------

test.describe('README Screenshots', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test.use({
    viewport: { width: 1400, height: 900 },
    colorScheme: 'dark',
  });

  // -- Mocked views (data-viewer, experiments) --

  test('1. EDA Dashboard', async ({ page }) => {
    await navigateWithMocks(page, `${BASE_URL}/project/${PROJECT_ID}/data-viewer`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'eda-dashboard.png'), type: 'png' });
  });

  test('2. Experiments', async ({ page }) => {
    await navigateWithMocks(page, `${BASE_URL}/project/${PROJECT_ID}/experiments`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'experiments-leaderboard.png'), type: 'png' });
  });

  test('3. NL-to-SQL', async ({ page }) => {
    await navigateWithMocks(page, `${BASE_URL}/project/${PROJECT_ID}/data-viewer`);

    const queryToggle = page.locator('button[title*="query"], button[title*="Query"], [data-testid="query-toggle"]').first();
    if (await queryToggle.isVisible().catch(() => false)) {
      await queryToggle.click();
      await page.waitForTimeout(500);
    }
    const nlTab = page.locator('button:has-text("English"), button:has-text("Natural Language"), [data-value="english"]').first();
    if (await nlTab.isVisible().catch(() => false)) {
      await nlTab.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'nl-to-sql.png'), type: 'png' });
  });

  // -- Real backend views (preprocessing, training) --

  test('4. Preprocessing', async ({ page }) => {
    await navigateWithRealAuth(page, `${BASE_URL}/project/${realProjectId ?? PROJECT_ID}/preprocessing`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'preprocessing.png'), type: 'png' });
  });

  test('5. Training / Hero', async ({ page }) => {
    await navigateWithRealAuth(page, `${BASE_URL}/project/${realProjectId ?? PROJECT_ID}/training`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'hero.png'), type: 'png' });
  });
});
