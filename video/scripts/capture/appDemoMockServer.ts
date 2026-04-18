import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { URL } from "node:url";

import type { AppDemoPreset } from "../../config/appDemo";
import {
  getMockBusinessRetentionDataset,
  getMockBusinessRows,
  getMockBusinessRowsPage,
  listMockBusinessDatasets,
  listMockBusinessDocuments,
  type FixtureRow,
} from "./mockBusinessFixtures";

type JsonRecord = Record<string, unknown>;

type AppDemoMockServer = {
  origin: string;
  apiBaseUrl: string;
  close: () => Promise<void>;
  fixturePaths: readonly string[];
  projectId: string;
};

type PhaseSlug =
  | "upload"
  | "data-viewer"
  | "preprocessing"
  | "feature-engineering"
  | "training"
  | "experiments"
  | "deployment";

type ScenarioState = {
  beat: AppDemoPreset;
  projectId: string;
  frontendOrigin: string;
  project: JsonRecord;
  planChats: Map<string, JsonRecord>;
  uploadedDatasetIds: Set<string>;
  uploadedDocumentIds: Set<string>;
  availableDerivedDatasetIds: Set<string>;
  notebooks: JsonRecord[];
  cellsByNotebookId: Map<string, JsonRecord[]>;
  cellsById: Map<string, JsonRecord>;
  featureRun: JsonRecord;
  models: JsonRecord[];
  modelTemplates: JsonRecord[];
  evaluations: Record<string, JsonRecord>;
  shapByModelId: Record<string, JsonRecord>;
  errorAnalysisByModelId: Record<string, JsonRecord>;
  deployments: JsonRecord[];
  deploymentSchemaById: Record<string, JsonRecord>;
  deploymentLogsById: Record<string, JsonRecord[]>;
  deploymentStatsById: Record<string, JsonRecord[]>;
  deploymentApiKeysById: Record<string, JsonRecord[]>;
};

const PROJECT_ID = "novacraft-growth";
const USER_ID = "ayush-yadav-001";
const NOW = "2026-04-16T12:00:00.000Z";
const ALL_PHASES: readonly PhaseSlug[] = [
  "upload",
  "data-viewer",
  "preprocessing",
  "feature-engineering",
  "training",
  "experiments",
  "deployment",
];
const PHASE_SLUG_BY_BEAT: Record<AppDemoPreset, PhaseSlug> = {
  ingest: "upload",
  explore: "data-viewer",
  preprocess: "preprocessing",
  engineer: "feature-engineering",
  train: "training",
  experiments: "experiments",
  deploy: "deployment",
};
const CURRENT_USER = {
  user_id: USER_ID,
  email: "yadava5@miamioh.edu",
  name: "Ayush",
  role: "user",
  email_verified: true,
  created_at: NOW,
  updated_at: NOW,
  last_login_at: NOW,
};

const DATASETS = listMockBusinessDatasets();
const DOCUMENTS = listMockBusinessDocuments();
const RETENTION_DATASET = getMockBusinessRetentionDataset();
const DATASET_BY_FILENAME = new Map(
  DATASETS.map((dataset) => [dataset.filename.toLowerCase(), dataset] as const),
);
const DOCUMENT_BY_FILENAME = new Map(
  DOCUMENTS.map((document) => [document.filename.toLowerCase(), document] as const),
);
const CUSTOMERS_DATASET = mustDataset("customers");
const SUBSCRIPTIONS_DATASET = mustDataset("subscriptions");
const SUPPORT_DATASET = mustDataset("support_tickets");
const USAGE_DATASET = mustDataset("usage_metrics");
const FEATURE_COLUMNS = [
  "annual_revenue_usd",
  "employee_count",
  "current_mrr_usd",
  "support_ticket_velocity",
  "expansion_ratio",
  "campaign_efficiency_gap",
  "feature_adoption_pct",
  "latest_nps_response",
] as const;
const FEATURE_TYPES = {
  annual_revenue_usd: "float",
  employee_count: "int",
  current_mrr_usd: "float",
  support_ticket_velocity: "float",
  expansion_ratio: "float",
  campaign_efficiency_gap: "float",
  feature_adoption_pct: "float",
  latest_nps_response: "float",
} as const;
const FEATURE_SAMPLE_REQUEST = {
  annual_revenue_usd: 850000,
  employee_count: 280,
  current_mrr_usd: 24300,
  support_ticket_velocity: 3.2,
  expansion_ratio: 0.81,
  campaign_efficiency_gap: -4.6,
  feature_adoption_pct: 27.4,
  latest_nps_response: 4,
} as const;
const FEATURE_IMPORTANCE = [
  { name: "support_ticket_velocity", importance: 0.188, std: 0.014 },
  { name: "expansion_ratio", importance: 0.163, std: 0.012 },
  { name: "campaign_efficiency_gap", importance: 0.121, std: 0.01 },
  { name: "feature_adoption_pct", importance: 0.109, std: 0.009 },
  { name: "current_mrr_usd", importance: 0.097, std: 0.008 },
  { name: "latest_nps_response", importance: 0.089, std: 0.007 },
] as const;

const PLAN_MARKDOWN = buildPlanMarkdown();

const HIGH_RISK_SQL = [
  "WITH latest_subscriptions AS (",
  "  SELECT DISTINCT ON (customer_id)",
  "    customer_id,",
  "    mrr_usd,",
  "    billing_cycle,",
  "    seats_purchased,",
  "    auto_renew,",
  "    cancellation_reason",
  "  FROM subscriptions",
  "  ORDER BY customer_id, start_date DESC",
  "),",
  "usage_rollup AS (",
  "  SELECT",
  "    customer_id,",
  "    COUNT(*) AS active_months,",
  "    AVG(feature_adoption_pct) AS feature_adoption_pct,",
  "    AVG(nps_response) AS latest_nps_response",
  "  FROM usage_metrics",
  "  GROUP BY customer_id",
  "),",
  "support_rollup AS (",
  "  SELECT",
  "    customer_id,",
  "    COUNT(*) AS support_tickets,",
  "    AVG(satisfaction_score) AS avg_satisfaction",
  "  FROM support_tickets",
  "  GROUP BY customer_id",
  "),",
  "marketing_rollup AS (",
  "  SELECT",
  "    LOWER(COALESCE(NULLIF(target_industry, 'All'), 'all')) AS industry_key,",
  "    ROUND(100.0 * SUM(conversions)::numeric / NULLIF(SUM(leads_generated), 0), 3) AS industry_campaign_conversion_pct",
  "  FROM marketing_campaigns",
  "  GROUP BY 1",
  "),",
  "risk_rollup AS (",
  "  SELECT",
  "    c.customer_id,",
  "    ROUND(COALESCE(support_rollup.support_tickets, 0)::numeric / GREATEST(COALESCE(usage_rollup.active_months, 1), 1), 3) AS support_ticket_velocity,",
  "    ROUND((COALESCE(usage_rollup.feature_adoption_pct, 0) / 100.0) * LN(COALESCE(latest_subscriptions.mrr_usd, 0) + 1), 3) AS expansion_ratio,",
  "    ROUND(COALESCE(marketing_rollup.industry_campaign_conversion_pct, 27.455) - 27.455, 3) AS campaign_efficiency_gap,",
  "    ROUND(",
  "      (COALESCE(support_rollup.support_tickets, 0)::numeric / GREATEST(COALESCE(usage_rollup.active_months, 1), 1)) * 0.34 +",
  "      GREATEST(0, 45 - COALESCE(usage_rollup.feature_adoption_pct, 0)) * 0.018 +",
  "      GREATEST(0, 7 - COALESCE(usage_rollup.latest_nps_response, 3.5)) * 0.11 +",
  "      CASE WHEN latest_subscriptions.auto_renew = false THEN 0.38 ELSE 0 END +",
  "      CASE WHEN latest_subscriptions.cancellation_reason IS NOT NULL THEN 0.16 ELSE 0 END +",
  "      CASE WHEN COALESCE(marketing_rollup.industry_campaign_conversion_pct, 27.455) < 27.455 THEN ABS(COALESCE(marketing_rollup.industry_campaign_conversion_pct, 27.455) - 27.455) * 0.05 ELSE 0 END",
  "    , 3) AS risk_score",
  "  FROM customers c",
  "  LEFT JOIN latest_subscriptions ON latest_subscriptions.customer_id = c.customer_id",
  "  LEFT JOIN usage_rollup ON usage_rollup.customer_id = c.customer_id",
  "  LEFT JOIN support_rollup ON support_rollup.customer_id = c.customer_id",
  "  LEFT JOIN marketing_rollup ON marketing_rollup.industry_key = LOWER(c.industry)",
  ")",
  "SELECT",
  "  c.customer_id,",
  "  c.company_name,",
  "  c.industry,",
  "  c.plan_tier,",
  "  latest_sub.mrr_usd AS current_mrr_usd,",
  "  usage_rollup.feature_adoption_pct,",
  "  support_rollup.support_tickets,",
  "  support_rollup.avg_satisfaction,",
  "  usage_rollup.latest_nps_response,",
  "  risk_rollup.campaign_efficiency_gap,",
  "  risk_rollup.risk_score",
  "FROM customers c",
  "LEFT JOIN latest_subscriptions latest_sub ON latest_sub.customer_id = c.customer_id",
  "LEFT JOIN usage_rollup ON usage_rollup.customer_id = c.customer_id",
  "LEFT JOIN support_rollup ON support_rollup.customer_id = c.customer_id",
  "LEFT JOIN risk_rollup ON risk_rollup.customer_id = c.customer_id",
  "ORDER BY risk_rollup.risk_score DESC",
  "LIMIT 12;",
].join("\n");

