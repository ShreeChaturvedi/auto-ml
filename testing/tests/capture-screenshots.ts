/**
 * Screenshot capture for README documentation.
 *
 * Uses Playwright to navigate the running dev server with real backend auth
 * and selectively mocked data endpoints, then captures screenshots of each
 * major view using NovaCraft B2B SaaS demo data.
 *
 * Prerequisites: dev server running at localhost:5173 / localhost:4000
 *
 * Usage:
 *   cd testing && npx playwright test --config playwright-screenshots.config.ts
 */

import { test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/screenshots');
const BASE_URL = 'http://localhost:5173';
const API = 'http://localhost:4000/api';

const PROJECT_ID = 'proj-novacraft-1';
const DATASET_ID = 'ds-customers-1';
const NOTEBOOK_ID = 'nb-churn-train-1';

// ---------------------------------------------------------------------------
// NovaCraft mock data (only data still used by real-backend tests)
// ---------------------------------------------------------------------------

const PLAN_CONTENT = `# Customer Churn Prediction

## Objective
Predict which NovaCraft customers are likely to churn within the next 90 days, enabling proactive retention campaigns.

## Data Inventory
| Dataset | Rows | Key Columns |
|---------|------|-------------|
| customers.csv | 4,912 | industry, plan_tier, annual_revenue_usd, is_active |
| subscriptions.csv | 4,483 | mrr_usd, cancellation_reason, billing_cycle |
| support_tickets.csv | 5,847 | category, resolution_hours, satisfaction_score |
| usage_metrics.csv | 7,234 | active_users, feature_adoption_pct, nps_response |
| marketing_campaigns.csv | 648 | channel, budget_usd, conversions |

## Preprocessing Strategy
1. **Missing values** - Impute cancellation_reason (MCAR) with "active", fill NaN satisfaction scores with column median
2. **Encoding** - One-hot encode plan_tier, industry, region_code (drop_first to avoid multicollinearity)
3. **Scaling** - StandardScaler on monetary (annual_revenue_usd, mrr_usd) and count features
4. **Temporal** - Convert signup_date to tenure_months, extract quarter from support timestamps

## Feature Engineering
- **Customer Lifetime Value** - mrr_usd x tenure_months x (1 - discount_pct)
- **Support Intensity** - total_tickets / tenure_months
- **Engagement Score** - weighted composite of logins, sessions, feature_adoption_pct
- **Revenue Trend** - 3-month rolling average of mrr_usd change

## Modeling Approach
- **Baseline**: Logistic Regression with L2 regularization
- **Primary**: XGBoost, Random Forest, Gradient Boosting
- **Evaluation**: Stratified 5-fold CV, F1 as primary metric (class imbalance ~18%)
- **Interpretability**: SHAP values for top 10 predictors

## Risks & Mitigations
- Class imbalance: SMOTE oversampling + class_weight='balanced'
- Temporal leakage: exclude post-churn subscription fields
- Multicollinearity: VIF check on usage metrics`;

// -- Customer sample rows for notebook cell output --

const COLUMNS = [
  'customer_id', 'company_name', 'industry', 'company_size', 'country',
  'signup_date', 'plan_tier', 'annual_revenue_usd', 'employee_count',
  'acquisition_channel', 'account_manager', 'is_active', 'region_code', 'data_source',
];

function generateCustomerRows(n: number) {
  const ind = ['Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail', 'Education', 'Media', 'Energy', 'Consulting', 'Logistics'];
  const sizes = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];
  const countries = ['United States', 'United Kingdom', 'Germany', 'Canada', 'Australia', 'France', 'Japan', 'Brazil'];
  const tiers = ['Basic', 'Plus', 'Premium'];
  const channels = ['Organic', 'Google Ads', 'LinkedIn', 'Referral', 'Events', 'Outbound'];
  const managers = ['Sarah Kim', 'James Rodriguez', 'Emily Watson', 'Michael Chen', 'Lisa Thompson'];
  const regions = ['US-WEST', 'US-EAST', 'EU-WEST', 'EU-CENTRAL', 'APAC', 'LATAM'];
  const sources = ['API', 'HubSpot Sync', 'Manual Entry', 'Zapier', 'Webhook'];
  const prefixes = ['Nova', 'Peak', 'Atlas', 'Flux', 'Edge', 'Core', 'Sync', 'Apex'];
  const suffixes = ['Systems', 'Labs', 'Tech', 'Digital', 'AI', 'Cloud', 'Corp', 'Inc'];
  const rows = [];
  for (let i = 0; i < n; i++) {
    const yr = 2020 + Math.floor(Math.random() * 6);
    const mo = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
    rows.push({
      customer_id: `C${String(1000 + i).padStart(4, '0')}`,
      company_name: `${prefixes[i % prefixes.length]}${suffixes[i % suffixes.length]}`,
      industry: ind[i % ind.length],
      company_size: sizes[Math.floor(Math.random() * sizes.length)],
      country: countries[Math.floor(Math.random() * countries.length)],
      signup_date: `${yr}-${mo}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`,
      plan_tier: tiers[Math.floor(Math.random() * tiers.length)],
      annual_revenue_usd: Math.round(50000 + Math.random() * 450000),
      employee_count: Math.floor(5 + Math.random() * 995),
      acquisition_channel: channels[Math.floor(Math.random() * channels.length)],
      account_manager: managers[Math.floor(Math.random() * managers.length)],
      is_active: Math.random() > 0.18 ? 'Yes' : 'No',
      region_code: regions[Math.floor(Math.random() * regions.length)],
      data_source: sources[Math.floor(Math.random() * sources.length)],
    });
  }
  return rows;
}

