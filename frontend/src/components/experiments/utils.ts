import type { FilterPredicate, EvaluationResult, CrossPhaseRecommendation } from '@/types/experiments';
import type { ModelRecord, ModelTaskType } from '@/types/model';

/* ── Shared task-type helpers ─────────────────────────────────────── */

/** Primary metric per task type (higher = better). */
export const PRIMARY_METRIC: Record<ModelTaskType, string> = {
  classification: 'accuracy',
  regression: 'r2',
  clustering: 'silhouette',
};

/** Detect whether models span more than one task type. */
export function detectTaskTypes(models: ModelRecord[]): ModelTaskType[] {
  return Array.from(new Set(models.map((m) => m.taskType)));
}

/* ── Metric formatting ───────────────────────────────────────────── */

/**
 * Format a numeric metric for display.
 * Values >= 1 get 2 decimal places; values < 1 get 4.
 * Returns an em-dash for undefined / non-finite values.
 */
export function formatMetric(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '\u2014';
  return value >= 1 ? value.toFixed(2) : value.toFixed(4);
}

/* ── Duration / time formatting ──────────────────────────────────── */

/**
 * Format milliseconds into a human-readable duration string.
 * < 1 s  -> "123ms"
 * >= 1 s -> "4.2s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ── NL filter predicate logic ───────────────────────────────────── */

/** Apply a single filter predicate to a model. */
export function applyPredicate(model: ModelRecord, pred: FilterPredicate): boolean {
  // Try metrics first, then top-level model fields
  const raw: unknown =
    pred.field in model.metrics
      ? model.metrics[pred.field]
      : (model as unknown as Record<string, unknown>)[pred.field];

  if (raw === undefined || raw === null) return false;

  if (pred.operator === 'contains') {
    return String(raw).toLowerCase().includes(String(pred.value).toLowerCase());
  }

  const numVal = typeof raw === 'number' ? raw : Number(raw);
  const numTarget = typeof pred.value === 'number' ? pred.value : Number(pred.value);

  if (!Number.isFinite(numVal) || !Number.isFinite(numTarget)) {
    // Fall back to string equality for non-numeric comparisons
    return pred.operator === 'eq'
      ? String(raw).toLowerCase() === String(pred.value).toLowerCase()
      : false;
  }

  switch (pred.operator) {
    case 'gt':  return numVal > numTarget;
    case 'lt':  return numVal < numTarget;
    case 'gte': return numVal >= numTarget;
    case 'lte': return numVal <= numTarget;
    case 'eq':  return numVal === numTarget;
    default:    return true;
  }
}

/** Filter models by all active predicates (AND logic). */
export function filterByPredicates(
  models: ModelRecord[],
  predicates: FilterPredicate[],
): ModelRecord[] {
  if (predicates.length === 0) return models;
  return models.filter((m) => predicates.every((p) => applyPredicate(m, p)));
}

/* ── Tuning metric options ─────────────────────────────────────────── */

export const CLASSIFICATION_METRICS = [
  { value: 'accuracy', label: 'Accuracy' },
  { value: 'f1', label: 'F1 Score' },
  { value: 'precision', label: 'Precision' },
  { value: 'recall', label: 'Recall' },
];

export const REGRESSION_METRICS = [
  { value: 'r2', label: 'R2' },
  { value: 'neg_mean_squared_error', label: 'Neg MSE' },
  { value: 'neg_mean_absolute_error', label: 'Neg MAE' },
];

export function getAvailableMetrics(taskType: string) {
  return taskType === 'regression' ? REGRESSION_METRICS : CLASSIFICATION_METRICS;
}

/* ── Cross-phase recommendation generator ──────────────────────────── */

/**
 * Analyse evaluation results across all models and produce
 * cross-phase recommendations (pure function, no React dependency).
 */
export function generateRecommendations(
  models: ModelRecord[],
  evaluations: Record<string, EvaluationResult>,
): CrossPhaseRecommendation[] {
  const recs: CrossPhaseRecommendation[] = [];

  for (const model of models) {
    const eval_ = evaluations[model.modelId];
    if (!eval_) continue;

    // Check classification_report for low F1
    if (eval_.classification_report) {
      for (const [cls, stats] of Object.entries(eval_.classification_report)) {
        if (cls === 'accuracy' || typeof stats === 'number') continue;
        const s = stats as { f1: number };
        if (s.f1 < 0.5) {
          recs.push({
            category: 'class_performance',
            severity: 'high',
            title: 'Consider class balancing in preprocessing',
            detail: `Class "${cls}" has F1=${s.f1.toFixed(2)} on model "${model.name}". Techniques like SMOTE or class-weight adjustment may help.`,
            target_phase: 'preprocessing',
          });
          break;
        }
      }
    }

    // Check CV fold variance
    if (eval_.cross_validation) {
      const { scores } = eval_.cross_validation;
      if (scores.length >= 2) {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
        const range = Math.max(...scores) - Math.min(...scores);
        if (range > 0.1 || variance > 0.01) {
          recs.push({
            category: 'feature_importance',
            severity: 'medium',
            title: 'High variance suggests overfitting',
            detail: `Model "${model.name}" shows CV score range of ${range.toFixed(3)}. Try feature selection or regularization to reduce variance.`,
            target_phase: 'feature-engineering',
          });
        }
      }
    }

    // Check learning curve gap (train/test divergence)
    if (eval_.learning_curve) {
      const { train_scores_mean, test_scores_mean } = eval_.learning_curve;
      if (train_scores_mean.length > 0 && test_scores_mean.length > 0) {
        const lastTrain = train_scores_mean[train_scores_mean.length - 1];
        const lastTest = test_scores_mean[test_scores_mean.length - 1];
        const gap = lastTrain - lastTest;
        if (gap > 0.1) {
          recs.push({
            category: 'feature_importance',
            severity: 'medium',
            title: 'Learning curve shows train/test gap',
            detail: `Model "${model.name}" has a gap of ${gap.toFixed(3)} between train (${lastTrain.toFixed(3)}) and test (${lastTest.toFixed(3)}) scores. Consider more data or regularization.`,
            target_phase: 'feature-engineering',
          });
        }
      }
    }
  }

  // Deduplicate by title
  const seen = new Set<string>();
  return recs.filter((r) => {
    if (seen.has(r.title)) return false;
    seen.add(r.title);
    return true;
  });
}