const HIGH_RISK_ROWS = buildHighRiskRows();
const HIGH_RISK_QUERY = {
  queryId: "query-high-risk-customers",
  sql: HIGH_RISK_SQL,
  columns: [
    { name: "customer_id", dataType: "text", dataTypeID: 25 },
    { name: "company_name", dataType: "text", dataTypeID: 25 },
    { name: "industry", dataType: "text", dataTypeID: 25 },
    { name: "plan_tier", dataType: "text", dataTypeID: 25 },
    { name: "current_mrr_usd", dataType: "float8", dataTypeID: 701 },
    { name: "feature_adoption_pct", dataType: "float8", dataTypeID: 701 },
    { name: "support_tickets", dataType: "int4", dataTypeID: 23 },
    { name: "avg_satisfaction", dataType: "float8", dataTypeID: 701 },
    { name: "latest_nps_response", dataType: "float8", dataTypeID: 701 },
    { name: "campaign_efficiency_gap", dataType: "float8", dataTypeID: 701 },
    { name: "risk_score", dataType: "float8", dataTypeID: 701 },
  ],
  rows: HIGH_RISK_ROWS,
  rowCount: HIGH_RISK_ROWS.length,
  executionMs: 62,
  cached: false,
};

const MODEL_TEMPLATES = [
  {
    id: "tpl-xgb",
    name: "XGBoost",
    taskType: "classification",
    description: "Gradient boosted trees tuned for churn ranking.",
    library: "xgboost",
    importPath: "xgboost",
    modelClass: "XGBClassifier",
    parameters: [
      { key: "n_estimators", label: "Rounds", type: "number", default: 320, min: 50, max: 1200, step: 10 },
      { key: "learning_rate", label: "Learning rate", type: "number", default: 0.08, min: 0.01, max: 0.3, step: 0.01 },
      { key: "max_depth", label: "Max depth", type: "number", default: 6, min: 2, max: 12, step: 1 },
    ],
    defaultParams: { n_estimators: 320, learning_rate: 0.08, max_depth: 6 },
    metrics: ["accuracy", "f1", "precision", "recall", "roc_auc"],
  },
  {
    id: "tpl-novaforest",
    name: "NovaForest",
    taskType: "classification",
    description: "Random-forest style ensemble tuned for explainability and recall.",
    library: "scikit-learn",
    importPath: "sklearn.ensemble",
    modelClass: "RandomForestClassifier",
    parameters: [
      { key: "n_estimators", label: "Trees", type: "number", default: 400, min: 50, max: 1200, step: 10 },
      { key: "max_depth", label: "Max depth", type: "number", default: 12, min: 2, max: 24, step: 1 },
      { key: "min_samples_leaf", label: "Min leaf", type: "number", default: 4, min: 1, max: 12, step: 1 },
    ],
    defaultParams: { n_estimators: 400, max_depth: 12, min_samples_leaf: 4 },
    metrics: ["accuracy", "f1", "precision", "recall", "roc_auc"],
  },
];

const MODELS = [
  {
    modelId: "model-novaforest",
    projectId: PROJECT_ID,
    datasetId: RETENTION_DATASET.datasetId,
    name: "NovaForest Churn Champion",
    templateId: "tpl-novaforest",
    taskType: "classification",
    library: "scikit-learn",
    algorithm: "RandomForestClassifier",
    parameters: { n_estimators: 400, max_depth: 12, min_samples_leaf: 4 },
    metrics: { accuracy: 0.9142, f1: 0.8424, precision: 0.8611, recall: 0.8245, roc_auc: 0.9411 },
    status: "completed",
    createdAt: NOW,
    updatedAt: NOW,
    trainingMs: 11820,
    targetColumn: "is_active",
    sampleCount: RETENTION_DATASET.rows,
    featureColumns: [...FEATURE_COLUMNS],
    evaluationStatus: "ready",
    artifact: {
      filename: "novaforest-churn-champion.pkl",
      path: "/artifacts/novaforest-churn-champion.pkl",
      size: 2345678,
    },
    featureTypes: FEATURE_TYPES,
    sampleRequest: FEATURE_SAMPLE_REQUEST,
  },
  {
    modelId: "model-xgboost",
    projectId: PROJECT_ID,
    datasetId: RETENTION_DATASET.datasetId,
    name: "XGBoost Backup",
    templateId: "tpl-xgb",
    taskType: "classification",
    library: "xgboost",
    algorithm: "XGBClassifier",
    parameters: { n_estimators: 320, learning_rate: 0.08, max_depth: 6 },
    metrics: { accuracy: 0.9073, f1: 0.8324, precision: 0.8541, recall: 0.8119, roc_auc: 0.9365 },
    status: "completed",
    createdAt: NOW,
    updatedAt: NOW,
    trainingMs: 9640,
    targetColumn: "is_active",
    sampleCount: RETENTION_DATASET.rows,
    featureColumns: [...FEATURE_COLUMNS],
    evaluationStatus: "ready",
    artifact: {
      filename: "xgboost-backup.pkl",
      path: "/artifacts/xgboost-backup.pkl",
      size: 1890432,
    },
  },
];

const EVALUATION = {
  taskType: "classification",
  timestamp: NOW,
  computeMs: 2140,
  confusion_matrix: {
    matrix: [
      [412, 28],
      [39, 109],
    ],
    matrix_normalized: [
      [0.936, 0.064],
      [0.264, 0.736],
    ],
    labels: ["Active", "Churned"],
  },
  roc_curves: {
    churned: {
      fpr: [0, 0.03, 0.08, 0.17, 0.31, 1],
      tpr: [0, 0.42, 0.66, 0.82, 0.91, 1],
      auc: 0.9411,
    },
  },
  precision_recall_curves: {
    churned: {
      precision: [1, 0.94, 0.9, 0.86, 0.8, 0.66],
      recall: [0, 0.28, 0.51, 0.68, 0.82, 1],
      ap: 0.887,
    },
  },
  calibration_curve: {
    prob_true: [0.04, 0.11, 0.21, 0.39, 0.63, 0.87],
    prob_pred: [0.05, 0.13, 0.22, 0.37, 0.61, 0.84],
    n_bins: 6,
  },
  learning_curve: {
    train_sizes: [300, 600, 900, 1200, 1600],
    train_scores_mean: [0.98, 0.96, 0.94, 0.93, 0.92],
    train_scores_std: [0.01, 0.01, 0.01, 0.008, 0.008],
    test_scores_mean: [0.75, 0.8, 0.82, 0.835, 0.842],
    test_scores_std: [0.03, 0.02, 0.015, 0.012, 0.01],
  },
  cross_validation: {
    scores: [0.836, 0.844, 0.848, 0.839, 0.845],
    mean: 0.8424,
    std: 0.0043,
    scoring: "f1",
  },
  feature_importance: {
    permutation: {
      features: FEATURE_IMPORTANCE.map((feature) => feature.name),
      importances_mean: FEATURE_IMPORTANCE.map((feature) => feature.importance),
      importances_std: FEATURE_IMPORTANCE.map((feature) => feature.std),
    },
  },
};

const SHAP = {
  values: [
    [0.24, -0.17, -0.09, 0.11, -0.08, 0.05],
    [0.21, -0.14, -0.07, 0.09, -0.06, 0.04],
    [0.18, -0.12, -0.05, 0.08, -0.04, 0.03],
  ],
  base_values: 0.41,
  data: [
    [3.2, 0.81, -4.6, 27.4, 4, 850000],
    [2.4, 0.88, -2.9, 35.1, 6, 610000],
    [1.9, 0.93, -1.2, 42.7, 7, 490000],
  ],
  feature_names: [
    "support_ticket_velocity",
    "expansion_ratio",
    "campaign_efficiency_gap",
    "feature_adoption_pct",
    "latest_nps_response",
    "annual_revenue_usd",
  ],
  mean_abs_values: [0.19, 0.16, 0.12, 0.11, 0.08, 0.07],
};

const ERROR_ANALYSIS = {
  available: true,
  error_tree: {
    node_id: 1,
    feature: "feature_adoption_pct",
    threshold: 31.5,
    error_rate: 0.18,
    sample_count: 148,
    error_count: 27,
  },
  misclassifications: [
    {
      index: 14,
      y_true: "Churned",
      y_pred: "Active",
      confidence: 0.71,
      top_shap_contributors: [
        { feature: "support_ticket_velocity", value: 0.22 },
        { feature: "expansion_ratio", value: -0.17 },
        { feature: "campaign_efficiency_gap", value: -0.09 },
      ],
    },
  ],
};

const DEPLOYMENT = {
  deploymentId: "dep-churn-champion",
  modelId: "model-novaforest",
  projectId: PROJECT_ID,
  name: "churn-champion",
  status: "healthy",
  endpointUrl: "https://api.agentic.dev/v1/deployments/churn-champion",
  config: {
    environment: "production",
    autoscaling: true,
    explain: true,
  },
  createdAt: NOW,
  updatedAt: NOW,
};

const DEPLOYMENT_SCHEMA = {
  featureColumns: [...FEATURE_COLUMNS],
  featureTypes: FEATURE_TYPES,
  sampleRequest: FEATURE_SAMPLE_REQUEST,
  taskType: "classification",
  targetColumn: "is_active",
  featureImportance: FEATURE_IMPORTANCE,
  classLabels: ["Active", "Churned"],
  metrics: { accuracy: 0.9142, f1: 0.8424, precision: 0.8611, recall: 0.8245, roc_auc: 0.9411 },
  featureRanges: {
    annual_revenue_usd: { min: 0, max: 2500000, q25: 140000, q50: 420000, q75: 910000 },
    employee_count: { min: 1, max: 9200, q25: 23, q50: 110, q75: 460 },
    current_mrr_usd: { min: 0, max: 42000, q25: 180, q50: 640, q75: 4200 },
    support_ticket_velocity: { min: 0, max: 11.2, q25: 0.4, q50: 1.2, q75: 2.9 },
    expansion_ratio: { min: 0.2, max: 1.4, q25: 0.72, q50: 0.89, q75: 1.02 },
    campaign_efficiency_gap: { min: -12.4, max: 9.1, q25: -2.9, q50: 0.1, q75: 2.4 },
    feature_adoption_pct: { min: 0, max: 100, q25: 22.3, q50: 39.4, q75: 61.8 },
    latest_nps_response: { min: 0, max: 10, q25: 4, q50: 6, q75: 8 },
  },
  categoricalValues: {},
  predictionDistribution: {
    bins: [0, 0.2, 0.4, 0.6, 0.8, 1],
    counts: [112, 184, 143, 92, 57],
  },
  readiness: {
    cvStable: true,
    cvScore: 0.8424,
    cvStd: 0.0043,
    overfitRisk: "low",
    trainTestGap: 0.018,
    featureImportanceStable: true,
    sampleCount: RETENTION_DATASET.rows,
    evaluationComplete: true,
  },
};

