import type {
  CrossPhaseRecommendation,
  EvaluationResult,
  ExperimentSortDirection,
  ExperimentSortField,
  FilterPredicate,
} from '@/types/experiments';
import type { ModelRecord, ModelTaskType } from '@/types/model';
import { LOWER_IS_BETTER } from './modelIcons';

/* ── Filter predicate formatting ────────────────────────────────── */

export function formatOperator(op: FilterPredicate['operator']): string {
  switch (op) {
    case 'gt': return '>';
    case 'lt': return '<';
    case 'gte': return '\u2265';
    case 'lte': return '\u2264';
    case 'eq': return '=';
    case 'contains': return 'contains';
  }
}

/* ── Shared task-type helpers ─────────────────────────────────────── */

/** Primary metric per task type (higher = better). */
export const PRIMARY_METRIC: Record<ModelTaskType, string> = {
  classification: 'accuracy',
  regression: 'r2',
  clustering: 'silhouette',
};

/** Human-readable label for each primary metric. */
export const PRIMARY_METRIC_LABEL: Record<ModelTaskType, string> = {
  classification: 'Accuracy',
  regression: 'R\u00B2',
  clustering: 'Silhouette',
};

const METRIC_DISPLAY_LABEL: Readonly<Record<string, string>> = {
  accuracy: 'Accuracy',
  precision: 'Precision',
  recall: 'Recall',
  f1: 'F1',
  rmse: 'RMSE',
  mse: 'MSE',
  mae: 'MAE',
  r2: 'R\u00B2',
  silhouette: 'Silhouette',
};

/** Short display name for a metric key (tooltips, charts). Unknown keys become title case. */
export function formatMetricDisplayName(key: string): string {
  const k = key.toLowerCase();
  return METRIC_DISPLAY_LABEL[k] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Detect whether models span more than one task type. */
export function detectTaskTypes(models: ModelRecord[]): ModelTaskType[] {
  return Array.from(new Set(models.map((m) => m.taskType)));
}

/**
 * Find the model ID with the best primary metric score.
 * Optionally filters by task type (default: all task types).
 * Used by experiments (all types) and deployment (classification + regression only).
 */
export function findChampionModelId(
  models: ModelRecord[],
  taskTypeFilter?: ModelTaskType[],
): string | null {
  let champion: ModelRecord | null = null;
  let championValue = NaN;

  for (const model of models) {
    if (model.status !== 'completed') continue;
    if (taskTypeFilter && !taskTypeFilter.includes(model.taskType)) continue;

    const metricKey = PRIMARY_METRIC[model.taskType];
    const metricValue = model.metrics[metricKey];
    if (!Number.isFinite(metricValue)) continue;

    const lowerIsBetter = LOWER_IS_BETTER.has(metricKey);
    if (
      Number.isNaN(championValue) ||
      (lowerIsBetter ? metricValue < championValue : metricValue > championValue)
    ) {
      champion = model;
      championValue = metricValue;
    }
  }

  return champion?.modelId ?? null;
}

export function sortModels(
  models: ModelRecord[],
  sortField: ExperimentSortField,
  sortDirection: ExperimentSortDirection,
): ModelRecord[] {
  return [...models].sort((left, right) => {
    let leftValue: number | string;
    let rightValue: number | string;

    if (sortField === 'name') {
      leftValue = left.name.toLowerCase();
      rightValue = right.name.toLowerCase();
    } else if (sortField === 'algorithm') {
      leftValue = left.algorithm.toLowerCase();
      rightValue = right.algorithm.toLowerCase();
    } else if (sortField === 'createdAt') {
      leftValue = left.createdAt;
      rightValue = right.createdAt;
    } else {
      leftValue = left.metrics[sortField] ?? -Infinity;
      rightValue = right.metrics[sortField] ?? -Infinity;
    }

    if (leftValue < rightValue) {
      return sortDirection === 'asc' ? -1 : 1;
    }
    if (leftValue > rightValue) {
      return sortDirection === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

export function filterModels(
  models: ModelRecord[],
  activePredicates: FilterPredicate[],
  manualPredicates: FilterPredicate[],
  nameFilter: string,
): ModelRecord[] {
  let result = models;
  if (activePredicates.length > 0) {
    result = filterByPredicates(result, activePredicates);
  }
  if (manualPredicates.length > 0) {
    result = filterByGroupedPredicates(result, manualPredicates);
  }
  if (nameFilter.trim()) {
    const query = nameFilter.trim().toLowerCase();
    result = result.filter((model) => model.name.toLowerCase().includes(query));
  }
  return result;
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

/**
 * Format milliseconds as a compact duration string for pill display.
 * < 1s → "123ms", < 60s → "42s", < 60m → "3m 12s", >= 60m → "1h 5m"
 */
export function formatDurationCompact(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`;
}

/**
 * Format milliseconds as a long human-readable duration string for tooltips.
 * e.g., "3 minutes 12 seconds", "1 hour 5 minutes"
 */
export function formatDurationLong(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} milliseconds`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} second${totalSeconds !== 1 ? 's' : ''}`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    const minStr = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    return seconds > 0 ? `${minStr} ${seconds} second${seconds !== 1 ? 's' : ''}` : minStr;
  }
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  const hrStr = `${hours} hour${hours !== 1 ? 's' : ''}`;
  return remainMinutes > 0 ? `${hrStr} ${remainMinutes} minute${remainMinutes !== 1 ? 's' : ''}` : hrStr;
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

/** Filter models by grouped predicates: OR within same field, AND across fields. */
export function filterByGroupedPredicates(
  models: ModelRecord[],
  predicates: FilterPredicate[],
): ModelRecord[] {
  if (predicates.length === 0) return models;
  const groups = new Map<string, FilterPredicate[]>();
  for (const p of predicates) {
    const existing = groups.get(p.field) ?? [];
    existing.push(p);
    groups.set(p.field, existing);
  }
  const groupList = Array.from(groups.values());
  return models.filter((m) =>
    groupList.every((group) =>
      group.some((p) => applyPredicate(m, p))
    )
  );
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

export const CLUSTERING_METRICS = [
  { value: 'silhouette_score', label: 'Silhouette' },
  { value: 'calinski_harabasz_score', label: 'Calinski-Harabasz' },
  { value: 'davies_bouldin_score', label: 'Davies-Bouldin' },
];

export function getAvailableMetrics(taskType: string) {
  if (taskType === 'regression') return REGRESSION_METRICS;
  if (taskType === 'clustering') return CLUSTERING_METRICS;
  return CLASSIFICATION_METRICS;
}

/* ── Cross-phase recommendation generator ──────────────────────────── */

/**
 * Analyse evaluation results across all models and produce
 * cross-phase recommendations (pure function, no React dependency).
 */
export function generateRecommendations(
  models: ModelRecord[],
  evaluations: Record<string, EvaluationResult | null>,
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
