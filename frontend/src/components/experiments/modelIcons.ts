import { Target, TrendingUp, Layers, Crosshair, ScanSearch, Scale, Ruler, Activity, Sigma } from 'lucide-react';
import type { ComponentType } from 'react';
import type { ModelTaskType } from '@/types/model';

export function resolveModelIcon(taskType: ModelTaskType): {
  Icon: ComponentType<{ className?: string }>;
  colorClass: string;
} {
  switch (taskType) {
    case 'classification': return { Icon: Target, colorClass: 'text-blue-500' };
    case 'regression':     return { Icon: TrendingUp, colorClass: 'text-green-500' };
    case 'clustering':     return { Icon: Layers, colorClass: 'text-purple-500' };
  }
}

export const TASK_BADGE_STYLES: Record<ModelTaskType, string> = {
  classification: 'border-blue-500/30 bg-blue-100/50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  regression: 'border-green-500/30 bg-green-100/50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  clustering: 'border-purple-500/30 bg-purple-100/50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
};

export const TASK_LABELS: Record<ModelTaskType, string> = {
  classification: 'Classification',
  regression: 'Regression',
  clustering: 'Clustering',
};

export const TASK_TEXT_STYLES: Record<ModelTaskType, string> = {
  classification: 'text-blue-600 dark:text-blue-400',
  regression: 'text-green-600 dark:text-green-400',
  clustering: 'text-purple-600 dark:text-purple-400',
};

export const METRIC_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  accuracy: Target,
  precision: Crosshair,
  recall: ScanSearch,
  f1: Scale,
  rmse: Ruler,
  mse: Sigma,
  mae: Activity,
  r2: TrendingUp,
  silhouette: Layers,
};

export const LOWER_IS_BETTER = new Set(['rmse', 'mse', 'mae']);

/** Check if a metric name suggests lower values are better (loss, error, etc.) */
export function isLowerBetterMetric(name: string): boolean {
  return /loss|error/i.test(name) || LOWER_IS_BETTER.has(name.toLowerCase());
}