const DEPLOYMENT_LOGS = [
  {
    id: 201,
    deploymentId: DEPLOYMENT.deploymentId,
    modelId: DEPLOYMENT.modelId,
    projectId: PROJECT_ID,
    createdAt: NOW,
    latencyMs: 82,
    inputFeatures: DEPLOYMENT_SCHEMA.sampleRequest,
    prediction: {
      prediction: "Churned",
      probabilities: { Active: 0.18, Churned: 0.82 },
    },
    status: "success",
    metadata: {},
  },
];

const DEPLOYMENT_STATS = [
  { deploymentId: DEPLOYMENT.deploymentId, hourBucket: "2026-04-16T08:00:00.000Z", requestCount: 18, errorCount: 0, latencyP50: 71, latencyP95: 103, latencyP99: 118, latencyAvg: 76 },
  { deploymentId: DEPLOYMENT.deploymentId, hourBucket: "2026-04-16T09:00:00.000Z", requestCount: 24, errorCount: 1, latencyP50: 69, latencyP95: 101, latencyP99: 119, latencyAvg: 74 },
  { deploymentId: DEPLOYMENT.deploymentId, hourBucket: "2026-04-16T10:00:00.000Z", requestCount: 29, errorCount: 0, latencyP50: 73, latencyP95: 105, latencyP99: 122, latencyAvg: 78 },
];

const DEPLOYMENT_API_KEYS = [
  {
    keyId: "key-live-1",
    deploymentId: DEPLOYMENT.deploymentId,
    name: "Demo SDK Key",
    keyPrefix: "agm_live_4f7a",
    createdAt: NOW,
    lastUsedAt: NOW,
  },
];

const FEATURE_VERSION = {
  id: "fp-draft-1",
  projectId: PROJECT_ID,
  name: "Retention Matrix Draft",
  status: "draft",
  createdAt: NOW,
  readinessReport: {
    dataSummary: {
      addedColumns: [
        "support_ticket_velocity",
        "expansion_ratio",
        "campaign_efficiency_gap",
      ],
      removedColumns: [],
      renamedColumns: [],
      typeChanges: [],
      nullDeltas: [],
      warnings: [],
    },
    steps: [
      {
        id: "feat-step-1",
        name: "Aggregate support load",
        rationale: "Track support pressure by customer over time.",
        columns: ["support_ticket_velocity"],
      },
      {
        id: "feat-step-2",
        name: "Blend spend and adoption",
        rationale: "Capture expansion headroom with revenue and feature usage.",
        columns: ["expansion_ratio"],
      },
      {
        id: "feat-step-3",
        name: "Score industry campaign fit",
        rationale:
          "Inject acquisition-context pressure from the campaign table into the retention matrix.",
        columns: ["campaign_efficiency_gap"],
      },
    ],
  },
  notebookId: "nb-fe-1",
};

const FEATURES = [
  {
    id: "feat-support-ticket-velocity",
    projectId: PROJECT_ID,
    versionId: FEATURE_VERSION.id,
    sourceColumn: "support_tickets",
    featureName: "support_ticket_velocity",
    description: "Support tickets per active billing month.",
    method: "ratio",
    category: "aggregation",
    params: { secondaryColumn: "active_months" },
    enabled: true,
    createdAt: NOW,
    code: "df['support_ticket_velocity'] = df['support_tickets'] / df['active_months'].clip(lower=1)",
  },
  {
    id: "feat-expansion-ratio",
    projectId: PROJECT_ID,
    versionId: FEATURE_VERSION.id,
    sourceColumn: "feature_adoption_pct",
    secondaryColumn: "current_mrr_usd",
    featureName: "expansion_ratio",
    description: "Normalized blend of adoption and recurring revenue.",
    method: "product",
    category: "interaction",
    params: { secondaryColumn: "current_mrr_usd" },
    enabled: true,
    createdAt: NOW,
    code: "df['expansion_ratio'] = (df['feature_adoption_pct'] / 100.0) * np.log1p(df['current_mrr_usd'])",
  },
  {
    id: "feat-campaign-efficiency-gap",
    projectId: PROJECT_ID,
    versionId: FEATURE_VERSION.id,
    sourceColumn: "industry_campaign_conversion_pct",
    secondaryColumn: "campaign_baseline_pct",
    featureName: "campaign_efficiency_gap",
    description: "Industry campaign conversion gap versus the overall NovaCraft acquisition baseline.",
    method: "difference",
    category: "external-signal",
    params: { secondaryColumn: "campaign_baseline_pct" },
    enabled: true,
    createdAt: NOW,
    code: "df['campaign_efficiency_gap'] = df['industry_campaign_conversion_pct'] - campaign_baseline_pct",
  },
];

