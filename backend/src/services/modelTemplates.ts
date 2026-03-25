import type { ModelTemplate, ModelTaskType } from '../types/model.js';
import type { DatasetProfileColumn } from '../types/dataset.js';

const MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: 'random_forest_classifier',
    name: 'Random Forest',
    taskType: 'classification',
    description: 'Ensemble of decision trees for robust classification.',
    library: 'sklearn',
    importPath: 'sklearn.ensemble',
    modelClass: 'RandomForestClassifier',
    metrics: ['accuracy', 'precision', 'recall', 'f1'],
    parameters: [
      {
        key: 'n_estimators',
        label: 'Trees',
        type: 'number',
        default: 200,
        min: 10,
        max: 1000,
        step: 10
      },
      {
        key: 'max_depth',
        label: 'Max depth',
        type: 'number',
        default: 10,
        min: 2,
        max: 50
      },
      {
        key: 'min_samples_split',
        label: 'Min samples split',
        type: 'number',
        default: 2,
        min: 2,
        max: 20
      }
    ],
    defaultParams: {
      n_estimators: 200,
      max_depth: 10,
      min_samples_split: 2,
      random_state: 42
    }
  },
  {
    id: 'logistic_regression',
    name: 'Logistic Regression',
    taskType: 'classification',
    description: 'Interpretable baseline classifier.',
    library: 'sklearn',
    importPath: 'sklearn.linear_model',
    modelClass: 'LogisticRegression',
    metrics: ['accuracy', 'precision', 'recall', 'f1'],
    parameters: [
      {
        key: 'C',
        label: 'Regularization',
        type: 'number',
        default: 1.0,
        min: 0.01,
        max: 10,
        step: 0.1
      },
      {
        key: 'max_iter',
        label: 'Max iterations',
        type: 'number',
        default: 200,
        min: 100,
        max: 1000,
        step: 50
      }
    ],
    defaultParams: {
      C: 1.0,
      max_iter: 200
    }
  },
  {
    id: 'random_forest_regressor',
    name: 'Random Forest Regressor',
    taskType: 'regression',
    description: 'Non-linear regression with tree ensembles.',
    library: 'sklearn',
    importPath: 'sklearn.ensemble',
    modelClass: 'RandomForestRegressor',
    metrics: ['rmse', 'mae', 'r2'],
    parameters: [
      {
        key: 'n_estimators',
        label: 'Trees',
        type: 'number',
        default: 200,
        min: 10,
        max: 1000,
        step: 10
      },
      {
        key: 'max_depth',
        label: 'Max depth',
        type: 'number',
        default: 10,
        min: 2,
        max: 50
      }
    ],
    defaultParams: {
      n_estimators: 200,
      max_depth: 10,
      random_state: 42
    }
  },
  {
    id: 'linear_regression',
    name: 'Linear Regression',
    taskType: 'regression',
    description: 'Simple baseline regression model.',
    library: 'sklearn',
    importPath: 'sklearn.linear_model',
    modelClass: 'LinearRegression',
    metrics: ['rmse', 'mae', 'r2'],
    parameters: [],
    defaultParams: {}
  },
  {
    id: 'ridge_regression',
    name: 'Ridge Regression',
    taskType: 'regression',
    description: 'L2-regularized linear regression. Alpha controls regularization strength.',
    library: 'sklearn',
    importPath: 'sklearn.linear_model',
    modelClass: 'Ridge',
    metrics: ['r2', 'neg_root_mean_squared_error', 'neg_mean_absolute_error'],
    parameters: [
      { key: 'alpha', label: 'Regularization (alpha)', type: 'number', default: 1.0, min: 0.001, max: 100 }
    ],
    defaultParams: { alpha: 1.0 }
  },
  {
    id: 'knn_classifier',
    name: 'K-Nearest Neighbors',
    taskType: 'classification',
    description: 'Distance-based classifier using nearest neighbor voting.',
    library: 'sklearn',
    importPath: 'sklearn.neighbors',
    modelClass: 'KNeighborsClassifier',
    metrics: ['accuracy', 'precision', 'recall', 'f1'],
    parameters: [
      { key: 'n_neighbors', label: 'Neighbors', type: 'number', default: 5, min: 1, max: 30 },
      { key: 'weights', label: 'Weight function', type: 'select', default: 'uniform',
        options: [{ value: 'uniform', label: 'Uniform' }, { value: 'distance', label: 'Distance' }] },
      { key: 'metric', label: 'Distance metric', type: 'select', default: 'minkowski',
        options: [
          { value: 'euclidean', label: 'Euclidean' },
          { value: 'manhattan', label: 'Manhattan' },
          { value: 'minkowski', label: 'Minkowski' }
        ] }
    ],
    defaultParams: { n_neighbors: 5, weights: 'uniform', metric: 'minkowski' }
  },
  {
    id: 'gradient_boosting_classifier',
    name: 'Gradient Boosting',
    taskType: 'classification',
    description: 'Sequential ensemble that corrects residual errors.',
    library: 'sklearn',
    importPath: 'sklearn.ensemble',
    modelClass: 'GradientBoostingClassifier',
    metrics: ['accuracy', 'precision', 'recall', 'f1'],
    parameters: [
      { key: 'n_estimators', label: 'Trees', type: 'number', default: 100, min: 50, max: 500, step: 50 },
      { key: 'learning_rate', label: 'Learning rate', type: 'number', default: 0.1, min: 0.01, max: 0.3 },
      { key: 'max_depth', label: 'Max depth', type: 'number', default: 3, min: 2, max: 8 },
      { key: 'min_samples_split', label: 'Min samples split', type: 'number', default: 2, min: 2, max: 20 }
    ],
    defaultParams: { n_estimators: 100, learning_rate: 0.1, max_depth: 3, min_samples_split: 2, random_state: 42 }
  },
  {
    id: 'kmeans',
    name: 'K-Means',
    taskType: 'clustering',
    description: 'Partition data into k clusters.',
    library: 'sklearn',
    importPath: 'sklearn.cluster',
    modelClass: 'KMeans',
    metrics: ['silhouette'],
    parameters: [
      {
        key: 'n_clusters',
        label: 'Clusters',
        type: 'number',
        default: 3,
        min: 2,
        max: 20
      },
      {
        key: 'max_iter',
        label: 'Max iterations',
        type: 'number',
        default: 300,
        min: 100,
        max: 1000,
        step: 100
      }
    ],
    defaultParams: {
      n_clusters: 3,
      max_iter: 300,
      random_state: 42
    }
  }
];

