// Mock ModelRecord entries for the Experiments leaderboard + detail drawer.

export interface ModelFixture {
  id: string;
  name: string;
  family: 'XGBoost' | 'LightGBM' | 'RandomForest' | 'LogisticRegression';
  f1: number;
  precision: number;
  recall: number;
  auc: number;
  trainingSeconds: number;
  trainedAt: string;
  isChampion: boolean;
  topFeatures: { name: string; importance: number }[];
  confusionMatrix: [[number, number], [number, number]];
}

export const mockModels: ModelFixture[] = [
  {
    id: 'model_xgb_42',
    name: 'xgboost_v3',
    family: 'XGBoost',
    f1: 0.9117,
    precision: 0.9042,
    recall: 0.9194,
    auc: 0.9612,
    trainingSeconds: 248,
    trainedAt: '2026-03-12T10:44:18Z',
    isChampion: true,
    topFeatures: [
      { name: 'recency_days',           importance: 0.82 },
      { name: 'mrr_delta_30d',          importance: 0.71 },
      { name: 'ticket_escalation_rate', importance: 0.58 },
      { name: 'plan_tier=Starter',      importance: 0.44 },
    ],
    confusionMatrix: [[1840, 66], [49, 545]],
  },
  {
    id: 'model_lgb_17',
    name: 'lightgbm_v2',
    family: 'LightGBM',
    f1: 0.9002,
    precision: 0.8931,
    recall: 0.9074,
    auc: 0.9544,
    trainingSeconds: 192,
    trainedAt: '2026-03-12T10:42:01Z',
    isChampion: false,
    topFeatures: [
      { name: 'recency_days',           importance: 0.79 },
      { name: 'mrr_delta_30d',          importance: 0.68 },
      { name: 'ticket_escalation_rate', importance: 0.55 },
      { name: 'logins_sum',             importance: 0.38 },
    ],
    confusionMatrix: [[1822, 84], [55, 539]],
  },
  {
    id: 'model_rf_08',
    name: 'rf_v1',
    family: 'RandomForest',
    f1: 0.8611,
    precision: 0.8543,
    recall: 0.8680,
    auc: 0.9289,
    trainingSeconds: 412,
    trainedAt: '2026-03-12T10:39:44Z',
    isChampion: false,
    topFeatures: [
      { name: 'recency_days',          importance: 0.76 },
      { name: 'mrr_delta_30d',         importance: 0.63 },
      { name: 'active_users_mean',     importance: 0.48 },
      { name: 'plan_tier=Starter',     importance: 0.41 },
    ],
    confusionMatrix: [[1780, 126], [78, 516]],
  },
  {
    id: 'model_lr_03',
    name: 'logistic_v1',
    family: 'LogisticRegression',
    f1: 0.7904,
    precision: 0.7812,
    recall: 0.7998,
    auc: 0.8872,
    trainingSeconds: 38,
    trainedAt: '2026-03-12T10:36:12Z',
    isChampion: false,
    topFeatures: [
      { name: 'recency_days',          importance: 0.72 },
      { name: 'plan_tier=Starter',     importance: 0.58 },
      { name: 'ticket_escalation_rate',importance: 0.49 },
      { name: 'mrr_delta_30d',         importance: 0.42 },
    ],
    confusionMatrix: [[1698, 208], [119, 475]],
  },
];