const FEATURE_RUN = {
  runId: "feature-run-1",
  projectId: PROJECT_ID,
  features: {
    "feat-support-ticket-velocity": {
      featureId: "feat-support-ticket-velocity",
      name: "Support Ticket Velocity",
      method: "ratio",
      status: "registered",
      code: FEATURES[0]?.code,
      validation: { correlationWithTarget: 0.34, distributionNotes: "Stronger signal in enterprise accounts." },
      createdAt: NOW,
      updatedAt: NOW,
    },
    "feat-expansion-ratio": {
      featureId: "feat-expansion-ratio",
      name: "Expansion Ratio",
      method: "product",
      status: "registered",
      code: FEATURES[1]?.code,
      validation: { correlationWithTarget: -0.28, distributionNotes: "Downside skew among low-adoption accounts." },
      createdAt: NOW,
      updatedAt: NOW,
    },
    "feat-campaign-efficiency-gap": {
      featureId: "feat-campaign-efficiency-gap",
      name: "Campaign Efficiency Gap",
      method: "difference",
      status: "registered",
      code: FEATURES[2]?.code,
      validation: {
        correlationWithTarget: -0.19,
        distributionNotes:
          "Negative industry campaign fit compounds churn risk in weaker acquisition segments.",
      },
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
  createdAt: NOW,
  updatedAt: NOW,
};

export async function startAppDemoMockServer({
  beat,
  port,
  frontendOrigin,
}: {
  beat: AppDemoPreset;
  port: number;
  frontendOrigin: string;
}): Promise<AppDemoMockServer> {
  const state = createScenarioState(beat, frontendOrigin);
  const server = createServer((request, response) => {
    void handleRequest(request, response, state);
  });

  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("App demo mock server failed to resolve a TCP port.");
  }
  const assignedPort = address.port;

  return {
    origin: `http://127.0.0.1:${assignedPort}`,
    apiBaseUrl: `http://127.0.0.1:${assignedPort}/api`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
    fixturePaths: [...DATASETS.map((dataset) => dataset.filePath), ...DOCUMENTS.map((document) => document.filePath)],
    projectId: PROJECT_ID,
  };
}

function createScenarioState(beat: AppDemoPreset, frontendOrigin: string): ScenarioState {
  const phase = PHASE_SLUG_BY_BEAT[beat];
  if (!phase) {
    throw new Error(`Unknown app demo beat "${beat}"`);
  }
  const datasetIds =
    beat === "ingest" ? new Set<string>() : new Set(DATASETS.map((dataset) => dataset.datasetId));
  const documentIds =
    beat === "ingest" ? new Set<string>() : new Set(DOCUMENTS.map((document) => document.documentId));
  const availableDerivedDatasetIds = isPhaseAtOrAfter(phase, "training")
    ? new Set<string>([RETENTION_DATASET.datasetId])
    : new Set<string>();
  const notebooks = buildPhaseNotebooks();
  const cellsByNotebookId = new Map<string, JsonRecord[]>();
  const cellsById = new Map<string, JsonRecord>();

  for (const [notebookId, cells] of Object.entries(buildPhaseNotebookCells())) {
    cellsByNotebookId.set(notebookId, cells);
    for (const cell of cells) {
      cellsById.set(String(cell.cellId), cell);
    }
  }

  return {
    beat,
    frontendOrigin,
    projectId: PROJECT_ID,
    project: buildProject(phase),
    planChats: new Map<string, JsonRecord>(),
    uploadedDatasetIds: datasetIds,
    uploadedDocumentIds: documentIds,
    availableDerivedDatasetIds,
    notebooks,
    cellsByNotebookId,
    cellsById,
    featureRun: FEATURE_RUN,
    models: MODELS,
    modelTemplates: MODEL_TEMPLATES,
    evaluations: Object.fromEntries(MODELS.map((model) => [String(model.modelId), EVALUATION])),
    shapByModelId: Object.fromEntries(MODELS.map((model) => [String(model.modelId), SHAP])),
    errorAnalysisByModelId: Object.fromEntries(MODELS.map((model) => [String(model.modelId), ERROR_ANALYSIS])),
    deployments: [DEPLOYMENT],
    deploymentSchemaById: { [String(DEPLOYMENT.deploymentId)]: DEPLOYMENT_SCHEMA },
    deploymentLogsById: { [String(DEPLOYMENT.deploymentId)]: DEPLOYMENT_LOGS },
    deploymentStatsById: { [String(DEPLOYMENT.deploymentId)]: DEPLOYMENT_STATS },
    deploymentApiKeysById: { [String(DEPLOYMENT.deploymentId)]: DEPLOYMENT_API_KEYS },
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: ScenarioState,
): Promise<void> {
  applyCors(response, state.frontendOrigin);
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (!request.url) {
    sendJson(response, 400, { error: "Missing request URL" });
    return;
  }

  const url = new URL(request.url, "http://127.0.0.1");
  const pathname = url.pathname;
  const method = request.method ?? "GET";

  try {
    if (method === "GET" && pathname === "/api/auth/me") {
      sendJson(response, 200, { user: CURRENT_USER });
      return;
    }
    if (method === "POST" && pathname === "/api/auth/refresh") {
      sendJson(response, 200, { accessToken: "mock-access-token", refreshToken: "mock-refresh-token" });
      return;
    }
    if (method === "GET" && pathname === "/api/llm/models") {
      sendJson(response, 200, {
        defaultModel: "gpt-5.4",
        defaultReasoningEffort: "high",
        models: [
          {
            id: "gpt-5.4",
            label: "GPT 5.4",
            kind: "base",
            description: "Strongest model for complex planning, tool orchestration, and high-stakes work.",
            featured: true,
            reasoningEfforts: ["low", "medium", "high", "xhigh"],
            defaultReasoningEffort: "high",
          },
        ],
      });
      return;
    }
    if (method === "GET" && pathname === "/api/projects") {
      sendJson(response, 200, { projects: [state.project] });
      return;
    }
    if (method === "PATCH" && pathname === `/api/projects/${state.projectId}`) {
      const patch = (await readJsonBody(request)) as JsonRecord;
      const nextMetadata = mergeRecords(
        (state.project.metadata as JsonRecord | undefined) ?? {},
        (patch.metadata as JsonRecord | undefined) ?? {},
      );
      state.project = {
        ...state.project,
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.description ? { description: patch.description } : {}),
        ...(patch.icon ? { icon: patch.icon } : {}),
        ...(patch.color ? { color: patch.color } : {}),
        metadata: nextMetadata,
        updatedAt: NOW,
      };
      sendJson(response, 200, { project: state.project });
      return;
    }
    if (method === "POST" && pathname === "/api/upload/dataset") {
      const multipart = await readMultipartHints(request);
      const dataset = DATASET_BY_FILENAME.get(multipart.filename.toLowerCase());
      if (!dataset) {
        sendJson(response, 404, { error: `Unknown dataset fixture ${multipart.filename}` });
        return;
      }
      state.uploadedDatasetIds.add(dataset.datasetId);
      sendJson(response, 200, {
        dataset: {
          datasetId: dataset.datasetId,
          projectId: state.projectId,
          filename: dataset.filename,
          fileType: "csv",
          size: dataset.byteSize,
          n_rows: dataset.rows,
          n_cols: dataset.cols,
          columns: dataset.columns,
          dtypes: dataset.dtypes,
          null_counts: dataset.nullCounts,
          sample: dataset.sampleRows,
          createdAt: NOW,
          updatedAt: NOW,
          tableName: dataset.tableName,
          physicalTableName: `${dataset.tableName}_${dataset.datasetId}`,
          queryable: true,
        },
      });
      return;
    }
    if (method === "POST" && pathname === "/api/upload/doc") {
      const multipart = await readMultipartHints(request);
      const document = DOCUMENT_BY_FILENAME.get(multipart.filename.toLowerCase());
      if (!document) {
        sendJson(response, 404, { error: `Unknown document fixture ${multipart.filename}` });
        return;
      }
      state.uploadedDocumentIds.add(document.documentId);
      sendJson(response, 200, {
        document: {
          documentId: document.documentId,
          projectId: state.projectId,
          filename: document.filename,
          mimeType: document.mimeType,
          chunkCount: 24,
          embeddingDimension: 3072,
          parseWarning: null,
        },
      });
      return;
    }
    if (method === "GET" && pathname === "/api/datasets") {
      sendJson(response, 200, { datasets: visibleDatasets(state) });
      return;
    }
    if (method === "GET" && pathname === "/api/documents") {
      sendJson(response, 200, { documents: visibleDocuments(state) });
      return;
    }
    if (method === "GET" && /^\/api\/datasets\/[^/]+\/sample$/.test(pathname)) {
      const datasetId = pathname.split("/")[3] ?? "";
      const dataset = resolveDatasetForState(state, datasetId);
      if (!dataset) {
        sendJson(response, 404, { error: "Unknown dataset" });
        return;
      }
      sendJson(response, 200, {
        sample: dataset.sampleRows,
        columns: dataset.columns,
        rowCount: dataset.rows,
      });
      return;
    }
    if (method === "GET" && /^\/api\/datasets\/[^/]+\/rows$/.test(pathname)) {
      const datasetId = pathname.split("/")[3] ?? "";
      const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
      const limit = Number.parseInt(url.searchParams.get("limit") ?? "25", 10);
      const page = Math.floor(offset / Math.max(limit, 1)) + 1;
      const result = getMockBusinessRowsPage(datasetId, { page, pageSize: limit });
      sendJson(response, 200, {
        rows: result.rows,
        columns: resolveDatasetForState(state, datasetId)?.columns ?? [],
        rowCount: result.totalRows,
        offset,
        limit,
      });
      return;
    }
    if (method === "GET" && pathname === `/api/projects/${state.projectId}/plan-chats`) {
      const summaries = [...state.planChats.values()].map(toPlanChatSummary);
      sendJson(response, 200, summaries);
      return;
    }
    if (method === "POST" && pathname === `/api/projects/${state.projectId}/plan-chats`) {
      const body = (await readJsonBody(request)) as JsonRecord;
      const chatId = `chat-${Date.now()}`;
      const chat = {
        chatId,
        projectId: state.projectId,
        userId: USER_ID,
        name: String(body.name ?? "Plan 1"),
        status: "in_progress",
        messages: [],
        answerHistory: [],
        currentRound: 0,
        completedPlanId: null,
        createdAt: NOW,
        updatedAt: NOW,
      };
      state.planChats.set(chatId, chat);
      sendJson(response, 200, chat);
      return;
    }
    if (method === "GET" && /^\/api\/projects\/[^/]+\/plan-chats\/[^/]+$/.test(pathname)) {
      const chatId = pathname.split("/").at(-1) ?? "";
      const chat = state.planChats.get(chatId);
      if (!chat) {
        sendJson(response, 404, { error: "Unknown plan chat" });
        return;
      }
      sendJson(response, 200, chat);
      return;
    }
    if (method === "PUT" && /^\/api\/projects\/[^/]+\/plan-chats\/[^/]+\/state$/.test(pathname)) {
      const chatId = pathname.split("/").at(-2) ?? "";
      const chat = state.planChats.get(chatId);
      if (!chat) {
        sendJson(response, 404, { error: "Unknown plan chat" });
        return;
      }
      const patch = (await readJsonBody(request)) as JsonRecord;
      const next = {
        ...chat,
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.messages ? { messages: patch.messages } : {}),
        ...(patch.answerHistory ? { answerHistory: patch.answerHistory } : {}),
        ...(typeof patch.currentRound === "number" ? { currentRound: patch.currentRound } : {}),
        updatedAt: NOW,
      };
      state.planChats.set(chatId, next);
      sendJson(response, 200, next);
      return;
    }
    if (method === "POST" && /^\/api\/projects\/[^/]+\/plan-chats\/[^/]+\/complete$/.test(pathname)) {
      const chatId = pathname.split("/").at(-2) ?? "";
      const chat = state.planChats.get(chatId);
      if (!chat) {
        sendJson(response, 404, { error: "Unknown plan chat" });
        return;
      }
      const body = (await readJsonBody(request)) as JsonRecord;
      const next = {
        ...chat,
        name: String(body.name ?? chat.name),
        status: "completed",
        completedPlanId: String(body.completedPlanId ?? ""),
        updatedAt: NOW,
      };
      state.planChats.set(chatId, next);
      sendJson(response, 200, next);
      return;
    }
    if (method === "GET" && pathname === "/api/query/nl/suggestions") {
      sendJson(response, 200, {
        suggestions: [
          {
            id: "suggestion-high-risk",
            prompt:
              "Show the highest-risk NovaCraft customers using billing, adoption, support pressure, and campaign-fit signals.",
            label: "High-risk customers",
            category: "retention",
            tables: [
              "customers",
              "subscriptions",
              "usage_metrics",
              "support_tickets",
              "marketing_campaigns",
            ],
            rationale:
              "Cross-table retention cut grounded in the full uploaded fixture family plus business context.",
          },
          {
            id: "suggestion-adoption",
            prompt:
              "Which accounts have low adoption, weak campaign fit, and meaningful recurring revenue worth saving?",
            label: "Saveable accounts",
            category: "expansion",
            tables: [
              "customers",
              "subscriptions",
              "usage_metrics",
              "marketing_campaigns",
            ],
            rationale:
              "Surfaces accounts worth saving before churn spreads into weaker acquisition segments.",
          },
        ],
        cached: false,
        schemaFingerprint: "mock-business-v1",
        workflowPlaceholders: {
          preprocessing: [
            "Repair sparse usage signals, normalize latest subscription state, and validate join coverage.",
          ],
          featureEngineering: [
            "Assemble the retention matrix and derive support_ticket_velocity, expansion_ratio, and campaign_efficiency_gap.",
          ],
          training: [
            "Train XGBoost and NovaForest on the joined retention matrix, then pick the explainable champion.",
          ],
          explore: [HIGH_RISK_SQL],
        },
      });
      return;
    }
    if (method === "POST" && pathname === "/api/query/nl/stream") {
      const body = (await readJsonBody(request)) as JsonRecord;
      await streamNdjson(response, [
        phaseEvent("phase_started", "planning", "Interpreting the request"),
        modelWorkStart("query-plan", "planning", "plan", "Query plan"),
        modelWorkDelta(
          "query-plan",
          "planning",
          "plan",
          "Query plan",
          `Use ${String(body.tableName ?? "customers")} plus subscription, usage, support, and campaign rollups to rank churn risk.`,
        ),
        modelWorkDone("query-plan", "planning", "plan", "Query plan"),
        phaseEvent("phase_completed", "planning", "Plan locked"),
        phaseEvent("phase_started", "sql_generation", "Generating SQL"),
        modelWorkStart("sql-block", "sql_generation", "sql", "Generated SQL"),
        modelWorkDelta("sql-block", "sql_generation", "sql", "Generated SQL", HIGH_RISK_SQL),
        modelWorkDone("sql-block", "sql_generation", "sql", "Generated SQL"),
        phaseEvent("phase_completed", "sql_generation", "SQL ready"),
        {
          type: "result",
          nl: {
            sql: HIGH_RISK_SQL,
            rationale:
              "Join NovaCraft customer, subscription, usage, support, and campaign data to rank churn risk.",
            explanation: {
              intentSummary: "Rank the highest-risk customers using business-critical retention signals.",
              selectedTables: [
                "customers",
                "subscriptions",
                "usage_metrics",
                "support_tickets",
                "marketing_campaigns",
              ],
              joinPlan: [
                {
                  leftTable: "customers",
                  leftColumn: "customer_id",
                  rightTable: "subscriptions",
                  rightColumn: "customer_id",
                  joinType: "left",
                  confidence: 0.99,
                  reason: "Shared customer key across billing records.",
                },
                {
                  leftTable: "customers",
                  leftColumn: "industry",
                  rightTable: "marketing_campaigns",
                  rightColumn: "target_industry",
                  joinType: "left",
                  confidence: 0.74,
                  reason: "Campaign context is attached by industry rollups rather than direct customer IDs.",
                },
              ],
              filters: [],
              aggregations: [
                "Latest subscription per customer",
                "AVG adoption, NPS, satisfaction",
                "COUNT tickets",
                "Industry campaign conversion rollups",
              ],
              assumptions: ["Latest subscription approximates current contract state."],
              validationNotes: ["Rows are limited to 12 for review speed."],
              confidence: 0.91,
              warningLevel: "low",
              confidenceMode: "model",
              reliabilityTier: "high",
            },
            queryId: HIGH_RISK_QUERY.queryId,
            provider: { id: "openai", label: "OpenAI", model: "gpt-5.4" },
            cached: false,
            query: HIGH_RISK_QUERY,
            queryExecutionError: null,
          },
        },
        { type: "done" },
      ]);
      return;
    }
    if (method === "POST" && pathname === "/api/query/nl") {
      sendJson(response, 200, {
        nl: {
          sql: HIGH_RISK_SQL,
          rationale:
            "Join the uploaded NovaCraft tables and campaign context to score churn risk.",
          explanation: {
            intentSummary: "Rank high-risk customers.",
            selectedTables: [
              "customers",
              "subscriptions",
              "usage_metrics",
              "support_tickets",
              "marketing_campaigns",
            ],
            joinPlan: [],
            filters: [],
            aggregations: [],
            assumptions: [],
            validationNotes: [],
            confidence: 0.91,
            warningLevel: "low",
            confidenceMode: "model",
            reliabilityTier: "high",
          },
          queryId: HIGH_RISK_QUERY.queryId,
          provider: { id: "openai", label: "OpenAI", model: "gpt-5.4" },
          cached: false,
          query: HIGH_RISK_QUERY,
          queryExecutionError: null,
        },
      });
      return;
    }
    if (method === "POST" && pathname === "/api/query/sql") {
      sendJson(response, 200, { query: HIGH_RISK_QUERY });
      return;
    }
    if (method === "GET" && pathname === "/api/preprocessing/tables") {
      const datasets = visibleDatasets(state) as Array<{
        datasetId: string;
        tableName?: string;
        filename: string;
        size: number;
        nRows: number;
        nCols: number;
        columns: Array<{ name: string; dtype: string }>;
        sample: readonly JsonRecord[];
      }>;
      sendJson(response, 200, {
        tables: datasets.map((dataset) => ({
          datasetId: dataset.datasetId,
          name: dataset.tableName ?? dataset.filename,
          filename: dataset.filename,
          sizeBytes: dataset.size,
          nRows: dataset.nRows,
          nCols: dataset.nCols,
          columns: dataset.columns.map((column: JsonRecord) => ({
            name: column.name,
            dtype: column.dtype,
          })),
          previewRows: dataset.sample,
        })),
      });
      return;
    }
    if (method === "POST" && pathname === "/api/workflows/turns/stream") {
      const body = (await readJsonBody(request)) as JsonRecord;
      const phase = String(body.phase ?? "");
      if (phase === "onboarding") {
        const answers = Array.isArray(body.questionAnswers) ? body.questionAnswers : [];
        if (answers.length === 0) {
          await streamNdjson(response, [
            { type: "thinking", text: "Reviewing the uploaded schema and business context..." },
            {
              type: "workflow_pause",
              reason: "await_input",
              pendingInputKind: "clarification",
              ui: {
                ask_user: {
                  questions: [
                    {
                      id: "goal",
                      type: "single_select",
                      header: "Goal",
                      question: "What should the first SQL workstream optimize for?",
                      options: [
                        { label: "Churn risk", description: "Focus on retention signals." },
                        { label: "Revenue expansion", description: "Focus on upsell and plan mix." },
                      ],
                    },
                  ],
                },
              },
            },
            { type: "done" },
          ]);
          return;
        }
        await streamNdjson(response, [
          { type: "thinking", text: "Drafting the exploration plan..." },
          {
            type: "token",
            text: "I’m assembling the retention workflow from the uploaded tables and business-context PDF.",
          },
          {
            type: "artifact_updated",
            artifact: {
              artifactId: "artifact-plan-1",
              runId: "wf-onboarding-1",
              kind: "plan",
              label: "NovaCraft retention workflow",
              payload: {
                planName: "novacraft-retention-workflow.md",
                planMarkdown: PLAN_MARKDOWN,
              },
            },
          },
          { type: "done" },
        ]);
        return;
      }
      if (phase === "preprocessing") {
        await streamNdjson(response, [
          {
            type: "workflow_state",
            state: {
              runId: "wf-prep-1",
              threadId: "thread-prep-1",
              phase: "preprocessing",
              currentNode: "plan_step",
              status: "running",
              mode: "action",
            },
          },
          {
            type: "tool_executed",
            call: {
              id: "prep-proposal-1",
              tool: "propose_transformation_step",
              args: { stepId: "prep-step-1", title: "Repair sparse usage + subscription state" },
              rationale:
                "Feature adoption, NPS, and latest-contract state are the weakest inputs before the joined retention matrix can be trusted.",
            },
            result: {
              id: "prep-proposal-1",
              tool: "propose_transformation_step",
              output: {
                runId: "prep-run-1",
                status: "pending",
                step: {
                  stepId: "prep-step-1",
                  title: "Repair sparse usage + subscription state",
                  status: "pending",
                  requiresApproval: false,
                  cellIds: [],
                },
              },
            },
          },
          {
            type: "tool_executed",
            call: {
              id: "prep-exec-1",
              tool: "execute_transformation_step",
              args: { stepId: "prep-step-1" },
            },
            result: {
              id: "prep-exec-1",
              tool: "execute_transformation_step",
              output: {
                status: "success",
                stdout:
                  "Imputed adoption + NPS sparse values, normalized latest subscription records, and preserved joinable customer coverage.",
                duration: 242,
              },
            },
          },
          {
            type: "tool_executed",
            call: {
              id: "prep-validate-1",
              tool: "validate_step_result",
              args: { stepId: "prep-step-1" },
            },
            result: {
              id: "prep-validate-1",
              tool: "validate_step_result",
              output: {
                passed: true,
                metrics: [
                  {
                    name: "Usage rows preserved",
                    before: USAGE_DATASET.rows,
                    after: USAGE_DATASET.rows,
                  },
                  { name: "Sparse usage fields repaired", before: 595, after: 0 },
                  { name: "Customer join coverage", before: 0.924, after: 0.998 },
                ],
              },
            },
          },
          {
            type: "tool_executed",
            call: {
              id: "prep-commit-1",
              tool: "commit_transformation_step",
              args: { stepId: "prep-step-1" },
            },
            result: {
              id: "prep-commit-1",
              tool: "commit_transformation_step",
              output: { committed: true },
            },
          },
          { type: "done" },
        ]);
        return;
      }
      if (phase === "feature_engineering") {
        await streamNdjson(response, [
          {
            type: "thinking",
            text: "Scanning the NovaCraft retention tables for compact, explainable signal candidates...",
          },
          {
            type: "artifact_updated",
            artifact: {
              artifactId: "artifact-fe-suggestions-1",
              runId: "wf-fe-1",
              kind: "feature_suggestions",
              label: "Feature suggestions",
              payload: {
                featureRunId: String(state.featureRun.runId),
              },
              ui: {
                version: "1",
                kind: "feature_engineering",
                sections: [
                  {
                    id: "suggestions",
                    title: "Recommended features",
                    layout: "column",
                    items: FEATURES.map((feature) => ({
                      type: "feature_suggestion",
                      id: feature.id,
                      feature: {
                        sourceColumn: feature.sourceColumn,
                        secondaryColumn: feature.secondaryColumn ?? null,
                        featureName: feature.featureName,
                        method: feature.method,
                        params: feature.params ?? {},
                      },
                      rationale: feature.description,
                      impact: "high",
                      controls: feature.secondaryColumn
                        ? [
                            {
                              key: "secondaryColumn",
                              label: "Secondary column",
                              type: "column",
                              value: feature.secondaryColumn,
                            },
                          ]
                        : [],
                    })),
                  },
                ],
              },
            },
          },
          { type: "done" },
        ]);
        return;
      }
      if (phase === "training") {
        const prompt = String(body.prompt ?? "");
        if (/approved/i.test(prompt)) {
          await streamNdjson(response, [
            {
              type: "tool_executed",
              call: {
                id: "train-load-1",
                tool: "load_training_matrix",
                args: {
                  datasetId: RETENTION_DATASET.datasetId,
                  datasetName: RETENTION_DATASET.filename,
                },
              },
              result: {
                id: "train-load-1",
                tool: "load_training_matrix",
                output: {
                  datasetId: RETENTION_DATASET.datasetId,
                  rows: RETENTION_DATASET.rows,
                  features: [...FEATURE_COLUMNS],
                },
              },
            },
            {
              type: "tool_executed",
              call: { id: "train-eval-1", tool: "evaluate_results", args: { experimentId: "exp-1" } },
              result: {
                id: "train-eval-1",
                tool: "evaluate_results",
                output: { experimentId: "exp-1", metrics: MODELS[0]?.metrics },
              },
            },
            {
              type: "tool_executed",
              call: { id: "train-register-1", tool: "register_model", args: { modelName: MODELS[0]?.name } },
              result: {
                id: "train-register-1",
                tool: "register_model",
                output: {
                  modelId: MODELS[0]?.modelId,
                  modelName: MODELS[0]?.name,
                  status: "registered",
                  metrics: MODELS[0]?.metrics,
                  datasetId: RETENTION_DATASET.datasetId,
                },
              },
            },
            { type: "done" },
          ]);
          return;
        }
        await streamNdjson(response, [
          {
            type: "tool_executed",
            call: {
              id: "train-proposal-1",
              tool: "propose_training_plan",
              args: {
                experimentName: MODELS[0]?.name,
                modelType: "random_forest",
                datasetId: RETENTION_DATASET.datasetId,
              },
            },
            result: {
              id: "train-proposal-1",
              tool: "propose_training_plan",
              output: {
                experimentName: MODELS[0]?.name,
                modelType: "random_forest",
                status: "awaiting_approval",
                rationale:
                  "Best validation F1 on the joined retention matrix while keeping cross-source feature importance stable.",
              },
            },
          },
          {
            type: "workflow_pause",
            reason: "awaiting_approval",
            pendingInputKind: "approval",
          },
          { type: "done" },
        ]);
        return;
      }
      await streamNdjson(response, [{ type: "done" }]);
      return;
    }
    if (method === "GET" && /^\/api\/notebooks\/[^/]+\/recovery-candidate$/.test(pathname)) {
      const notebookId = pathname.split("/")[3] ?? "";
      const notebook = state.notebooks.find((entry) => String(entry.notebookId) === notebookId);
      sendJson(response, 200, {
        candidate: notebook
          ? {
              notebookId,
              reason: "phase-match",
              confidence: 1,
            }
          : null,
      });
      return;
    }
    if (method === "POST" && /^\/api\/notebooks\/[^/]+\/recover$/.test(pathname)) {
      const notebookId = pathname.split("/")[3] ?? "";
      const notebook = state.notebooks.find((entry) => String(entry.notebookId) === notebookId);
      if (!notebook) {
        sendJson(response, 404, { error: "Unknown notebook" });
        return;
      }
      sendJson(response, 200, {
        notebook,
        restoredCellIds: (state.cellsByNotebookId.get(notebookId) ?? []).map((cell) => cell.cellId),
      });
      return;
    }
    if (method === "GET" && pathname === `/api/projects/${state.projectId}/notebooks`) {
      const kind = url.searchParams.get("kind");
      sendJson(
        response,
        200,
        kind ? state.notebooks.filter((notebook) => notebook.kind === kind) : state.notebooks,
      );
      return;
    }
    if (method === "POST" && pathname === `/api/projects/${state.projectId}/notebooks`) {
      const body = (await readJsonBody(request)) as JsonRecord;
      const notebook = {
        notebookId: `nb-${Date.now()}`,
        projectId: state.projectId,
        name: String(body.name ?? "Notebook"),
        kind: body.kind ?? "phase",
        metadata: (body.metadata as JsonRecord | undefined) ?? {},
        createdAt: NOW,
        updatedAt: NOW,
      };
      state.notebooks.push(notebook);
      state.cellsByNotebookId.set(String(notebook.notebookId), []);
      sendJson(response, 200, notebook);
      return;
    }
    if (method === "PATCH" && /^\/api\/notebooks\/[^/]+$/.test(pathname)) {
      const notebookId = pathname.split("/").at(-1) ?? "";
      const body = (await readJsonBody(request)) as JsonRecord;
      const index = state.notebooks.findIndex((notebook) => String(notebook.notebookId) === notebookId);
      if (index === -1) {
        sendJson(response, 404, { error: "Unknown notebook" });
        return;
      }
      const next = {
        ...state.notebooks[index],
        ...(body.name ? { name: body.name } : {}),
        ...(body.metadata ? { metadata: mergeRecords(state.notebooks[index]?.metadata as JsonRecord, body.metadata as JsonRecord) } : {}),
        updatedAt: NOW,
      };
      state.notebooks[index] = next;
      sendJson(response, 200, next);
      return;
    }
    if (method === "POST" && /^\/api\/notebooks\/[^/]+\/cells$/.test(pathname)) {
      const notebookId = pathname.split("/")[3] ?? "";
      const body = (await readJsonBody(request)) as JsonRecord;
      const cells = state.cellsByNotebookId.get(notebookId);
      if (!cells) {
        sendJson(response, 404, { error: "Unknown notebook" });
        return;
      }
      const cell = buildNotebookCell(
        `cell-${Date.now()}`,
        notebookId,
        String(body.title ?? "Draft cell"),
        String(body.content ?? ""),
        [],
      );
      cell.position = cells.length;
      cell.cellType = String(body.cellType ?? "code");
      cells.push(cell);
      state.cellsById.set(String(cell.cellId), cell);
      sendJson(response, 200, cell);
      return;
    }
    if (method === "GET" && /^\/api\/notebooks\/[^/]+\/cells$/.test(pathname)) {
      const notebookId = pathname.split("/")[3] ?? "";
      const cells = state.cellsByNotebookId.get(notebookId) ?? [];
      sendJson(
        response,
        200,
        cells.map((cell) => ({
          cellId: cell.cellId,
          cellType: cell.cellType,
          title: cell.title,
          position: cell.position,
          executionStatus: cell.executionStatus,
          executionCount: cell.executionCount,
          executionOrder: cell.executionOrder,
          isDirty: cell.isDirty,
          lockedBy: cell.lockedBy ?? null,
          contentPreview: String(cell.content ?? "").slice(0, 120),
        })),
      );
      return;
    }
    if (method === "GET" && /^\/api\/cells\/[^/]+$/.test(pathname)) {
      const cellId = pathname.split("/").at(-1) ?? "";
      const cell = state.cellsById.get(cellId);
      if (!cell) {
        sendJson(response, 404, { error: "Unknown cell" });
        return;
      }
      sendJson(response, 200, cell);
      return;
    }
    if (method === "PATCH" && /^\/api\/cells\/[^/]+$/.test(pathname)) {
      const cellId = pathname.split("/").at(-1) ?? "";
      const cell = state.cellsById.get(cellId);
      if (!cell) {
        sendJson(response, 404, { error: "Unknown cell" });
        return;
      }
      const patch = (await readJsonBody(request)) as JsonRecord;
      const next = {
        ...cell,
        ...(patch.title ? { title: patch.title } : {}),
        ...(patch.content ? { content: patch.content } : {}),
        ...(patch.cellType ? { cellType: patch.cellType } : {}),
        ...(patch.metadata ? { metadata: mergeRecords(cell.metadata as JsonRecord, patch.metadata as JsonRecord) } : {}),
        updatedAt: NOW,
      };
      state.cellsById.set(cellId, next);
      const notebookCells = state.cellsByNotebookId.get(String(cell.notebookId));
      if (notebookCells) {
        const index = notebookCells.findIndex((entry) => String(entry.cellId) === cellId);
        if (index >= 0) {
          notebookCells[index] = next;
        }
      }
      sendJson(response, 200, next);
      return;
    }
    if (method === "DELETE" && /^\/api\/cells\/[^/]+$/.test(pathname)) {
      const cellId = pathname.split("/").at(-1) ?? "";
      const cell = state.cellsById.get(cellId);
      if (!cell) {
        sendJson(response, 204, {});
        return;
      }
      state.cellsById.delete(cellId);
      const notebookId = String(cell.notebookId);
      const notebookCells = state.cellsByNotebookId.get(notebookId) ?? [];
      state.cellsByNotebookId.set(
        notebookId,
        notebookCells.filter((entry) => String(entry.cellId) !== cellId),
      );
      sendJson(response, 204, {});
      return;
    }
    if (method === "POST" && /^\/api\/cells\/[^/]+\/run$/.test(pathname)) {
      sendJson(response, 200, { success: true, stdout: "Executed in demo mode.", stderr: "" });
      return;
    }
    if (method === "POST" && /^\/api\/cells\/[^/]+\/interrupt$/.test(pathname)) {
      sendJson(response, 200, { success: true });
      return;
    }
    if (method === "POST" && /^\/api\/projects\/[^/]+\/kernel\/restart$/.test(pathname)) {
      sendJson(response, 200, { success: true });
      return;
    }
    if (method === "POST" && /^\/api\/notebooks\/[^/]+\/reorder$/.test(pathname)) {
      sendJson(response, 200, { success: true });
      return;
    }
    if (method === "GET" && pathname === "/api/feature-engineering/runs") {
      sendJson(response, 200, { projectId: state.projectId, count: 1, runs: [state.featureRun] });
      return;
    }
    if (method === "GET" && /^\/api\/feature-engineering\/runs\/[^/]+$/.test(pathname)) {
      sendJson(response, 200, { run: state.featureRun });
      return;
    }
    if (method === "POST" && pathname === "/api/feature-engineering/apply") {
      state.availableDerivedDatasetIds.add(RETENTION_DATASET.datasetId);
      sendJson(response, 200, {
        dataset: {
          datasetId: RETENTION_DATASET.datasetId,
          filename: RETENTION_DATASET.filename,
          fileType: "csv",
          size: RETENTION_DATASET.byteSize,
          n_rows: RETENTION_DATASET.rows,
          n_cols: RETENTION_DATASET.cols,
          columns: [...RETENTION_DATASET.columns],
          dtypes: RETENTION_DATASET.dtypes,
          null_counts: RETENTION_DATASET.nullCounts,
          sample: RETENTION_DATASET.sampleRows,
          createdAt: NOW,
        },
      });
      return;
    }
    if (method === "GET" && pathname === "/api/models/templates") {
      sendJson(response, 200, { templates: state.modelTemplates });
      return;
    }
    if (method === "GET" && pathname === "/api/models") {
      sendJson(response, 200, { models: state.models });
      return;
    }
    if (method === "GET" && /^\/api\/experiments\/[^/]+\/evaluation$/.test(pathname)) {
      const modelId = pathname.split("/")[3] ?? "";
      sendJson(response, 200, state.evaluations[modelId] ?? EVALUATION);
      return;
    }
    if (method === "GET" && /^\/api\/experiments\/[^/]+\/shap$/.test(pathname)) {
      const modelId = pathname.split("/")[3] ?? "";
      sendJson(response, 200, state.shapByModelId[modelId] ?? SHAP);
      return;
    }
    if (method === "GET" && /^\/api\/experiments\/[^/]+\/error-analysis$/.test(pathname)) {
      const modelId = pathname.split("/")[3] ?? "";
      sendJson(response, 200, state.errorAnalysisByModelId[modelId] ?? ERROR_ANALYSIS);
      return;
    }
    if (method === "POST" && /^\/api\/experiments\/[^/]+\/insights$/.test(pathname)) {
      const body = (await readJsonBody(request)) as JsonRecord;
      const type = String(body.type ?? "report");
      const lines =
        type === "compare"
          ? [
              {
                type: "token",
                content:
                  "NovaForest leads on F1, keeps calibration tighter, and benefits most from the joined campaign-fit signal.",
              },
              {
                type: "token",
                content:
                  "XGBoost remains a solid backup when the team wants faster retraining on the same retention matrix.",
              },
              { type: "done" },
            ]
          : [
              {
                type: "token",
                content:
                  "NovaCraft churn risk is most sensitive to support pressure, expansion headroom, campaign-fit drag, and adoption decline.",
              },
              {
                type: "token",
                content:
                  "The champion model is stable enough for a monitored production rollout with explainability preserved.",
              },
              { type: "done" },
            ];
      await streamNdjson(response, lines);
      return;
    }
    if (method === "GET" && pathname === "/api/deployments") {
      sendJson(response, 200, { deployments: state.deployments });
      return;
    }
    if (method === "POST" && pathname === "/api/deployments") {
      sendJson(response, 200, { deployment: DEPLOYMENT });
      return;
    }
    if (method === "GET" && /^\/api\/deployments\/[^/]+$/.test(pathname)) {
      const deploymentId = pathname.split("/")[3] ?? "";
      const deployment = state.deployments.find((entry) => String(entry.deploymentId) === deploymentId);
      sendJson(response, 200, { deployment: deployment ?? DEPLOYMENT });
      return;
    }
    if (method === "GET" && /^\/api\/deployments\/[^/]+\/schema$/.test(pathname)) {
      const deploymentId = pathname.split("/")[3] ?? "";
      sendJson(response, 200, state.deploymentSchemaById[deploymentId] ?? DEPLOYMENT_SCHEMA);
      return;
    }
    if (method === "GET" && /^\/api\/deployments\/[^/]+\/logs$/.test(pathname)) {
      const deploymentId = pathname.split("/")[3] ?? "";
      const logs = state.deploymentLogsById[deploymentId] ?? DEPLOYMENT_LOGS;
      sendJson(response, 200, { logs, total: logs.length });
      return;
    }
    if (method === "GET" && /^\/api\/deployments\/[^/]+\/stats$/.test(pathname)) {
      const deploymentId = pathname.split("/")[3] ?? "";
      sendJson(response, 200, {
        stats: state.deploymentStatsById[deploymentId] ?? DEPLOYMENT_STATS,
        range: url.searchParams.get("range") ?? "24h",
      });
      return;
    }
    if (method === "POST" && /^\/api\/deployments\/[^/]+\/drift$/.test(pathname)) {
      sendJson(response, 200, {
        available: true,
        timestamp: NOW,
        overallStatus: "green",
        features: [
          { feature: "support_ticket_velocity", type: "numeric", psi: 0.08, status: "green", testType: "ks", baselineDistribution: [1, 2], currentDistribution: [1, 2] },
          { feature: "expansion_ratio", type: "numeric", psi: 0.11, status: "green", testType: "ks", baselineDistribution: [1, 2], currentDistribution: [1, 2] },
          { feature: "campaign_efficiency_gap", type: "numeric", psi: 0.06, status: "green", testType: "ks", baselineDistribution: [1, 2], currentDistribution: [1, 2] },
        ],
      });
      return;
    }
    if (method === "POST" && /^\/api\/deployments\/[^/]+\/predict$/.test(pathname)) {
      sendJson(response, 200, {
        prediction: "Churned",
        probabilities: { Active: 0.18, Churned: 0.82 },
        shapValues: [
          { feature: "support_ticket_velocity", value: 0.24 },
          { feature: "expansion_ratio", value: -0.17 },
          { feature: "campaign_efficiency_gap", value: -0.09 },
          { feature: "feature_adoption_pct", value: 0.11 },
        ],
      });
      return;
    }
    if (method === "GET" && /^\/api\/deployments\/[^/]+\/api-keys$/.test(pathname)) {
      const deploymentId = pathname.split("/")[3] ?? "";
      sendJson(response, 200, { keys: state.deploymentApiKeysById[deploymentId] ?? DEPLOYMENT_API_KEYS });
      return;
    }
    if (method === "POST" && /^\/api\/deployments\/[^/]+\/api-keys$/.test(pathname)) {
      const deploymentId = pathname.split("/")[3] ?? "";
      const body = (await readJsonBody(request)) as JsonRecord;
      const created = {
        keyId: `key-${Date.now()}`,
        deploymentId,
        name: String(body.name ?? "Demo key"),
        keyPrefix: "agm_live_new",
        rawKey: "agm_live_demo_mock_key",
        createdAt: NOW,
      };
      sendJson(response, 200, { key: created, rawKey: created.rawKey });
      return;
    }
    if (method === "POST" && /^\/api\/deployments\/[^/]+\/logs\/[^/]+\/feedback$/.test(pathname)) {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (method === "GET" && pathname === "/api/execute/health") {
      sendJson(response, 200, { status: "healthy", dockerAvailable: true, activeSessions: 0 });
      return;
    }
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Mock server failure",
    });
    return;
  }

  sendJson(response, 404, { error: `Unhandled mock route: ${method} ${pathname}` });
}

