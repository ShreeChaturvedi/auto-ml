// Training-tab fixtures: live model sparklines + chosen champion.
// Consumed by TrainingView's from-scratch TrainingProgressCard and
// ModelRecommendationCard. Keeping these values hand-authored (rather than
// procedurally generated) so the sparklines stay visually pleasing and the
// recommendation's final metric matches the leading model row.

export interface TrainingModelRow {
  id: string;
  name: string;
  /** Shown in the right-hand column of the row, e.g. 'F1 0.9117'. */
  metricLabel: string;
  metricValue: string;
  /** Loss curve over epochs — lower is better; Recharts plots as-is. */
  lossCurve: number[];
  /** Marked as the current leader — gets the pulsing star + accent row. */
  winner: boolean;
}

export interface TrainingProgressSnapshot {
  status: 'running' | 'complete';
  elapsedLabel: string;
  gpuUtilPercent: number;
  trialsCompleted: number;
  trialsTotal: number;
  models: TrainingModelRow[];
}

export interface ModelRecommendation {
  /** The chosen model's display name. */
  modelName: string;
  /** Headline metric, e.g. 'F1 0.9117'. */
  finalMetricLabel: string;
  finalMetricValue: string;
  /** Secondary metric shown as a subdued inline chip. */
  secondaryMetrics: Array<{ label: string; value: string }>;
  /** Bullets shown when the `why?` disclosure is expanded. */
  reasons: string[];
}

/**
 * Training progress snapshot: XGBoost leads with F1 0.9117 matching the
 * trainingNotebook fixture's best-params output. Curves are visually
 * distinct so the sparklines read as four different models at a glance.
 */
export const trainingProgressSnapshot: TrainingProgressSnapshot = {
  status: 'complete',
  elapsedLabel: '04:12',
  gpuUtilPercent: 78,
  trialsCompleted: 160,
  trialsTotal: 160,
  models: [
    {
      id: 'xgb',
      name: 'XGBoost',
      metricLabel: 'F1',
      metricValue: '0.9117',
      lossCurve: [0.71, 0.58, 0.46, 0.38, 0.31, 0.26, 0.22, 0.19, 0.17, 0.16, 0.155, 0.152],
      winner: true,
    },
    {
      id: 'lgbm',
      name: 'LightGBM',
      metricLabel: 'F1',
      metricValue: '0.9043',
      lossCurve: [0.74, 0.61, 0.5, 0.42, 0.35, 0.3, 0.26, 0.23, 0.21, 0.19, 0.18, 0.17],
      winner: false,
    },
    {
      id: 'rf',
      name: 'RandomForest',
      metricLabel: 'F1',
      metricValue: '0.8612',
      lossCurve: [0.78, 0.67, 0.58, 0.5, 0.44, 0.39, 0.35, 0.32, 0.3, 0.29, 0.28, 0.278],
      winner: false,
    },
    {
      id: 'lr',
      name: 'LogisticRegression',
      metricLabel: 'F1',
      metricValue: '0.7904',
      lossCurve: [0.82, 0.73, 0.66, 0.61, 0.57, 0.54, 0.52, 0.51, 0.505, 0.502, 0.501, 0.5],
      winner: false,
    },
  ],
};

export const modelRecommendation: ModelRecommendation = {
  modelName: 'XGBoost',
  finalMetricLabel: 'F1 (held-out)',
  finalMetricValue: '0.9117',
  secondaryMetrics: [
    { label: 'AUC', value: '0.953' },
    { label: 'Precision', value: '0.904' },
    { label: 'Recall', value: '0.920' },
  ],
  reasons: [
    'Highest held-out F1 across 5-fold CV — beat LightGBM by 0.0074 with tighter variance.',
    'SHAP top features (recency_days, mrr_delta_30d, ticket_escalation_rate) align with the planner\u2019s target rationale.',
    'Sub-second inference at batch 512 on CPU — cheapest to deploy among the top-2 candidates.',
  ],
};
