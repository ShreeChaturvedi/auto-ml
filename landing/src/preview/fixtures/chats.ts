// Pre-rendered chat history for the preprocessing, feature-engineering, and training tabs.
// Each tab reuses <ToolIndicator> and <ToolResultRenderer> from frontend/ so these messages
// must match the shape those components expect.

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallRow[];
  timestamp: string;
}

export interface ToolCallRow {
  id: string;
  name: string;
  label: string;
  status: 'complete';
  hint?: string;
}

export const preprocessingChat: ChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: 'Fix the data quality issues you found in the customers table.',
    timestamp: '2026-03-12T10:24:00Z',
  },
  {
    id: 'm2',
    role: 'assistant',
    content: "I found 4 issues worth fixing. I'll handle them in order — missing values first, then the constant column, then duplicates.",
    toolCalls: [
      { id: 't1', name: 'profile_column', label: 'Profile annual_revenue_usd', status: 'complete', hint: '8% missing, heavy right-skew' },
      { id: 't2', name: 'impute_median', label: 'Impute with median by industry', status: 'complete', hint: '202 rows filled' },
      { id: 't3', name: 'drop_column', label: 'Drop region_code', status: 'complete', hint: 'constant: all "GLOBAL"' },
      { id: 't4', name: 'deduplicate', label: 'Drop exact duplicates', status: 'complete', hint: '30 rows removed' },
    ],
    timestamp: '2026-03-12T10:24:11Z',
  },
  {
    id: 'm3',
    role: 'assistant',
    content: 'Done. 4 cells added to the notebook — all reversible.',
    timestamp: '2026-03-12T10:24:42Z',
  },
];

export const featureEngineeringChat: ChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: 'Derive churn-predictive features from subscription and usage history.',
    timestamp: '2026-03-12T10:32:00Z',
  },
  {
    id: 'm2',
    role: 'assistant',
    content: 'I joined three tables and derived 12 features. Top candidates by mutual information below.',
    toolCalls: [
      { id: 't1', name: 'join_tables', label: 'Join customers ⇐ subscriptions', status: 'complete', hint: 'on customer_id' },
      { id: 't2', name: 'join_tables', label: 'Join customers ⇐ usage_metrics', status: 'complete', hint: 'on customer_id (aggregated)' },
      { id: 't3', name: 'derive_feature', label: 'recency_days', status: 'complete', hint: 'days since last login' },
      { id: 't4', name: 'derive_feature', label: 'mrr_delta_30d', status: 'complete', hint: 'MRR change last 30 days' },
      { id: 't5', name: 'derive_feature', label: 'ticket_escalation_rate', status: 'complete', hint: 'escalated / total tickets' },
      { id: 't6', name: 'mutual_information', label: 'Rank features by MI', status: 'complete', hint: 'top 10 retained' },
    ],
    timestamp: '2026-03-12T10:32:28Z',
  },
];

export const trainingChat: ChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: 'Train classifiers with 5-fold CV and find the champion.',
    timestamp: '2026-03-12T10:41:00Z',
  },
  {
    id: 'm2',
    role: 'assistant',
    content: 'Training 4 models in parallel. Using Optuna for hyperparameter search with 40 trials each.',
    toolCalls: [
      { id: 't1', name: 'train_model', label: 'LogisticRegression', status: 'complete', hint: 'F1 0.79' },
      { id: 't2', name: 'train_model', label: 'RandomForest', status: 'complete', hint: 'F1 0.86' },
      { id: 't3', name: 'train_model', label: 'XGBoost', status: 'complete', hint: 'F1 0.91 ⭐ champion' },
      { id: 't4', name: 'train_model', label: 'LightGBM', status: 'complete', hint: 'F1 0.90' },
      { id: 't5', name: 'compute_shap', label: 'SHAP values for XGBoost', status: 'complete' },
    ],
    timestamp: '2026-03-12T10:41:35Z',
  },
  {
    id: 'm3',
    role: 'assistant',
    content: 'XGBoost wins with F1 0.91 on the held-out fold. Top features: recency_days, mrr_delta_30d, ticket_escalation_rate.',
    timestamp: '2026-03-12T10:45:12Z',
  },
];