export function listModelTemplates(): ModelTemplate[] {
  return MODEL_TEMPLATES;
}

export const TEMPLATE_ID_ALIASES: Record<string, string> = {
  'linear-regression': 'linear_regression',
  'random-forest-classifier': 'random_forest_classifier',
  'random-forest-regressor': 'random_forest_regressor',
  'logistic-regression': 'logistic_regression',
  'knn-classifier': 'knn_classifier',
  'gradient-boosting-classifier': 'gradient_boosting_classifier',
  // Seeded test models that map to the nearest real template
  'xgboost-classifier': 'gradient_boosting_classifier',
  'xgboost_classifier': 'gradient_boosting_classifier',
};

/**
 * Infer the ML task type from the target column's dtype and cardinality.
 */
export function inferTaskType(
  targetColumn: string | undefined,
  columns: DatasetProfileColumn[]
): ModelTaskType {
  if (!targetColumn) return 'clustering';
  const col = columns.find((c) => c.name === targetColumn);
  if (!col) return 'classification';

  if (col.dtype === 'boolean') return 'classification';
  if (col.dtype === 'string') return 'classification';

  // Numeric target — use uniqueCount heuristic
  const unique = col.uniqueCount ?? 0;
  const samples = col.sampleCount ?? 0;
  if (unique > 0 && samples > 0 && unique / samples < 0.05) return 'classification';
  if (unique <= 20) return 'classification';

  return 'regression';
}

/**
 * Return ranked model templates for the inferred task type.
 */
export function getRecommendedTemplates(
  taskType: ModelTaskType,
  limit = 3
): ModelTemplate[] {
  return MODEL_TEMPLATES.filter((t) => t.taskType === taskType).slice(0, limit);
}

/**
 * Build a concise summary of available templates for LLM context injection.
 */
export function buildTemplateSummary(): string {
  const lines = MODEL_TEMPLATES.map(
    (t) => `- ${t.id} (${t.taskType}): ${t.name} — ${t.description}`
  );
  return `[Available model templates:\n${lines.join('\n')}]`;
}

export function getModelTemplate(templateId: string): ModelTemplate | undefined {
  // 1. Exact match
  const exact = MODEL_TEMPLATES.find((t) => t.id === templateId);
  if (exact) return exact;

  // 2. Explicit alias (covers known legacy IDs)
  const aliased = TEMPLATE_ID_ALIASES[templateId];
  if (aliased) return MODEL_TEMPLATES.find((t) => t.id === aliased);

  // 3. Normalize: hyphens → underscores, strip common prefixes (seed-, etc.)
  const normalized = templateId.replace(/^seed-/, '').replace(/-/g, '_');
  return MODEL_TEMPLATES.find((t) => t.id === normalized);
}
