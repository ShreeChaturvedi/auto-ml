// Pre-rendered notebook cells for preprocessing, feature-engineering, and training tabs.
// Format intentionally decoupled from frontend's internal NotebookCell shape so the
// landing preview can render cells with its own lightweight component.

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
