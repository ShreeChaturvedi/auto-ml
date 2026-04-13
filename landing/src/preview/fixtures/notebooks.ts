// Pre-rendered notebook cells for preprocessing, feature-engineering, and training tabs.
// Format intentionally decoupled from frontend's internal NotebookCell shape so the
// landing preview can render cells with its own lightweight component.
//
// The Feature Engineering tab was rebuilt to render its cell outputs through
// the real frontend `<NotebookCellOutput>` leaf component. That export lives
// at the bottom of this file (`featureEngineeringNotebookCells`) and uses
// the real `RichOutput` shape from `@frontend/lib/api/execution`.

import type { RichOutput } from '@frontend/lib/api/execution';

export type NotebookCellKind = 'markdown' | 'code' | 'output';

export interface NotebookCellFixture {
  id: string;
  kind: NotebookCellKind;
  source: string;
  outputs?: NotebookOutputFixture[];
}

export type NotebookOutputFixture =
  | { type: 'text'; text: string }
  | { type: 'table'; columns: string[]; rows: (string | number)[][] }
  | { type: 'chart'; chartType: 'bar' | 'histogram' | 'line'; data: { name: string; value: number }[] };

export const preprocessingNotebook: NotebookCellFixture[] = [
  {
    id: 'pp_md_1',
    kind: 'markdown',
    source: '## Data quality repair — customers.csv',
  },
  {
    id: 'pp_code_1',
    kind: 'code',
    source: `# Profile annual_revenue_usd
profile = df['annual_revenue_usd'].describe()
missing = df['annual_revenue_usd'].isna().sum()
print(f"missing: {missing} ({100 * missing / len(df):.1f}%)")
profile`,
    outputs: [
      { type: 'text', text: 'missing: 202 (8.0%)' },
      {
        type: 'table',
        columns: ['stat', 'value'],
        rows: [
          ['count', 2328],
          ['mean', 4_870_432],
          ['std', 8_120_544],
          ['min', 12_000],
          ['50%', 1_200_000],
          ['max', 124_000_000],
        ],
      },
    ],
  },
  {
    id: 'pp_code_2',
    kind: 'code',
    source: `# Impute by industry median
from sklearn.impute import SimpleImputer
industry_medians = df.groupby('industry')['annual_revenue_usd'].transform('median')
df['annual_revenue_usd'] = df['annual_revenue_usd'].fillna(industry_medians)
df['annual_revenue_usd'].isna().sum()`,
    outputs: [{ type: 'text', text: '0' }],
  },
  {
    id: 'pp_code_3',
    kind: 'code',
    source: `# Drop constant + duplicate rows
df = df.drop(columns=['region_code'])
before = len(df)
df = df.drop_duplicates()
print(f"dropped {before - len(df)} duplicate rows")`,
    outputs: [{ type: 'text', text: 'dropped 30 duplicate rows' }],
  },
];