function buildProject(currentPhase: PhaseSlug): JsonRecord {
  const currentPhaseIndex = ALL_PHASES.indexOf(currentPhase);
  const unlockedPhases = ALL_PHASES.slice(0, currentPhaseIndex + 1);
  const completedPhases = ALL_PHASES.slice(0, currentPhaseIndex);

  return {
    id: PROJECT_ID,
    name: "NovaCraft Growth",
    description: "Rank churn risk, explain it, and ship a production endpoint.",
    icon: "Sparkles",
    color: "blue",
    createdAt: NOW,
    updatedAt: NOW,
    metadata: {
      currentPhase,
      unlockedPhases,
      completedPhases,
      phaseDatasets: {
        preprocessing: CUSTOMERS_DATASET.datasetId,
        "feature-engineering": CUSTOMERS_DATASET.datasetId,
        training: CUSTOMERS_DATASET.datasetId,
      },
      projectPlan: PLAN_MARKDOWN,
      projectPlanName: "NovaCraft SQL exploration",
      activePlanId: "plan-retention",
      activePlanChatId: null,
      uploadStage: "upload",
      plans: [
        {
          id: "plan-retention",
          name: "NovaCraft SQL exploration",
          content: PLAN_MARKDOWN,
        },
      ],
      pipelineVersions: [FEATURE_VERSION],
      currentPipelineVersionId: FEATURE_VERSION.id,
      features: FEATURES,
    },
  };
}

