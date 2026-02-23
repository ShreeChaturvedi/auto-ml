import type { ModelTemplate } from '../types/model.js';

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

export function getModelTemplate(templateId: string): ModelTemplate | undefined {
  return MODEL_TEMPLATES.find((template) => template.id === templateId);
}