export const featureEngineeringNotebook: NotebookCellFixture[] = [
  {
    id: 'fe_md_1',
    kind: 'markdown',
    source: '## Feature derivation — joined customer view',
  },
  {
    id: 'fe_code_1',
    kind: 'code',
    source: `# Build the joined customer view
customers_view = (
    customers
    .merge(subscriptions, on='customer_id', how='left')
    .merge(
        usage_metrics.groupby('customer_id').agg(
            active_users_mean=('active_users', 'mean'),
            logins_sum=('total_logins', 'sum'),
            api_calls_p95=('api_calls', lambda s: s.quantile(0.95)),
        ),
        on='customer_id',
        how='left',
    )
)
print(customers_view.shape)`,
    outputs: [{ type: 'text', text: '(2500, 31)' }],
  },
  {
    id: 'fe_code_2',
    kind: 'code',
    source: `# Derive recency, frequency, monetary, engagement
from datetime import datetime
today = datetime(2026, 4, 1)
customers_view['recency_days'] = (today - customers_view['last_login']).dt.days
customers_view['mrr_delta_30d'] = customers_view['mrr_usd'] - customers_view['mrr_usd_30d_ago']
customers_view['ticket_escalation_rate'] = (
    customers_view['escalated_tickets'] / customers_view['total_tickets'].clip(lower=1)
)
customers_view[['recency_days', 'mrr_delta_30d', 'ticket_escalation_rate']].describe()`,
    outputs: [
      {
        type: 'table',
        columns: ['feature', 'mean', 'std'],
        rows: [
          ['recency_days',           42.8,  61.2],
          ['mrr_delta_30d',          -12.1, 84.3],
          ['ticket_escalation_rate', 0.06,  0.14],
        ],
      },
    ],
  },
  {
    id: 'fe_code_3',
    kind: 'code',
    source: `# Rank features by mutual information with is_active
from sklearn.feature_selection import mutual_info_classif
X = customers_view.drop(columns=['is_active'])
y = customers_view['is_active']
mi = mutual_info_classif(X.select_dtypes(include='number').fillna(0), y)
top = pd.Series(mi, index=X.select_dtypes(include='number').columns).sort_values(ascending=False)
top.head(10)`,
    outputs: [
      {
        type: 'chart',
        chartType: 'bar',
        data: [
          { name: 'recency_days',           value: 0.214 },
          { name: 'mrr_delta_30d',          value: 0.198 },
          { name: 'ticket_escalation_rate', value: 0.176 },
          { name: 'plan_tier',              value: 0.145 },
          { name: 'active_users_mean',      value: 0.131 },
          { name: 'api_calls_p95',          value: 0.119 },
          { name: 'logins_sum',             value: 0.104 },
          { name: 'seats_purchased',        value: 0.091 },
          { name: 'avg_session_minutes',    value: 0.082 },
          { name: 'satisfaction_score',     value: 0.074 },
        ],
      },
    ],
  },
];

