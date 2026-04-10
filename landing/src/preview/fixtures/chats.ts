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

// ---------------------------------------------------------------------------
// Preprocessing tab — real leaf components.
//
// These turns feed the rebuilt <PreprocessingView>. Each assistant turn may
// include one or more tool calls paired by id with tool results. The chat log
// renders user/assistant bubbles directly and hands off the tool strip to the
// real frontend `<ToolIndicator>` so users see the exact tool-chrome they'd
// see inside the live app (icon, status tense, expandable dropdowns).
// ---------------------------------------------------------------------------

export interface PreprocessingChatTurn {
  id: string;
  role: 'user' | 'assistant';
  /** Optional assistant prose rendered as a bubble above the tool strip. */
  text?: string;
  /** Tool calls and their completed results. Rendered via <ToolIndicator>. */
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export const preprocessingChatTurns: PreprocessingChatTurn[] = [
  {
    id: 'u1',
    role: 'user',
    text: "The customers table has a few issues — some missing MRR, sketchy signup dates, a couple of API-call outliers blowing out p99. Can you fix them without dropping rows?",
  },
  {
    id: 'a1',
    role: 'assistant',
    text: "Let me profile the table first so I know exactly what we're dealing with, then I'll read the existing preprocessing cell before editing.",
    toolCalls: [
      {
        id: 'call_profile_1',
        tool: 'get_dataset_profile',
        args: { datasetId: 'customers' },
      },
      {
        id: 'call_read_1',
        tool: 'read_cell',
        args: { cellId: 'cell_preprocess_1' },
      },
    ],
    toolResults: [
      {
        id: 'call_profile_1',
        tool: 'get_dataset_profile',
        output: {
          datasetId: 'customers',
          filename: 'customers.csv',
          fileType: 'csv',
          nRows: 2530,
          nCols: 14,
          columns: [
            { name: 'customer_id',         dtype: 'int64',    nullCount: 0,   uniqueCount: 2530 },
            { name: 'mrr_usd',             dtype: 'float64',  nullCount: 147, uniqueCount: 1932, min: 0,   max: 24180,  mean: 2142.4 },
            { name: 'signup_dt',           dtype: 'object',   nullCount: 12,  uniqueCount: 2210 },
            { name: 'api_calls',           dtype: 'int64',    nullCount: 0,   uniqueCount: 2498, min: 0,   max: 892448, mean: 12004.7 },
            { name: 'avg_session_minutes', dtype: 'float64',  nullCount: 250, uniqueCount: 1871, min: 0.3, max: 84.1,   mean: 18.4 },
            { name: 'plan_tier',           dtype: 'category', nullCount: 0,   uniqueCount: 4 },
            { name: 'is_active',           dtype: 'bool',     nullCount: 0,   uniqueCount: 2 },
          ],
        },
      },
      {
        id: 'call_read_1',
        tool: 'read_cell',
        output: {
          cellId: 'cell_preprocess_1',
          title: 'Preprocessing — customers.csv',
          cellType: 'code',
          content:
            "import pandas as pd\n\ndf = pd.read_csv('customers.csv')\ndf.head()",
        },
      },
    ],
  },
  {
    id: 'a2',
    role: 'assistant',
    text: "Found it: 147 missing `mrr_usd` (5.8%), 12 unparsed `signup_dt` strings, and the top 0.5% of `api_calls` are sitting above 350k. I'll impute MRR with the column median, coerce dates with `pd.to_datetime(..., errors='coerce')`, and Winsorize `api_calls` at the 99.5th percentile. Editing the cell now.",
    toolCalls: [
      {
        id: 'call_edit_1',
        tool: 'edit_cell',
        args: {
          cellId: 'cell_preprocess_1',
          startLine: 4,
          endLine: 4,
          newContent:
            "df['mrr_usd'] = df['mrr_usd'].fillna(df['mrr_usd'].median())\ndf['signup_dt'] = pd.to_datetime(df['signup_dt'], errors='coerce')\ndf = df[df['api_calls'] < df['api_calls'].quantile(0.995)]",
        },
      },
    ],
    toolResults: [
      {
        id: 'call_edit_1',
        tool: 'edit_cell',
        output: {
          oldContent: "df.head()",
          newContent:
            "df['mrr_usd'] = df['mrr_usd'].fillna(df['mrr_usd'].median())\ndf['signup_dt'] = pd.to_datetime(df['signup_dt'], errors='coerce')\ndf = df[df['api_calls'] < df['api_calls'].quantile(0.995)]\ndf.head()",
          diff: {
            linesRemoved: ["df.head()"],
            linesAdded: [
              "df['mrr_usd'] = df['mrr_usd'].fillna(df['mrr_usd'].median())",
              "df['signup_dt'] = pd.to_datetime(df['signup_dt'], errors='coerce')",
              "df = df[df['api_calls'] < df['api_calls'].quantile(0.995)]",
              "df.head()",
            ],
          },
        },
      },
    ],
  },
  {
    id: 'a3',
    role: 'assistant',
    text: "Done. All 147 MRR nulls filled, dates parsed (zero coerced to NaT), and 13 outlier rows trimmed above the 99.5th percentile. The notebook cell on the right has the updated source and the new `df.head()` output — reversible via the savepoint I just wrote.",
  },
];

// ---------------------------------------------------------------------------
// Training tab — ToolIndicator-shaped chat turns.
//
// The rebuilt Training tab renders tool calls through the real frontend
// `<ToolIndicator>` leaf component, which expects `ToolCall` + `ToolResult`
// arrays conforming to `@frontend/types/llmUi`. The tool names here are
// picked from the `ToolNameSchema` z.enum so drift is caught at compile
// time. Mirrors the feature-engineering turns shape above.
// ---------------------------------------------------------------------------

export interface TrainingChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export const trainingChatMessages: TrainingChatTurn[] = [
  {
    id: 'tr-u1',
    role: 'user',
    text: 'Which model should we try first?',
  },
  {
    id: 'tr-a1',
    role: 'assistant',
    text: "Reading the feature-engineering notebook and comparing candidate templates for the configured experiment so I can recommend a starting point.",
    toolCalls: [
      {
        id: 'tcall_list',
        tool: 'list_cells',
        args: { phase: 'training' },
      },
      {
        id: 'tcall_read',
        tool: 'read_cell',
        args: { cellId: 'fe_code_3' },
      },
      {
        id: 'tcall_plan',
        tool: 'propose_training_plan',
        args: { taskType: 'classification', target: 'is_active' },
      },
    ],
    toolResults: [
      {
        id: 'tcall_list',
        tool: 'list_cells',
        output: { count: 8, cells: [{ id: 'fe_code_3', kind: 'code', title: 'Feature MI ranking' }] },
      },
      {
        id: 'tcall_read',
        tool: 'read_cell',
        output: {
          cellId: 'fe_code_3',
          content:
            "mi = mutual_info_classif(X, y)\ntop = pd.Series(mi, index=X.columns).sort_values(ascending=False)\ntop.head(10)",
        },
      },
      {
        id: 'tcall_plan',
        tool: 'propose_training_plan',
        output: {
          candidates: [
            { model: 'XGBoost', priority: 1, rationale: 'strong default for tabular classification' },
            { model: 'LightGBM', priority: 2, rationale: 'diversity vs xgboost at similar accuracy' },
            { model: 'RandomForest', priority: 3, rationale: 'bagged baseline' },
            { model: 'LogisticRegression', priority: 4, rationale: 'interpretable floor' },
          ],
        },
      },
    ],
  },
  {
    id: 'tr-a2',
    role: 'assistant',
    text:
      "Start with **XGBoost**. It's the strongest default for tabular classification with mixed feature types, handles the mild class imbalance in `is_active` natively via `scale_pos_weight`, and the top MI features (`recency_days`, `mrr_delta_30d`, `ticket_escalation_rate`) are exactly the kind of nonlinear interactions boosted trees exploit best. I'll follow up with LightGBM and RandomForest for model diversity, then pick the champion by held-out F1.",
  },
];