const SAMPLE_ROWS = generateCustomerRows(50);

// -- Model templates (classification, used by experiments test) --

const MODEL_TEMPLATES = [
  {
    id: 'tpl-xgb', name: 'XGBoost', taskType: 'classification', description: 'Extreme gradient boosting with regularization',
    library: 'xgboost', importPath: 'xgboost', modelClass: 'XGBClassifier',
    parameters: [
      { key: 'n_estimators', label: 'Rounds', type: 'number', default: 300, min: 50, max: 3000, step: 50 },
      { key: 'learning_rate', label: 'Learning rate', type: 'number', default: 0.05, min: 0.001, max: 0.5, step: 0.01 },
      { key: 'max_depth', label: 'Max depth', type: 'number', default: 6, min: 1, max: 15 },
    ],
    defaultParams: { n_estimators: 300, learning_rate: 0.05, max_depth: 6 },
    metrics: ['accuracy', 'f1', 'precision', 'recall', 'roc_auc'],
  },
  {
    id: 'tpl-rf', name: 'Random Forest', taskType: 'classification', description: 'Ensemble of decision trees with bagging',
    library: 'scikit-learn', importPath: 'sklearn.ensemble', modelClass: 'RandomForestClassifier',
    parameters: [
      { key: 'n_estimators', label: 'Number of trees', type: 'number', default: 100, min: 10, max: 1000, step: 10 },
      { key: 'max_depth', label: 'Max depth', type: 'number', default: 10, min: 1, max: 50 },
      { key: 'criterion', label: 'Criterion', type: 'select', default: 'gini', options: [{ value: 'gini', label: 'Gini' }, { value: 'entropy', label: 'Entropy' }] },
    ],
    defaultParams: { n_estimators: 100, max_depth: 10, criterion: 'gini' },
    metrics: ['accuracy', 'f1', 'precision', 'recall'],
  },
  {
    id: 'tpl-gb', name: 'Gradient Boosting', taskType: 'classification', description: 'Sequential boosting with gradient descent',
    library: 'scikit-learn', importPath: 'sklearn.ensemble', modelClass: 'GradientBoostingClassifier',
    parameters: [
      { key: 'n_estimators', label: 'Boosting rounds', type: 'number', default: 200, min: 50, max: 2000, step: 50 },
      { key: 'learning_rate', label: 'Learning rate', type: 'number', default: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { key: 'max_depth', label: 'Max depth', type: 'number', default: 5, min: 1, max: 20 },
    ],
    defaultParams: { n_estimators: 200, learning_rate: 0.1, max_depth: 5 },
    metrics: ['accuracy', 'f1', 'precision', 'recall'],
  },
  {
    id: 'tpl-lr', name: 'Logistic Regression', taskType: 'classification', description: 'Linear model with regularization',
    library: 'scikit-learn', importPath: 'sklearn.linear_model', modelClass: 'LogisticRegression',
    parameters: [
      { key: 'C', label: 'Regularization (C)', type: 'number', default: 1.0, min: 0.01, max: 100, step: 0.1 },
      { key: 'max_iter', label: 'Max iterations', type: 'number', default: 1000, min: 100, max: 10000, step: 100 },
    ],
    defaultParams: { C: 1.0, max_iter: 1000 },
    metrics: ['accuracy', 'f1', 'precision', 'recall'],
  },
];

// -- Trained models (churn prediction, used by experiments test) --

const TRAINED_MODELS = [
  {
    modelId: 'model-xgb-1', projectId: PROJECT_ID, datasetId: DATASET_ID,
    name: 'XGBoost Churn v3', templateId: 'tpl-xgb', taskType: 'classification',
    library: 'xgboost', algorithm: 'XGBClassifier',
    parameters: { n_estimators: 500, learning_rate: 0.03, max_depth: 7 },
    metrics: { accuracy: 0.9134, f1: 0.8523, precision: 0.8801, recall: 0.8261, roc_auc: 0.9412 },
    status: 'completed', createdAt: '2026-03-18T09:30:00Z', updatedAt: '2026-03-18T09:32:15Z',
    trainingMs: 14200, targetColumn: 'is_active', sampleCount: 3929,
    featureColumns: ['annual_revenue_usd', 'employee_count', 'tenure_months', 'support_intensity', 'engagement_score', 'plan_tier_Plus', 'plan_tier_Premium', 'industry_Technology'],
    artifact: { filename: 'model-xgb-1.pkl', path: '/models/model-xgb-1.pkl', size: 2_345_678 },
  },
  {
    modelId: 'model-gb-1', projectId: PROJECT_ID, datasetId: DATASET_ID,
    name: 'Gradient Boosting v2', templateId: 'tpl-gb', taskType: 'classification',
    library: 'scikit-learn', algorithm: 'GradientBoostingClassifier',
    parameters: { n_estimators: 300, learning_rate: 0.08, max_depth: 6 },
    metrics: { accuracy: 0.8978, f1: 0.8312, precision: 0.8645, recall: 0.8001, roc_auc: 0.9287 },
    status: 'completed', createdAt: '2026-03-17T16:45:00Z', updatedAt: '2026-03-17T16:48:30Z',
    trainingMs: 19800, targetColumn: 'is_active', sampleCount: 3929,
    featureColumns: ['annual_revenue_usd', 'employee_count', 'tenure_months', 'support_intensity', 'engagement_score', 'plan_tier_Plus'],
    artifact: { filename: 'model-gb-1.pkl', path: '/models/model-gb-1.pkl', size: 1_890_432 },
  },
  {
    modelId: 'model-rf-1', projectId: PROJECT_ID, datasetId: DATASET_ID,
    name: 'Random Forest v1', templateId: 'tpl-rf', taskType: 'classification',
    library: 'scikit-learn', algorithm: 'RandomForestClassifier',
    parameters: { n_estimators: 200, max_depth: 12, criterion: 'gini' },
    metrics: { accuracy: 0.8745, f1: 0.7934, precision: 0.8234, recall: 0.7654, roc_auc: 0.9101 },
    status: 'completed', createdAt: '2026-03-16T14:20:00Z', updatedAt: '2026-03-16T14:25:10Z',
    trainingMs: 8750, targetColumn: 'is_active', sampleCount: 3929,
    featureColumns: ['annual_revenue_usd', 'employee_count', 'tenure_months', 'support_intensity', 'engagement_score'],
    artifact: { filename: 'model-rf-1.pkl', path: '/models/model-rf-1.pkl', size: 4_123_456 },
  },
  {
    modelId: 'model-lr-1', projectId: PROJECT_ID, datasetId: DATASET_ID,
    name: 'Logistic Regression Baseline', templateId: 'tpl-lr', taskType: 'classification',
    library: 'scikit-learn', algorithm: 'LogisticRegression',
    parameters: { C: 1.0, max_iter: 1000 },
    metrics: { accuracy: 0.7923, f1: 0.6512, precision: 0.7134, recall: 0.5989, roc_auc: 0.8234 },
    status: 'completed', createdAt: '2026-03-15T11:00:00Z', updatedAt: '2026-03-15T11:00:45Z',
    trainingMs: 420, targetColumn: 'is_active', sampleCount: 3929,
    featureColumns: ['annual_revenue_usd', 'employee_count', 'tenure_months', 'support_intensity', 'engagement_score', 'plan_tier_Plus', 'plan_tier_Premium'],
  },
  {
    modelId: 'model-xgb-fail', projectId: PROJECT_ID, datasetId: DATASET_ID,
    name: 'XGBoost Deep Overfit', templateId: 'tpl-xgb', taskType: 'classification',
    library: 'xgboost', algorithm: 'XGBClassifier',
    parameters: { n_estimators: 5000, learning_rate: 0.5, max_depth: 15 },
    metrics: {},
    status: 'failed', createdAt: '2026-03-14T09:00:00Z', updatedAt: '2026-03-14T09:01:00Z',
    trainingMs: 52000, targetColumn: 'is_active', sampleCount: 3929,
    error: 'Early stopping triggered: validation loss diverged after 120 rounds (train_f1=0.99, val_f1=0.54)',
  },
];

// Pre-serialized JSON for route mocks (avoid re-serializing on every request)
const TEMPLATES_JSON = JSON.stringify({ templates: MODEL_TEMPLATES });
const MODELS_JSON = JSON.stringify({ models: TRAINED_MODELS });

// -- Notebook cells for training view --

const NOTEBOOK_CELLS = [
  {
    cellId: 'cell-001', notebookId: NOTEBOOK_ID, cellType: 'code',
    title: 'Import & Load', position: 0, executionCount: 1, executionOrder: 1,
    executionStatus: 'success', executionDurationMs: 1240, executedAt: '2026-03-18T09:15:00Z',
    isDirty: false,
    content: `import pandas as pd\nimport numpy as np\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.preprocessing import StandardScaler, LabelEncoder\n\ndf = pd.read_csv('/data/customers.csv')\nprint(f"Loaded {len(df)} customers, {len(df.columns)} features")\nprint(f"Churn rate: {(df['is_active'] == 'No').mean():.1%}")\ndf.head()`,
    output: [
      { type: 'text', content: 'Loaded 4912 customers, 14 features\nChurn rate: 18.0%' },
      { type: 'table', content: 'DataFrame', data: { columns: COLUMNS, rows: SAMPLE_ROWS.slice(0, 5) } },
    ],
    outputRefs: [], lockedBy: null, lockedAt: null,
    createdAt: '2026-03-18T09:14:00Z', updatedAt: '2026-03-18T09:15:00Z',
  },
  {
    cellId: 'cell-002', notebookId: NOTEBOOK_ID, cellType: 'code',
    title: 'Feature Engineering', position: 1, executionCount: 1, executionOrder: 2,
    executionStatus: 'success', executionDurationMs: 380, executedAt: '2026-03-18T09:16:00Z',
    isDirty: false,
    content: `# Engineer features from raw data\ndf['tenure_months'] = (pd.Timestamp('2026-03-18') - pd.to_datetime(df['signup_date'])).dt.days / 30\ndf['revenue_per_employee'] = df['annual_revenue_usd'] / df['employee_count'].clip(lower=1)\ndf['is_premium'] = (df['plan_tier'] == 'Premium').astype(int)\n\n# Encode target\ndf['churned'] = (df['is_active'] == 'No').astype(int)\n\nprint(f"Engineered 3 new features")\ndf[['tenure_months', 'revenue_per_employee', 'is_premium', 'churned']].describe()`,
    output: [
      { type: 'text', content: 'Engineered 3 new features' },
      {
        type: 'table', content: 'Statistics',
        data: {
          columns: ['stat', 'tenure_months', 'revenue_per_employee', 'is_premium', 'churned'],
          rows: [
            { stat: 'mean', tenure_months: 36.4, revenue_per_employee: 1842.3, is_premium: 0.23, churned: 0.18 },
            { stat: 'std', tenure_months: 18.2, revenue_per_employee: 1523.1, is_premium: 0.42, churned: 0.38 },
            { stat: 'min', tenure_months: 2.1, revenue_per_employee: 52.6, is_premium: 0, churned: 0 },
            { stat: 'max', tenure_months: 72.8, revenue_per_employee: 49600.0, is_premium: 1, churned: 1 },
          ],
        },
      },
    ],
    outputRefs: [], lockedBy: null, lockedAt: null,
    createdAt: '2026-03-18T09:15:30Z', updatedAt: '2026-03-18T09:16:00Z',
  },
  {
    cellId: 'cell-003', notebookId: NOTEBOOK_ID, cellType: 'code',
    title: 'Train XGBoost', position: 2, executionCount: 1, executionOrder: 3,
    executionStatus: 'success', executionDurationMs: 14200, executedAt: '2026-03-18T09:18:30Z',
    isDirty: false,
    content: `from xgboost import XGBClassifier\nfrom sklearn.metrics import classification_report, f1_score, roc_auc_score\n\nfeatures = ['annual_revenue_usd', 'employee_count', 'tenure_months',\n            'revenue_per_employee', 'is_premium']\n\nX = df[features].fillna(0)\ny = df['churned']\nX_train, X_test, y_train, y_test = train_test_split(\n    X, y, test_size=0.2, random_state=42, stratify=y\n)\n\nmodel = XGBClassifier(\n    n_estimators=500, learning_rate=0.03, max_depth=7,\n    scale_pos_weight=4.5, eval_metric='logloss'\n)\nmodel.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)\n\ny_pred = model.predict(X_test)\ny_prob = model.predict_proba(X_test)[:, 1]\n\nprint(f"F1 Score:   {f1_score(y_test, y_pred):.4f}")\nprint(f"ROC-AUC:    {roc_auc_score(y_test, y_prob):.4f}")\nprint(f"\\n{classification_report(y_test, y_pred, target_names=['Active', 'Churned'])}")`,
    output: [
      {
        type: 'text',
        content: 'F1 Score:   0.8523\nROC-AUC:    0.9412\n\n              precision    recall  f1-score   support\n\n      Active       0.95      0.94      0.94       805\n     Churned       0.88      0.83      0.85       178\n\n    accuracy                           0.91       983\n   macro avg       0.91      0.88      0.90       983\nweighted avg       0.91      0.91      0.91       983',
      },
    ],
    outputRefs: [], lockedBy: null, lockedAt: null,
    createdAt: '2026-03-18T09:17:00Z', updatedAt: '2026-03-18T09:18:30Z',
  },
];

const CELLS_JSON = JSON.stringify(NOTEBOOK_CELLS);

// -- Chat messages for preprocessing --

const PREPROCESSING_MESSAGES = {
  version: 2,
  messages: [
    { id: 'pp-1', type: 'user', timestamp: Date.now() - 180000, content: 'Preprocess the customers dataset for churn prediction. Handle missing values, encode categoricals, and scale numeric features.' },
    { id: 'pp-2', type: 'thinking', isComplete: true, startTime: Date.now() - 179000, content: 'The user wants to prepare the customers dataset for churn modeling. I need to:\n1. Check for missing values (account_manager has 2.9% nulls)\n2. One-hot encode plan_tier, industry, acquisition_channel\n3. StandardScaler on annual_revenue_usd, employee_count\n\nLet me start with missing value imputation.' },
    { id: 'pp-3', type: 'assistant_text', content: 'I\'ll preprocess the customers dataset in three steps: **impute missing values**, **encode categorical features**, and **scale numeric columns**. Let me start with the missing data.' },
    { id: 'pp-4', type: 'tool_call', call: { id: 'tc-1', tool: 'propose_transformation_step', args: { title: 'Impute missing account_manager values', stepId: 'step-impute' }, rationale: 'account_manager has 142 missing values (2.9%). Since this is a categorical identifier, mode imputation preserves the most common assignment pattern. Alternatively, a dedicated "Unassigned" category avoids false associations.' }, result: { id: 'tr-1', tool: 'propose_transformation_step', output: { status: 'accepted', stepId: 'step-impute' } } },
    { id: 'pp-5', type: 'tool_call', call: { id: 'tc-2', tool: 'materialize_step_code', args: { stepId: 'step-impute', code: '# Impute missing account_manager with "Unassigned"\ndf[\'account_manager\'] = df[\'account_manager\'].fillna(\'Unassigned\')\n\n# Verify no remaining nulls\nprint(f"Remaining nulls: {df.isnull().sum().sum()}")\nprint(f"account_manager values: {df[\'account_manager\'].value_counts().head()}")' } }, result: { id: 'tr-2', tool: 'materialize_step_code', output: { cellId: 'pp-cell-1' } } },
    { id: 'pp-6', type: 'tool_call', call: { id: 'tc-3', tool: 'execute_transformation_step', args: { stepId: 'step-impute', cellId: 'pp-cell-1' } }, result: { id: 'tr-3', tool: 'execute_transformation_step', output: { status: 'success', stdout: 'Remaining nulls: 0\naccount_manager values:\nSarah Kim           1042\nJames Rodriguez      998\nEmily Watson         978\nMichael Chen         962\nLisa Thompson        790\nName: account_manager, dtype: int64', duration: 245 } } },
    { id: 'pp-7', type: 'tool_call', call: { id: 'tc-4', tool: 'validate_step_result', args: { stepId: 'step-impute' } }, result: { id: 'tr-4', tool: 'validate_step_result', output: { passed: true, metrics: [{ name: 'Total nulls', before: 142, after: 0 }, { name: 'Row count preserved', before: 4912, after: 4912 }, { name: 'New category added', before: 5, after: 6 }] } } },
    { id: 'pp-8', type: 'tool_call', call: { id: 'tc-5', tool: 'commit_transformation_step', args: { stepId: 'step-impute', title: 'Impute account_manager nulls with "Unassigned"' } }, result: { id: 'tr-5', tool: 'commit_transformation_step', output: { committed: true } } },
    { id: 'pp-9', type: 'assistant_text', content: 'Missing values handled. Now encoding categorical features for the classifier.' },
    { id: 'pp-10', type: 'tool_call', call: { id: 'tc-6', tool: 'propose_transformation_step', args: { title: 'One-hot encode plan_tier, industry, acquisition_channel', stepId: 'step-encode' }, rationale: 'These three columns are nominal categoricals with low cardinality (3, 10, 6 unique values). One-hot encoding with drop_first=True avoids the dummy variable trap for downstream linear models while keeping interpretability for tree-based models.' }, result: { id: 'tr-6', tool: 'propose_transformation_step', output: { status: 'accepted', stepId: 'step-encode' } } },
    { id: 'pp-11', type: 'tool_call', call: { id: 'tc-7', tool: 'materialize_step_code', args: { stepId: 'step-encode', code: 'from sklearn.preprocessing import OneHotEncoder\nimport pandas as pd\n\ncategorical_cols = [\'plan_tier\', \'industry\', \'acquisition_channel\']\nencoder = OneHotEncoder(drop=\'first\', sparse_output=False)\nencoded = encoder.fit_transform(df[categorical_cols])\nencoded_df = pd.DataFrame(encoded, columns=encoder.get_feature_names_out(categorical_cols))\n\ndf = pd.concat([df.drop(columns=categorical_cols), encoded_df], axis=1)\nprint(f"Encoded {len(categorical_cols)} columns into {len(encoded_df.columns)} features")\nprint(f"New shape: {df.shape}")' } }, result: { id: 'tr-7', tool: 'materialize_step_code', output: { cellId: 'pp-cell-2' } } },
    { id: 'pp-12', type: 'tool_call', call: { id: 'tc-8', tool: 'execute_transformation_step', args: { stepId: 'step-encode', cellId: 'pp-cell-2' } }, result: { id: 'tr-8', tool: 'execute_transformation_step', output: { status: 'success', stdout: 'Encoded 3 columns into 17 features\nNew shape: (4912, 28)', duration: 189 } } },
  ],
  savepoints: {},
};

// -- Chat messages for training --

const TRAINING_MESSAGES = {
  version: 2,
  messages: [
    { id: 'tr-1', type: 'user', timestamp: Date.now() - 90000, content: 'Train an XGBoost classifier to predict customer churn. Use the engineered features and report F1 and ROC-AUC.' },
    { id: 'tr-2', type: 'thinking', isComplete: true, startTime: Date.now() - 89000, content: 'The user wants XGBoost for churn prediction. I need to:\n1. Load preprocessed data and engineer tenure/revenue features\n2. Train XGBClassifier with class weighting for imbalance (18% churn)\n3. Evaluate with F1, ROC-AUC, and full classification report\n\nI\'ll create three notebook cells for the pipeline.' },
    { id: 'tr-3', type: 'assistant_text', content: 'I\'ll set up a complete training pipeline with data loading, feature engineering, and XGBoost training. Three cells are ready in your notebook.' },
    {
      id: 'tr-4', type: 'ui',
      schema: {
        version: '1' as const, kind: 'training' as const,
        title: 'XGBoost Churn Prediction Pipeline',
        summary: 'Train XGBClassifier on NovaCraft customer data with class-weighted loss',
        sections: [{
          id: 'sec-1', title: 'Training Pipeline', layout: 'column' as const,
          items: [
            { type: 'code_cell' as const, id: 'llm-cell-001', title: 'Import & Load Customer Data', language: 'python' as const, content: NOTEBOOK_CELLS[0].content },
            { type: 'code_cell' as const, id: 'llm-cell-002', title: 'Feature Engineering', language: 'python' as const, content: NOTEBOOK_CELLS[1].content },
            { type: 'code_cell' as const, id: 'llm-cell-003', title: 'Train & Evaluate XGBoost', language: 'python' as const, content: NOTEBOOK_CELLS[2].content },
          ],
        }],
      },
    },
    { id: 'tr-5', type: 'assistant_text', content: 'All three cells executed successfully. The XGBoost classifier achieves **F1 = 0.8523** and **ROC-AUC = 0.9412** on the held-out test set. Top predictors by feature importance are `tenure_months`, `annual_revenue_usd`, and `revenue_per_employee`. The model correctly identifies 83% of churned customers while maintaining 88% precision.' },
  ],
  savepoints: {},
};

// ---------------------------------------------------------------------------
// Real backend setup
// ---------------------------------------------------------------------------

let realToken: string | null = null;
let realProjectId: string | null = null;
let realUser: Record<string, unknown> | null = null;

async function setupRealBackend() {
  if (realToken) return;

  let res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'screenshot-bot@automl.test', password: 'Screenshot2026!', name: 'Screenshot Bot' }),
  });
  if (!res.ok) {
    res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'screenshot-bot@automl.test', password: 'Screenshot2026!' }),
    });
  }
  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  const auth = (await res.json()) as { accessToken: string; refreshToken: string; user: Record<string, unknown> };
  realToken = auth.accessToken;
  realUser = auth.user;

  const projRes = await fetch(`${API}/projects`, { headers: { Authorization: `Bearer ${realToken}` } });
  const projList = (await projRes.json()) as { projects: Array<{ id: string }> };
  if (projList.projects?.length > 0) {
    realProjectId = projList.projects[0].id;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Inject real auth + chat messages into localStorage before page loads. */
async function injectAuthStorage(page: import('@playwright/test').Page) {
  await page.addInitScript(
    ({ token, user, projectId, ppMessages, trainMessages }) => {
      localStorage.setItem('auth-storage', JSON.stringify({
        state: { accessToken: token, refreshToken: token, user, isAuthenticated: true, isLoading: false, error: null },
        version: 0,
      }));
      localStorage.setItem('automl-projects-storage', JSON.stringify({
        state: { projects: [], activeProjectId: projectId, isInitialized: false, isLoading: false },
        version: 0,
      }));

      // Spray messages across plausible tab/workbook ID patterns (actual key
      // is only known after the app creates its tab, so we cover common patterns)
      for (const t of ['processing-tab-1', 'workbook-1', 'tab-1', 'default']) {
        localStorage.setItem(`preprocessing-messages-v5-${t}-${projectId}`, JSON.stringify(ppMessages));
      }
      for (const w of ['training-wb-1', 'workbook-1', 'default']) {
        localStorage.setItem(`training-messages-v1-${w}-${projectId}`, JSON.stringify(trainMessages));
      }

      localStorage.setItem('theme', 'dark');
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    },
    { token: realToken!, user: realUser!, projectId: realProjectId!, ppMessages: PREPROCESSING_MESSAGES, trainMessages: TRAINING_MESSAGES },
  );
}

/** Overwrite chat messages for any matching localStorage keys created at runtime. */
async function injectMessagesForMatchingKeys(
  page: import('@playwright/test').Page,
  prefix: string,
  messages: unknown,
  projectId: string,
) {
  await page.evaluate(({ msgs, pid, pfx }) => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(pfx) && key.endsWith(pid)) {
        localStorage.setItem(key, JSON.stringify(msgs));
      }
    }
  }, { msgs: messages, pid: projectId, pfx: prefix });
}