export const trainingNotebook: NotebookCellFixture[] = [
  {
    id: 'tr_md_1',
    kind: 'markdown',
    source: '## Training — 4 classifiers, 5-fold CV',
  },
  {
    id: 'tr_code_1',
    kind: 'code',
    source: `# Build pipeline + search space
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold
import optuna, xgboost as xgb

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

def objective(trial):
    params = {
        'max_depth':        trial.suggest_int('max_depth', 3, 10),
        'learning_rate':    trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
        'n_estimators':     trial.suggest_int('n_estimators', 100, 600),
        'subsample':        trial.suggest_float('subsample', 0.6, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
    }
    model = xgb.XGBClassifier(**params, random_state=42)
    scores = cross_val_score(model, X, y, cv=cv, scoring='f1')
    return scores.mean()

study = optuna.create_study(direction='maximize')
study.optimize(objective, n_trials=40, show_progress_bar=True)
print(f"best F1: {study.best_value:.4f}")
print(f"best params: {study.best_params}")`,
    outputs: [
      { type: 'text', text: 'best F1: 0.9117' },
      { type: 'text', text: "best params: {'max_depth': 7, 'learning_rate': 0.083, 'n_estimators': 420, 'subsample': 0.85, 'colsample_bytree': 0.78}" },
    ],
  },
  {
    id: 'tr_code_2',
    kind: 'code',
    source: `# Fit final champion and compute SHAP
import shap
champion = xgb.XGBClassifier(**study.best_params, random_state=42).fit(X, y)
explainer = shap.TreeExplainer(champion)
shap_values = explainer.shap_values(X)
shap.summary_plot(shap_values, X, plot_type='bar', max_display=8)`,
    outputs: [
      {
        type: 'chart',
        chartType: 'bar',
        data: [
          { name: 'recency_days',           value: 0.82 },
          { name: 'mrr_delta_30d',          value: 0.71 },
          { name: 'ticket_escalation_rate', value: 0.58 },
          { name: 'plan_tier=Starter',      value: 0.44 },
          { name: 'logins_sum',             value: 0.37 },
          { name: 'api_calls_p95',          value: 0.29 },
          { name: 'satisfaction_score',     value: 0.22 },
          { name: 'seats_purchased',        value: 0.18 },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Feature Engineering tab — NotebookCellOutput-shaped cells.
//
// Consumed by the rebuilt <FeatureEngineeringView> via the real frontend
// <NotebookCellOutput>. RichOutput[] shape — NO `type: 'chart'`, since that
// branch lazy-loads Plotly (~4.9 MB) in CellOutputRenderer → PlotlyOutput.
// Text + table only. Bundle-lean per landing spec §5.10.
// ---------------------------------------------------------------------------

export interface FeatureEngineeringNotebookCell {
  id: string;
  kind: 'markdown' | 'code';
  source: string;
  /** RichOutput[] passed directly to <NotebookCellOutput outputs={…} />. */
  outputs?: RichOutput[];
}

export const featureEngineeringNotebookCells: FeatureEngineeringNotebookCell[] = [
  {
    id: 'fe2_md',
    kind: 'markdown',
    source: '## Feature engineering · NovaCraft customers',
  },
  {
    id: 'fe2_code_1',
    kind: 'code',
    source: `# One-hot encode plan tier
df = pd.get_dummies(df, columns=['plan_tier'], prefix='plan')
df.filter(like='plan_').head()`,
    outputs: [
      {
        type: 'text',
        content: 'shape after one-hot: (2500, 34)',
      },
      {
        type: 'table',
        content: 'First 5 rows · plan_* columns',
        data: {
          columns: ['plan_Starter', 'plan_Growth', 'plan_Scale', 'plan_Enterprise'],
          rows: [
            { plan_Starter: 'True',  plan_Growth: 'False', plan_Scale: 'False', plan_Enterprise: 'False' },
            { plan_Starter: 'False', plan_Growth: 'True',  plan_Scale: 'False', plan_Enterprise: 'False' },
            { plan_Starter: 'False', plan_Growth: 'False', plan_Scale: 'True',  plan_Enterprise: 'False' },
            { plan_Starter: 'False', plan_Growth: 'False', plan_Scale: 'False', plan_Enterprise: 'True'  },
            { plan_Starter: 'False', plan_Growth: 'True',  plan_Scale: 'False', plan_Enterprise: 'False' },
          ],
        },
      },
    ],
  },
  {
    id: 'fe2_code_2',
    kind: 'code',
    source: `# Temporal features from signup_dt
df['signup_dt'] = pd.to_datetime(df['signup_dt'])
df['days_since_signup'] = (pd.Timestamp.now() - df['signup_dt']).dt.days
df['signup_quarter']    = df['signup_dt'].dt.to_period('Q').astype(str)
df[['days_since_signup', 'signup_quarter']].head()`,
    outputs: [
      {
        type: 'table',
        content: 'First 5 rows · temporal features',
        data: {
          columns: ['days_since_signup', 'signup_quarter'],
          rows: [
            { days_since_signup: 1284, signup_quarter: '2022Q4' },
            { days_since_signup:  612, signup_quarter: '2024Q3' },
            { days_since_signup:  198, signup_quarter: '2025Q3' },
            { days_since_signup:  941, signup_quarter: '2023Q3' },
            { days_since_signup:   74, signup_quarter: '2026Q1' },
          ],
        },
      },
    ],
  },
  {
    id: 'fe2_code_3',
    kind: 'code',
    source: `# Revenue-per-call ratio feature
df['revenue_per_call'] = df['annual_revenue_usd'] / (df['api_calls'] + 1)
df[['annual_revenue_usd', 'api_calls', 'revenue_per_call']].describe().round(2).head()`,
    outputs: [
      {
        type: 'text',
        content: 'final shape: (2500, 38) · 7 new feature columns',
      },
      {
        type: 'table',
        content: 'describe() · revenue_per_call',
        data: {
          columns: ['stat', 'annual_revenue_usd', 'api_calls', 'revenue_per_call'],
          rows: [
            { stat: 'count', annual_revenue_usd: '2500',       api_calls: '2500',   revenue_per_call: '2500'  },
            { stat: 'mean',  annual_revenue_usd: '4870432.00', api_calls: '12004',  revenue_per_call: '612.48' },
            { stat: 'std',   annual_revenue_usd: '8120544.00', api_calls: '18402',  revenue_per_call: '914.21' },
            { stat: 'min',   annual_revenue_usd: '12000.00',   api_calls: '0',      revenue_per_call: '1.92'   },
            { stat: '50%',   annual_revenue_usd: '1200000.00', api_calls: '4210',   revenue_per_call: '305.17' },
          ],
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Preprocessing tab — real frontend `<NotebookCellOutput>` cells.
//
// Code source ships as a pre-baked Shiki `github-dark` HTML string so we
// don't pull streamdown (~450 KB) or Monaco (~2 MB) into the landing bundle
// for a handful of read-only cells. Outputs use the real `RichOutput` shape
// so the rebuilt `<PreprocessingView>` can hand them straight to the real
// `<NotebookCellOutput>` leaf component.
//
// Bundle-size rule: NEVER emit `type: 'chart'` here — that branch lazy-loads
// Plotly in `CellOutputRenderer → PlotlyOutput`. Text + table only.
// ---------------------------------------------------------------------------

export interface PreprocessingNotebookCellFixture {
  id: string;
  executionIndex: number;
  /** Plain-text Python source — copyable/accessible fallback. */
  source: string;
  /** Pre-baked Shiki `github-dark` HTML for visual fidelity. */
  highlightedHtml: string;
  /** RichOutput[] passed directly to <NotebookCellOutput outputs={…} />. */
  outputs: RichOutput[];
}

/**
 * Pre-highlighted with Shiki `github-dark` (matches the streamdown default).
 * Regenerate with:
 *   node -e "import('shiki').then(async ({codeToHtml}) => \
 *     console.log(await codeToHtml(SOURCE, { lang: 'python', theme: 'github-dark' })))"
 */
const PP_CELL_1_CODE = `import pandas as pd

df = pd.read_csv('customers.csv')
print(df.shape)
df.head()`;

const PP_CELL_1_HTML =
  '<pre class="shiki github-dark" style="background-color:#24292e;color:#e1e4e8" tabindex="0"><code>' +
  '<span class="line"><span style="color:#F97583">import</span><span style="color:#E1E4E8"> pandas </span><span style="color:#F97583">as</span><span style="color:#E1E4E8"> pd</span></span>\n' +
  '<span class="line"></span>\n' +
  '<span class="line"><span style="color:#E1E4E8">df </span><span style="color:#F97583">=</span><span style="color:#E1E4E8"> pd.read_csv(</span><span style="color:#9ECBFF">\'customers.csv\'</span><span style="color:#E1E4E8">)</span></span>\n' +
  '<span class="line"><span style="color:#B392F0">print</span><span style="color:#E1E4E8">(df.shape)</span></span>\n' +
  '<span class="line"><span style="color:#E1E4E8">df.head()</span></span>' +
  '</code></pre>';

const PP_CELL_2_CODE = `# Data quality repair — customers.csv
df['mrr_usd'] = df['mrr_usd'].fillna(df['mrr_usd'].median())
df['signup_dt'] = pd.to_datetime(df['signup_dt'], errors='coerce')
df = df[df['api_calls'] < df['api_calls'].quantile(0.995)]
df.head()`;

const PP_CELL_2_HTML =
  '<pre class="shiki github-dark" style="background-color:#24292e;color:#e1e4e8" tabindex="0"><code>' +
  '<span class="line"><span style="color:#6A737D"># Data quality repair — customers.csv</span></span>\n' +
  '<span class="line"><span style="color:#E1E4E8">df[</span><span style="color:#9ECBFF">\'mrr_usd\'</span><span style="color:#E1E4E8">] </span><span style="color:#F97583">=</span><span style="color:#E1E4E8"> df[</span><span style="color:#9ECBFF">\'mrr_usd\'</span><span style="color:#E1E4E8">].fillna(df[</span><span style="color:#9ECBFF">\'mrr_usd\'</span><span style="color:#E1E4E8">].median())</span></span>\n' +
  '<span class="line"><span style="color:#E1E4E8">df[</span><span style="color:#9ECBFF">\'signup_dt\'</span><span style="color:#E1E4E8">] </span><span style="color:#F97583">=</span><span style="color:#E1E4E8"> pd.to_datetime(df[</span><span style="color:#9ECBFF">\'signup_dt\'</span><span style="color:#E1E4E8">], errors</span><span style="color:#F97583">=</span><span style="color:#9ECBFF">\'coerce\'</span><span style="color:#E1E4E8">)</span></span>\n' +
  '<span class="line"><span style="color:#E1E4E8">df </span><span style="color:#F97583">=</span><span style="color:#E1E4E8"> df[df[</span><span style="color:#9ECBFF">\'api_calls\'</span><span style="color:#E1E4E8">] </span><span style="color:#F97583">&#x3C;</span><span style="color:#E1E4E8"> df[</span><span style="color:#9ECBFF">\'api_calls\'</span><span style="color:#E1E4E8">].quantile(</span><span style="color:#79B8FF">0.995</span><span style="color:#E1E4E8">)]</span></span>\n' +
  '<span class="line"><span style="color:#E1E4E8">df.head()</span></span>' +
  '</code></pre>';

const PP_CELL_3_CODE = `# Validate — nulls should be zero, dates parsed, no p99 blow-up
print('nulls:', int(df[['mrr_usd', 'signup_dt']].isna().sum().sum()))
print('rows: ', len(df))
df[['mrr_usd', 'api_calls']].describe()`;

const PP_CELL_3_HTML =
  '<pre class="shiki github-dark" style="background-color:#24292e;color:#e1e4e8" tabindex="0"><code>' +
  '<span class="line"><span style="color:#6A737D"># Validate — nulls should be zero, dates parsed, no p99 blow-up</span></span>\n' +
  '<span class="line"><span style="color:#B392F0">print</span><span style="color:#E1E4E8">(</span><span style="color:#9ECBFF">\'nulls:\'</span><span style="color:#E1E4E8">, </span><span style="color:#B392F0">int</span><span style="color:#E1E4E8">(df[[</span><span style="color:#9ECBFF">\'mrr_usd\'</span><span style="color:#E1E4E8">, </span><span style="color:#9ECBFF">\'signup_dt\'</span><span style="color:#E1E4E8">]].isna().sum().sum()))</span></span>\n' +
  '<span class="line"><span style="color:#B392F0">print</span><span style="color:#E1E4E8">(</span><span style="color:#9ECBFF">\'rows: \'</span><span style="color:#E1E4E8">, </span><span style="color:#B392F0">len</span><span style="color:#E1E4E8">(df))</span></span>\n' +
  '<span class="line"><span style="color:#E1E4E8">df[[</span><span style="color:#9ECBFF">\'mrr_usd\'</span><span style="color:#E1E4E8">, </span><span style="color:#9ECBFF">\'api_calls\'</span><span style="color:#E1E4E8">]].describe()</span></span>' +
  '</code></pre>';

export const preprocessingNotebookCells: PreprocessingNotebookCellFixture[] = [
  {
    id: 'pp_cell_1',
    executionIndex: 1,
    source: PP_CELL_1_CODE,
    highlightedHtml: PP_CELL_1_HTML,
    outputs: [
      { type: 'text', content: '(2530, 14)' },
      {
        type: 'table',
        content: 'df.head()',
        data: {
          columns: ['customer_id', 'mrr_usd', 'signup_dt', 'api_calls', 'plan_tier'],
          rows: [
            { customer_id: '1001', mrr_usd: '1,620', signup_dt: '2024-11-03', api_calls: '4,218',   plan_tier: 'Growth'  },
            { customer_id: '1002', mrr_usd: 'NaN',   signup_dt: '2025-02-18', api_calls: '12,904',  plan_tier: 'Scale'   },
            { customer_id: '1003', mrr_usd: '820',   signup_dt: '',           api_calls: '2,118',   plan_tier: 'Starter' },
            { customer_id: '1004', mrr_usd: '4,300', signup_dt: '2023-08-22', api_calls: '892,448', plan_tier: 'Scale'   },
            { customer_id: '1005', mrr_usd: '2,090', signup_dt: '2025-04-01', api_calls: '3,412',   plan_tier: 'Growth'  },
          ],
        },
      },
    ],
  },
  {
    id: 'pp_cell_2',
    executionIndex: 2,
    source: PP_CELL_2_CODE,
    highlightedHtml: PP_CELL_2_HTML,
    outputs: [
      {
        type: 'table',
        content: 'df.head() — after fixes',
        data: {
          columns: ['customer_id', 'mrr_usd', 'signup_dt', 'api_calls', 'plan_tier'],
          rows: [
            { customer_id: '1001', mrr_usd: '1,620', signup_dt: '2024-11-03', api_calls: '4,218',  plan_tier: 'Growth'  },
            { customer_id: '1002', mrr_usd: '1,620', signup_dt: '2025-02-18', api_calls: '12,904', plan_tier: 'Scale'   },
            { customer_id: '1003', mrr_usd: '820',   signup_dt: 'NaT',        api_calls: '2,118',  plan_tier: 'Starter' },
            { customer_id: '1005', mrr_usd: '2,090', signup_dt: '2025-04-01', api_calls: '3,412',  plan_tier: 'Growth'  },
            { customer_id: '1006', mrr_usd: '3,410', signup_dt: '2024-06-11', api_calls: '8,740',  plan_tier: 'Scale'   },
          ],
        },
      },
    ],
  },
  {
    id: 'pp_cell_3',
    executionIndex: 3,
    source: PP_CELL_3_CODE,
    highlightedHtml: PP_CELL_3_HTML,
    outputs: [
      { type: 'text', content: 'nulls: 0\nrows:  2517' },
      {
        type: 'table',
        content: 'describe()',
        data: {
          columns: ['stat', 'mrr_usd', 'api_calls'],
          rows: [
            { stat: 'count', mrr_usd: '2,517',  api_calls: '2,517'   },
            { stat: 'mean',  mrr_usd: '2,158',  api_calls: '8,942'   },
            { stat: 'std',   mrr_usd: '1,807',  api_calls: '14,611'  },
            { stat: 'min',   mrr_usd: '0',      api_calls: '0'       },
            { stat: '50%',   mrr_usd: '1,620',  api_calls: '3,412'   },
            { stat: 'max',   mrr_usd: '24,180', api_calls: '349,982' },
          ],
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Training tab — NotebookCellOutput-shaped cells.
//
// Parallel to `featureEngineeringNotebookCells` and
// `preprocessingNotebookCells` above. Consumed by the rebuilt
// <TrainingView> via the real frontend <NotebookCellOutput>.
// RichOutput[] shape — NO `type: 'chart'` (pulls in Plotly, ~4.9 MB).
// ---------------------------------------------------------------------------

export interface TrainingNotebookCell {
  id: string;
  kind: 'markdown' | 'code';
  source: string;
  /** RichOutput[] passed directly to <NotebookCellOutput outputs={…} />. */
  outputs?: RichOutput[];
}

export const trainingNotebookCells: TrainingNotebookCell[] = [
  {
    id: 'tr2_md',
    kind: 'markdown',
    source: '## Train the champion · XGBoost',
  },
  {
    id: 'tr2_code_1',
    kind: 'code',
    source: `from xgboost import XGBClassifier
from sklearn.model_selection import cross_validate

clf = XGBClassifier(
    n_estimators=200,
    max_depth=6,
    learning_rate=0.05,
    subsample=0.85,
    colsample_bytree=0.78,
    random_state=42,
)
scores = cross_validate(clf, X_train, y_train, cv=5, scoring=['f1', 'roc_auc'])
print(f"F1:  {scores['test_f1'].mean():.4f}")
print(f"AUC: {scores['test_roc_auc'].mean():.4f}")`,
    outputs: [
      { type: 'text', content: 'F1:  0.9117\nAUC: 0.9530' },
    ],
  },
  {
    id: 'tr2_code_2',
    kind: 'code',
    source: `clf.fit(X_train, y_train)
pd.DataFrame({
    'feature': X_train.columns,
    'gain':    clf.feature_importances_,
}).sort_values('gain', ascending=False).head(5)`,
    outputs: [
      {
        type: 'table',
        content: 'Top 5 features by gain',
        data: {
          columns: ['feature', 'gain'],
          rows: [
            { feature: 'recency_days',           gain: '0.2140' },
            { feature: 'mrr_delta_30d',          gain: '0.1980' },
            { feature: 'ticket_escalation_rate', gain: '0.1760' },
            { feature: 'plan_tier',              gain: '0.1450' },
            { feature: 'active_users_mean',      gain: '0.1310' },
          ],
        },
      },
    ],
  },
];
