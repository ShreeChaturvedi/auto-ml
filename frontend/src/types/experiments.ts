// ── Evaluation ──
export interface EvaluationResult {
  taskType: 'classification' | 'regression' | 'clustering';
  timestamp: string;
  computeMs: number;
  warnings?: string[];
  confusion_matrix?: { matrix: number[][]; matrix_normalized: number[][]; labels: string[] };
  roc_curves?: Record<string, { fpr: number[]; tpr: number[]; auc: number }>;
  precision_recall_curves?: Record<string, { precision: number[]; recall: number[]; ap: number }>;
  calibration_curve?: { prob_true: number[]; prob_pred: number[]; n_bins: number };
  classification_report?: Record<string, { precision: number; recall: number; f1: number; support: number } | number>;
  class_distribution?: { train: Record<string, number>; test: Record<string, number> };
  residuals?: { y_true: number[]; y_pred: number[]; residuals: number[] };
  residual_histogram?: { bin_edges: number[]; counts: number[] };
  feature_importance?: {
    model_based?: { features: string[]; importances: number[]; std?: number[] };
    permutation: { features: string[]; importances_mean: number[]; importances_std: number[] };
  };
  learning_curve?: {
    train_sizes: number[]; train_scores_mean: number[]; train_scores_std: number[];
    test_scores_mean: number[]; test_scores_std: number[];
  };
  cross_validation?: { scores: number[]; mean: number; std: number; scoring: string };
}

// ── SHAP ──
export interface ShapResult {
  values: number[][];           // (n_samples, n_features)
  base_values: number | number[];
  data: number[][];             // raw feature values for coloring
  feature_names: string[];
  mean_abs_values: number[];    // pre-computed global importance
}

// ── Tuning ──
export interface TuningTrialEvent {
  type: 'trial_result';
  trial_number: number;
  state: 'COMPLETE' | 'PRUNED' | 'FAIL';
  value: number | null;
  params: Record<string, unknown>;
  best_value: number;
  best_params: Record<string, unknown>;
  n_complete: number;
  n_total: number;
}

export interface TuningImportanceEvent {
  type: 'importance_update';
  importances: Record<string, number>;
  n_trials_used: number;
}

export interface TuningConvergenceEvent {
  type: 'convergence_update';
  status: 'exploring' | 'narrowing' | 'converging';
  trials_since_improvement: number;
  improvement_rate: number;
}

export type TuningStreamEvent =
  | TuningTrialEvent
  | TuningImportanceEvent
  | TuningConvergenceEvent
  | {
      type: 'done';
      resultModelId?: string;
      optimization_history?: { trial_numbers: number[]; values: number[]; best_values: number[] };
      best_value?: number;
      best_params?: Record<string, unknown>;
    }
  | { type: 'error'; message: string };

export interface TuningStudyResult {
  studyId: string;
  sourceModelId: string;
  status: 'running' | 'completed' | 'failed';
  nTrials: number;
  metric: string;
  bestTrialNumber?: number;
  bestValue?: number;
  bestParams?: Record<string, unknown>;
  resultModelId?: string;
  vizData?: {
    optimization_history: { trial_numbers: number[]; values: number[]; best_values: number[] };
    param_importances: { params: string[]; importances: number[] };
  };
}

// ── Error Analysis ──
export interface ErrorAnalysisResult {
  /** Backend sends `{ available: false }` when error analysis isn't possible */
  available?: boolean;
  error_tree: ErrorTreeNode;
  misclassifications: Array<{
    index: number; y_true: string; y_pred: string;
    confidence: number; top_shap_contributors: Array<{ feature: string; value: number }>;
  }>;
  provenance_attribution?: Array<{
    provenance_flag: string; error_rate: number; coverage: number; shap_importance: number;
  }>;
}

export interface ErrorTreeNode {
  node_id: number; feature?: string; threshold?: number;
  error_rate: number; sample_count: number; error_count: number;
  left?: ErrorTreeNode; right?: ErrorTreeNode;
}

// ── Cross-Phase Recommendations ──
export interface CrossPhaseRecommendation {
  category: 'feature_importance' | 'class_performance' | 'imputation_quality' | 'encoding_strategy';
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  llm_narrative?: string;
  target_phase: 'preprocessing' | 'feature-engineering';
  action_context?: Record<string, unknown>;
}

// ── NL Filter ──
export interface FilterPredicate {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'contains';
  value: string | number;
}

export type ExperimentView = 'overview' | 'leaderboard';
export type ExperimentDetailTab = 'plots' | 'interpretability' | 'errors' | 'provenance' | 'tune';

export type ExperimentSortDirection = 'asc' | 'desc';
export type ExperimentSortField = 'name' | 'algorithm' | 'createdAt' | (string & {});
/** Matches backend `VALID_INSIGHT_TYPES` (INSIGHT_SYSTEM_PROMPTS keys + `report`). */
export type ExperimentInsightType =
  | 'banner'
  | 'explain'
  | 'compare'
  | 'error_narrative'
  | 'report';

// ── Comparison ──
export interface ComparisonResult {
  models: Array<{ modelId: string; name: string; metrics: Record<string, number> }>;
  deltas: Array<{ metric: string; values: number[]; delta: number; pValue?: number; significant?: boolean }>;
  llm_narrative?: string;
}
