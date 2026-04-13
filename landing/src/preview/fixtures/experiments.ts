// Mock ModelRecord-style fixtures for the Experiments tab.
// Shape mirrors the real `frontend/src/types/model.ts#ModelRecord` closely
// (we intentionally pick only the fields the landing leaderboard needs, but
// keep the names identical so reading the spec and the real code lines up).

export interface FeatureImportance {
  feature: string;
  importance: number;
}

export interface RocPoint {
  fpr: number;
  tpr: number;
}

export interface ModelFixture {
  // Identity
  modelId: string;
  name: string;
  algorithm: 'XGBoost' | 'LightGBM' | 'RandomForest' | 'GradientBoosting';
  library: string;
  taskType: 'classification';
  status: 'completed' | 'failed';

  // Metrics
  metrics: {
    auc: number;
    f1: number;
    accuracy: number;
    precision: number;
    recall: number;
    cv_std: number;
  };

  // Runtime
  trainingMs: number;
  createdAt: string;

  // Display
  rank: number;
  isChampion: boolean;

  // Hyperparameters (rendered as a definition list in the drawer)
  parameters: Record<string, string | number | boolean>;

  // SHAP-style per-model feature importances
  featureImportances: FeatureImportance[];

  // Mock ROC curve samples — 11 points from (0,0) to (1,1)
  rocCurve: RocPoint[];
}

/** Build a plausible monotonic ROC curve from an AUC target. */
function makeRoc(auc: number): RocPoint[] {
  // Simple concave interpolation: tpr = fpr^(1 - shape)
  // where shape grows as auc → 1. At auc=0.5 it's the diagonal.
  const shape = Math.max(0, Math.min(0.95, (auc - 0.5) * 1.9));
  const pts: RocPoint[] = [];
  for (let i = 0; i <= 20; i++) {
    const fpr = i / 20;
    const tpr = Math.pow(fpr, 1 - shape);
    pts.push({ fpr: Number(fpr.toFixed(3)), tpr: Number(tpr.toFixed(3)) });
  }
  return pts;
}