/** Dismiss the preprocessing dataset selector modal if visible. */
async function dismissDatasetModal(page: import('@playwright/test').Page) {
  const modal = page.locator('[role="dialog"]').first();
  if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.locator('[role="dialog"] >> text=customers.csv').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(2000);
    if (await modal.isVisible({ timeout: 500 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  }
}

// ---------------------------------------------------------------------------
// Screenshot tests
// ---------------------------------------------------------------------------

test.describe('README Screenshots', () => {
  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await setupRealBackend();
  });

  test.use({
    viewport: { width: 1400, height: 900 },
    colorScheme: 'dark',
  });

  // -------- 1. Upload & Planning --------

  test('1. Upload page with plan', async ({ page }) => {
    // Add plan metadata to the real project
    const headers = { Authorization: `Bearer ${realToken}`, 'Content-Type': 'application/json' };
    const projRes = await fetch(`${API}/projects/${realProjectId}`, { headers });
    const existing = (await projRes.json()) as Record<string, unknown>;
    const existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;
    await fetch(`${API}/projects/${realProjectId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({
        metadata: {
          ...existingMeta,
          plans: [{ id: 'plan-1', name: 'Customer Churn Prediction', content: PLAN_CONTENT }],
          activePlanId: 'plan-1',
          projectPlan: PLAN_CONTENT,
          projectPlanName: 'Customer Churn Prediction',
          uploadStage: 'upload',
        },
      }),
    });

    await injectAuthStorage(page);
    await page.goto(`${BASE_URL}/project/${realProjectId}/upload`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const planItem = page.locator('text=Customer Churn Prediction').first();
    if (await planItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await planItem.click();
      await page.waitForTimeout(1500);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'upload.png'), type: 'png' });
  });

  // -------- 2. EDA Dashboard --------

  test('2. EDA analysis view', async ({ page }) => {
    await injectAuthStorage(page);
    await page.goto(`${BASE_URL}/project/${realProjectId}/data-viewer`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Click customers.csv tab (it has the most interesting data)
    const customersTab = page.locator('text=customers.csv').first();
    if (await customersTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customersTab.click();
      await page.waitForTimeout(2000);
    }

    // Try to switch to EDA analysis view
    for (const selector of ['[aria-label="Analysis view"]', '[aria-label="EDA view"]', 'button:has(svg.lucide-bar-chart)', 'button[value="eda"]']) {
      const toggle = page.locator(selector).first();
      if (await toggle.isVisible({ timeout: 1000 }).catch(() => false)) {
        await toggle.click();
        await page.waitForTimeout(2000);
        break;
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'eda.png'), type: 'png' });
  });

  // -------- 3. NL-to-SQL --------

  test('3. NL-to-SQL query', async ({ page }) => {
    await injectAuthStorage(page);
    await page.goto(`${BASE_URL}/project/${realProjectId}/data-viewer`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const customersTab = page.locator('text=customers.csv').first();
    if (await customersTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customersTab.click();
      await page.waitForTimeout(1500);
    }

    const nlToggle = page.locator('[aria-label="Natural language mode"]').first();
    if (await nlToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nlToggle.click();
      await page.waitForTimeout(500);
    }

    const nlInput = page.locator('textarea').first();
    if (await nlInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nlInput.fill('What is the churn rate by industry? Show the top 5 industries with highest churn.');
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'nl-to-sql.png'), type: 'png' });
  });

  // -------- 4. Preprocessing --------

  test('4. Preprocessing agentic shell', async ({ page }) => {
    await injectAuthStorage(page);
    await page.goto(`${BASE_URL}/project/${realProjectId}/preprocessing`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    await dismissDatasetModal(page);

    // Inject messages for whatever tab key was created at runtime
    await injectMessagesForMatchingKeys(page, 'preprocessing-messages-v5-', PREPROCESSING_MESSAGES, realProjectId!);

    // Reload to hydrate injected messages, then dismiss modal again
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await dismissDatasetModal(page);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'preprocessing.png'), type: 'png' });
  });

  // -------- 5. Training --------

  test('5. Training workspace', async ({ page }) => {
    await injectAuthStorage(page);

    // Override notebook cells with curated NovaCraft training content
    await page.route('**/api/notebooks/*/cells', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: CELLS_JSON }),
    );
    for (const cell of NOTEBOOK_CELLS) {
      await page.route(`**/api/cells/${cell.cellId}`, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cell) }),
      );
    }

    await page.goto(`${BASE_URL}/project/${realProjectId}/training`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    await injectMessagesForMatchingKeys(page, 'training-messages-v1-', TRAINING_MESSAGES, realProjectId!);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'training.png'), type: 'png' });
  });

  // -------- 6. Experiments --------

  test('6. Experiments leaderboard', async ({ page }) => {
    await injectAuthStorage(page);

    // Mock models endpoint with curated NovaCraft churn models
    await page.route('**/api/models/templates', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: TEMPLATES_JSON }),
    );
    await page.route('**/api/models?**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: MODELS_JSON }),
    );
    await page.route('**/api/models', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: MODELS_JSON });
      }
      return route.continue();
    });

    await page.goto(`${BASE_URL}/project/${realProjectId}/experiments`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'experiments.png'), type: 'png' });
  });
});
