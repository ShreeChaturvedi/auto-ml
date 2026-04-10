// Pre-rendered chat history for the preprocessing, feature-engineering, and training tabs.
// Each tab reuses <ToolIndicator> and <ToolResultRenderer> from frontend/ so these messages
// must match the shape those components expect.
//
// The legacy `ChatMessage`/`ToolCallRow` shape below is still used by the
// landing-local `ChatHistory` helper. The Feature Engineering tab was rebuilt
// against the real frontend `<ToolIndicator>` leaf component; its fixture
// (`featureEngineeringChatTurns`) lives at the bottom of this file and uses
// the real `ToolCall`/`ToolResult` types from `@frontend/types/llmUi`.

import type { ToolCall, ToolResult } from '@frontend/types/llmUi';

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

// ---------------------------------------------------------------------------
// Feature Engineering tab — real leaf components.
//
// Consumed by the rebuilt <FeatureEngineeringView> via the real frontend
// `<ToolIndicator>`. Uses two tools with dedicated expanded renderers
// (`list_cells` → ListCellsResult, `edit_cell` → EditCellDiff) so clicking
// a tool row reveals an authentic card instead of a JSON dump.
// ---------------------------------------------------------------------------

export interface FeatureEngineeringChatTurn {
  id: string;
  role: 'user' | 'assistant';
  /** Optional assistant prose rendered as a bubble above the tool strip. */
  text?: string;
  /** Tool calls and their completed results. Rendered via <ToolIndicator>. */
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export const featureEngineeringChatTurns: FeatureEngineeringChatTurn[] = [
  {
    id: 'fe-u1',
    role: 'user',
    text:
      "Now derive churn-predictive features on top of the cleaned customers table — encode plan_tier, pull temporal features from signup_dt, and add a revenue-per-call ratio.",
  },
  {
    id: 'fe-a1',
    role: 'assistant',
    text:
      "Let me scan the feature notebook so I know where to slot the new cells, then I'll edit the transforms cell in place.",
    toolCalls: [
      {
        id: 'fe-call-list-1',
        tool: 'list_cells',
        args: { notebookId: 'nb_feature_engineering' },
      },
      {
        id: 'fe-call-edit-1',
        tool: 'edit_cell',
        args: {
          cellId: 'cell_fe_transforms',
          startLine: 1,
          endLine: 1,
          newContent:
            "df = pd.get_dummies(df, columns=['plan_tier'], prefix='plan')\n" +
            "df['days_since_signup'] = (pd.Timestamp.now() - df['signup_dt']).dt.days\n" +
            "df['signup_quarter'] = df['signup_dt'].dt.to_period('Q').astype(str)\n" +
            "df['revenue_per_call'] = df['annual_revenue_usd'] / (df['api_calls'] + 1)",
        },
      },
    ],
    toolResults: [
      {
        id: 'fe-call-list-1',
        tool: 'list_cells',
        output: {
          notebookId: 'nb_feature_engineering',
          cells: [
            { cellId: 'c1', title: 'Feature engineering — NovaCraft customers', cellType: 'markdown', position: 0, status: 'executed' },
            { cellId: 'c2', title: 'Load cleaned customers frame',               cellType: 'code',     position: 1, status: 'executed' },
            { cellId: 'cell_fe_transforms', title: 'Feature transforms',         cellType: 'code',     position: 2, status: 'pending'  },
            { cellId: 'c4', title: 'Preview derived feature columns',            cellType: 'code',     position: 3, status: 'pending'  },
          ],
        },
      },
      {
        id: 'fe-call-edit-1',
        tool: 'edit_cell',
        output: {
          oldContent: "df = df.copy()",
          newContent:
            "df = pd.get_dummies(df, columns=['plan_tier'], prefix='plan')\n" +
            "df['days_since_signup'] = (pd.Timestamp.now() - df['signup_dt']).dt.days\n" +
            "df['signup_quarter'] = df['signup_dt'].dt.to_period('Q').astype(str)\n" +
            "df['revenue_per_call'] = df['annual_revenue_usd'] / (df['api_calls'] + 1)",
          diff: {
            linesRemoved: ['df = df.copy()'],
            linesAdded: [
              "df = pd.get_dummies(df, columns=['plan_tier'], prefix='plan')",
              "df['days_since_signup'] = (pd.Timestamp.now() - df['signup_dt']).dt.days",
              "df['signup_quarter'] = df['signup_dt'].dt.to_period('Q').astype(str)",
              "df['revenue_per_call'] = df['annual_revenue_usd'] / (df['api_calls'] + 1)",
            ],
          },
        },
      },
    ],
  },
  {
    id: 'fe-a2',
    role: 'assistant',
    text:
      "Done. Added 4 plan_tier one-hots, 2 temporal features (`days_since_signup`, `signup_quarter`), and 1 ratio feature (`revenue_per_call`). The frame is now (2,500 × 38) — ready for training.",
  },
];