function buildPhaseNotebooks(): JsonRecord[] {
  return [
    {
      notebookId: "nb-prep-1",
      projectId: PROJECT_ID,
      name: "Preprocessing Workbook",
      kind: "phase",
      metadata: { phase: "preprocessing", tabId: "processing-tab-1", tabName: "Main workbook" },
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      notebookId: "nb-fe-1",
      projectId: PROJECT_ID,
      name: "Revenue + Support Draft",
      kind: "phase",
      metadata: { phase: "feature-engineering", tabId: FEATURE_VERSION.id, tabName: FEATURE_VERSION.name },
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      notebookId: "nb-train-1",
      projectId: PROJECT_ID,
      name: "Training Workbook",
      kind: "phase",
      metadata: { phase: "training", tabId: "training-demo-training-wb-1", tabName: "Training Workbook" },
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
}

function buildPhaseNotebookCells(): Record<string, JsonRecord[]> {
  return {
    "nb-prep-1": [
      buildNotebookCell("prep-cell-1", "nb-prep-1", "Repair sparse usage signals", [
        "import pandas as pd",
        "usage = pd.read_csv('usage_metrics.csv')",
        "usage['feature_adoption_pct'] = usage['feature_adoption_pct'].fillna(usage['feature_adoption_pct'].median())",
        "usage['nps_response'] = usage['nps_response'].fillna(usage['nps_response'].median())",
        "usage[['feature_adoption_pct', 'nps_response']].describe()",
      ].join("\n"), [
        {
          type: "text",
          content: "Imputed sparse usage signals and preserved all 10,693 rows for downstream joins.",
        },
      ]),
    ],
    "nb-fe-1": [
      buildNotebookCell("fe-cell-1", "nb-fe-1", "Support + expansion features", [
        "customer_rollup['support_ticket_velocity'] = customer_rollup['support_tickets'] / customer_rollup['active_months'].clip(lower=1)",
        "customer_rollup['expansion_ratio'] = (customer_rollup['feature_adoption_pct'] / 100.0) * np.log1p(customer_rollup['mrr_usd'])",
        "customer_rollup[['support_ticket_velocity', 'expansion_ratio']].head()",
      ].join("\n"), [
        {
          type: "text",
          content: "Registered 2 explainable churn features grounded in support pressure and expansion headroom.",
        },
      ]),
    ],
    "nb-train-1": [
      buildNotebookCell("train-cell-1", "nb-train-1", "Load training matrix", [
        "import pandas as pd",
        "df = pd.read_csv('novacraft_features_v1.csv')",
        `print(f'Loaded {len(df)} rows for training.')`,
      ].join("\n"), [
        { type: "text", content: `Loaded ${CUSTOMERS_DATASET.rows} rows for training.` },
      ]),
      buildNotebookCell("train-cell-2", "nb-train-1", "Train champion", [
        "from sklearn.ensemble import RandomForestClassifier",
        "model = RandomForestClassifier(n_estimators=400, max_depth=12, min_samples_leaf=4)",
        "print('Champion candidate F1: 0.8424')",
      ].join("\n"), [
        { type: "text", content: "Champion candidate F1: 0.8424\nBackup candidate F1: 0.8324" },
      ]),
    ],
  };
}

function buildNotebookCell(
  cellId: string,
  notebookId: string,
  title: string,
  content: string,
  output: JsonRecord[],
): JsonRecord {
  return {
    cellId,
    notebookId,
    cellType: "code",
    title,
    content,
    position: 0,
    metadata: {},
    executionCount: 1,
    executionOrder: 1,
    executionStatus: "success",
    executionDurationMs: 320,
    executedAt: NOW,
    isDirty: false,
    output,
    outputRefs: [],
    lockedBy: null,
    lockedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function visibleDatasets(state: ScenarioState): JsonRecord[] {
  return DATASETS.filter((dataset) => state.uploadedDatasetIds.has(dataset.datasetId)).map((dataset) => ({
    datasetId: dataset.datasetId,
    projectId: state.projectId,
    filename: dataset.filename,
    fileType: "csv",
    size: dataset.byteSize,
    nRows: dataset.rows,
    nCols: dataset.cols,
    columns: dataset.columnProfiles.map((column) => ({
      name: column.columnName,
      dtype: column.dtype,
      nullCount: column.nullCount,
      uniqueCount: undefined,
    })),
    sample: dataset.sampleRows,
    createdAt: NOW,
    updatedAt: NOW,
    tableName: dataset.tableName,
    physicalTableName: `${dataset.tableName}_${dataset.datasetId}`,
    queryable: true,
    metadata: {
      tableName: dataset.tableName,
      rowsLoaded: dataset.rows,
    },
  }));
}

function visibleDocuments(state: ScenarioState): JsonRecord[] {
  return DOCUMENTS.filter((document) => state.uploadedDocumentIds.has(document.documentId)).map((document) => ({
    documentId: document.documentId,
    projectId: state.projectId,
    filename: document.filename,
    mimeType: document.mimeType,
    byteSize: document.byteSize,
    metadata: {},
    createdAt: NOW,
  }));
}

function toPlanChatSummary(chat: JsonRecord): JsonRecord {
  return {
    chatId: chat.chatId,
    projectId: chat.projectId,
    userId: chat.userId,
    name: chat.name,
    status: chat.status,
    currentRound: chat.currentRound,
    completedPlanId: chat.completedPlanId,
    messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

function applyCors(response: ServerResponse, frontendOrigin: string) {
  response.setHeader("Access-Control-Allow-Origin", frontendOrigin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

async function streamNdjson(response: ServerResponse, events: readonly unknown[]) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/x-ndjson");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  for (const [index, event] of events.entries()) {
    response.write(`${JSON.stringify(event)}\n`);
    if (index < events.length - 1) {
      await sleep(220);
    }
  }
  response.end();
}

async function readJsonBody(request: IncomingMessage): Promise<JsonRecord> {
  const raw = await readBody(request);
  if (!raw) return {};
  return JSON.parse(raw.toString("utf8")) as JsonRecord;
}

async function readMultipartHints(
  request: IncomingMessage,
): Promise<{ filename: string; projectId?: string }> {
  const raw = await readBody(request);
  const text = raw.toString("latin1");
  const filenameMatch = text.match(/filename="([^"]+)"/i);
  const projectIdMatch = text.match(/name="projectId"\r\n\r\n([^\r\n]+)/i);
  return {
    filename: filenameMatch?.[1] ?? "",
    projectId: projectIdMatch?.[1],
  };
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function mergeRecords(base: JsonRecord, patch: JsonRecord): JsonRecord {
  const next: JsonRecord = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const currentValue = next[key];
    if (isPlainObject(currentValue) && isPlainObject(value)) {
      next[key] = mergeRecords(currentValue, value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

function isPlainObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function phaseEvent(
  type: "phase_started" | "phase_completed",
  phaseId: string,
  summary: string,
) {
  return {
    type,
    phaseId,
    summary,
    timestamp: NOW,
    details: {},
  };
}

function modelWorkStart(blockId: string, phaseId: string, kind: string, title: string) {
  return {
    type: "model_work_block_started",
    blockId,
    phaseId,
    kind,
    title,
    timestamp: NOW,
    details: {},
  };
}

function modelWorkDelta(
  blockId: string,
  phaseId: string,
  kind: string,
  title: string,
  delta: string,
) {
  return {
    type: "model_work_delta",
    blockId,
    phaseId,
    kind,
    title,
    timestamp: NOW,
    delta,
    details: {},
  };
}

function modelWorkDone(blockId: string, phaseId: string, kind: string, title: string) {
  return {
    type: "model_work_block_completed",
    blockId,
    phaseId,
    kind,
    title,
    timestamp: NOW,
    status: "completed",
    details: {},
  };
}

function mustDataset(tableName: string) {
  const match = DATASETS.find((dataset) => dataset.tableName === tableName);
  if (!match) {
    throw new Error(`Missing mock-business dataset for ${tableName}`);
  }
  return match;
}

function buildHighRiskRows(): JsonRecord[] {
  const customers = getMockBusinessRows(CUSTOMERS_DATASET.datasetId);
  const subscriptions = getMockBusinessRows(SUBSCRIPTIONS_DATASET.datasetId);
  const usage = getMockBusinessRows(USAGE_DATASET.datasetId);
  const tickets = getMockBusinessRows(SUPPORT_DATASET.datasetId);

  const latestSubscriptionByCustomer = new Map<string, FixtureRow>();
  for (const row of subscriptions) {
    const customerId = String(row.customer_id ?? "");
    const current = latestSubscriptionByCustomer.get(customerId);
    if (!current || String(row.start_date ?? "") > String(current.start_date ?? "")) {
      latestSubscriptionByCustomer.set(customerId, row);
    }
  }

  const usageByCustomer = new Map<
    string,
    { adoptionTotal: number; adoptionCount: number; npsTotal: number; npsCount: number }
  >();
  for (const row of usage) {
    const customerId = String(row.customer_id ?? "");
    const current =
      usageByCustomer.get(customerId) ?? { adoptionTotal: 0, adoptionCount: 0, npsTotal: 0, npsCount: 0 };
    if (typeof row.feature_adoption_pct === "number") {
      current.adoptionTotal += Number(row.feature_adoption_pct);
      current.adoptionCount += 1;
    }
    if (typeof row.nps_response === "number") {
      current.npsTotal += Number(row.nps_response);
      current.npsCount += 1;
    }
    usageByCustomer.set(customerId, current);
  }

  const ticketByCustomer = new Map<string, { count: number; satisfactionTotal: number; satisfactionCount: number }>();
  for (const row of tickets) {
    const customerId = String(row.customer_id ?? "");
    const current =
      ticketByCustomer.get(customerId) ?? { count: 0, satisfactionTotal: 0, satisfactionCount: 0 };
    current.count += 1;
    if (typeof row.satisfaction_score === "number") {
      current.satisfactionTotal += Number(row.satisfaction_score);
      current.satisfactionCount += 1;
    }
    ticketByCustomer.set(customerId, current);
  }

  return customers
    .map((customer) => {
      const customerId = String(customer.customer_id ?? "");
      const latestSub = latestSubscriptionByCustomer.get(customerId);
      const usageSummary = usageByCustomer.get(customerId);
      const ticketSummary = ticketByCustomer.get(customerId);
      const adoption = usageSummary && usageSummary.adoptionCount > 0
        ? usageSummary.adoptionTotal / usageSummary.adoptionCount
        : 0;
      const nps = usageSummary && usageSummary.npsCount > 0
        ? usageSummary.npsTotal / usageSummary.npsCount
        : 0;
      const satisfaction = ticketSummary && ticketSummary.satisfactionCount > 0
        ? ticketSummary.satisfactionTotal / ticketSummary.satisfactionCount
        : 0;
      let riskScore = 0;
      riskScore += customer.is_active === false ? 42 : 0;
      riskScore += Math.max(0, 35 - adoption) * 0.9;
      riskScore += Math.max(0, 7 - nps) * 3.5;
      riskScore += Math.min(ticketSummary?.count ?? 0, 12) * 2.4;
      riskScore += satisfaction > 0 ? Math.max(0, 4 - satisfaction) * 6 : 5;
      riskScore += latestSub && latestSub.auto_renew === false ? 6 : 0;

      return {
        customer_id: customerId,
        company_name: String(customer.company_name ?? ""),
        industry: String(customer.industry ?? ""),
        plan_tier: String(customer.plan_tier ?? ""),
        current_mrr_usd: Number(latestSub?.mrr_usd ?? 0),
        feature_adoption_pct: Number(adoption.toFixed(1)),
        support_tickets: ticketSummary?.count ?? 0,
        avg_satisfaction: Number(satisfaction.toFixed(2)),
        latest_nps_response: Number(nps.toFixed(1)),
        risk_score: Number(riskScore.toFixed(1)),
      };
    })
    .sort((left, right) => Number(right.risk_score) - Number(left.risk_score))
    .slice(0, 12);
}