export const mockModels: ModelFixture[] = [
  {
    modelId: 'model_xgb_42',
    name: 'xgboost_v3',
    algorithm: 'XGBoost',
    library: 'xgboost',
    taskType: 'classification',
    status: 'completed',
    metrics: {
      auc: 0.9612,
      f1: 0.9117,
      accuracy: 0.9188,
      precision: 0.9042,
      recall: 0.9194,
      cv_std: 0.0081,
    },
    trainingMs: 248_000,
    createdAt: '2026-03-12T10:44:18Z',
    rank: 1,
    isChampion: true,
    parameters: {
      n_estimators: 600,
      max_depth: 6,
      learning_rate: 0.05,
      subsample: 0.85,
      colsample_bytree: 0.8,
      reg_lambda: 1.2,
      reg_alpha: 0.1,
      objective: 'binary:logistic',
      tree_method: 'hist',
      early_stopping_rounds: 25,
    },
    featureImportances: [
      { feature: 'recency_days',           importance: 0.82 },
      { feature: 'mrr_delta_30d',          importance: 0.71 },
      { feature: 'ticket_escalation_rate', importance: 0.58 },
      { feature: 'plan_tier=Starter',      importance: 0.44 },
      { feature: 'logins_sum_14d',         importance: 0.37 },
      { feature: 'avg_session_minutes',    importance: 0.29 },
    ],
    rocCurve: makeRoc(0.9612),
  },
  {
    modelId: 'model_lgb_17',
    name: 'lightgbm_v2',
    algorithm: 'LightGBM',
    library: 'lightgbm',
    taskType: 'classification',
    status: 'completed',
    metrics: {
      auc: 0.9544,
      f1: 0.9002,
      accuracy: 0.9104,
      precision: 0.8931,
      recall: 0.9074,
      cv_std: 0.0094,
    },
    trainingMs: 192_000,
    createdAt: '2026-03-12T10:42:01Z',
    rank: 2,
    isChampion: false,
    parameters: {
      n_estimators: 800,
      num_leaves: 63,
      max_depth: -1,
      learning_rate: 0.04,
      feature_fraction: 0.8,
      bagging_fraction: 0.85,
      bagging_freq: 5,
      min_child_samples: 25,
      objective: 'binary',
    },
    featureImportances: [
      { feature: 'recency_days',           importance: 0.79 },
      { feature: 'mrr_delta_30d',          importance: 0.68 },
      { feature: 'ticket_escalation_rate', importance: 0.55 },
      { feature: 'logins_sum_14d',         importance: 0.41 },
      { feature: 'plan_tier=Starter',      importance: 0.36 },
      { feature: 'avg_session_minutes',    importance: 0.28 },
    ],
    rocCurve: makeRoc(0.9544),
  },
  {
    modelId: 'model_rf_08',
    name: 'random_forest_v1',
    algorithm: 'RandomForest',
    library: 'sklearn',
    taskType: 'classification',
    status: 'completed',
    metrics: {
      auc: 0.9289,
      f1: 0.8611,
      accuracy: 0.8742,
      precision: 0.8543,
      recall: 0.8680,
      cv_std: 0.0128,
    },
    trainingMs: 412_000,
    createdAt: '2026-03-12T10:39:44Z',
    rank: 3,
    isChampion: false,
    parameters: {
      n_estimators: 500,
      max_depth: 18,
      min_samples_split: 4,
      min_samples_leaf: 2,
      max_features: 'sqrt',
      bootstrap: true,
      n_jobs: -1,
    },
    featureImportances: [
      { feature: 'recency_days',         importance: 0.76 },
      { feature: 'mrr_delta_30d',        importance: 0.63 },
      { feature: 'active_users_mean',    importance: 0.48 },
      { feature: 'plan_tier=Starter',    importance: 0.41 },
      { feature: 'ticket_count_30d',     importance: 0.33 },
      { feature: 'avg_session_minutes',  importance: 0.22 },
    ],
    rocCurve: makeRoc(0.9289),
  },
  {
    modelId: 'model_gbc_03',
    name: 'gradient_boosting_v1',
    algorithm: 'GradientBoosting',
    library: 'sklearn',
    taskType: 'classification',
    status: 'completed',
    metrics: {
      auc: 0.9011,
      f1: 0.8412,
      accuracy: 0.8533,
      precision: 0.8298,
      recall: 0.8530,
      cv_std: 0.0142,
    },
    trainingMs: 364_000,
    createdAt: '2026-03-12T10:36:12Z',
    rank: 4,
    isChampion: false,
    parameters: {
      n_estimators: 400,
      max_depth: 4,
      learning_rate: 0.08,
      subsample: 0.9,
      min_samples_leaf: 3,
      max_features: 'sqrt',
    },
    featureImportances: [
      { feature: 'recency_days',         importance: 0.72 },
      { feature: 'mrr_delta_30d',        importance: 0.61 },
      { feature: 'plan_tier=Starter',    importance: 0.49 },
      { feature: 'ticket_escalation_rate', importance: 0.41 },
      { feature: 'logins_sum_14d',       importance: 0.30 },
      { feature: 'avg_session_minutes',  importance: 0.19 },
    ],
    rocCurve: makeRoc(0.9011),
  },
];

/**
 * Pre-baked agent "AI report" explaining why the champion won. Rendered as
 * plain paragraphs — streamdown is available in landing deps but would bloat
 * the initial bundle for a read-only static string.
 */
export const championReport = {
  modelName: 'xgboost_v3',
  paragraphs: [
    'xgboost_v3 is the recommended champion for NovaCraft customer churn. It outperforms every other candidate on both AUC (0.961) and F1 (0.912), with the lowest cross-validation standard deviation (0.008) — the tightest generalization of the four runs.',
    'The model attributes most of its predictive power to recency_days, mrr_delta_30d, and ticket_escalation_rate. These three features together account for over 60% of the total gain, which matches the qualitative story surfaced during the Explore phase: at-risk accounts are quiet, shrinking, and frustrated before they churn.',
    'Compared to lightgbm_v2 (the closest rival), xgboost_v3 trades 56 extra seconds of training time for a +0.7pt AUC gain and meaningfully tighter CV variance. Given the downstream cost of a missed churn prediction, the extra compute is a favorable trade. Promoting xgboost_v3 to the deployment endpoint is recommended.',
  ],
};
