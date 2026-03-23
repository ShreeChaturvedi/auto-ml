import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { env } from '../config.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import type { ModelRecord } from '../types/model.js';

const modelRepository = createModelRepository(env.modelMetadataPath);

const FEATURES = ['age', 'income', 'credit_score', 'years_employed', 'debt_ratio'];
const FIXED_DATASET_ID = '00000000-0000-0000-0000-000000000001';

type TaskType = 'classification' | 'regression' | 'clustering';

interface SeedSpec {
  name: string;
  taskType: 'classification' | 'regression';
  templateId: string;
  algorithm: string;
  metrics: Record<string, number>;
}

const SEED_SPECS: SeedSpec[] = [
  { name: 'RF Classifier v1', taskType: 'classification', templateId: 'random_forest_classifier', algorithm: 'RandomForestClassifier', metrics: { accuracy: 0.94, f1: 0.91, precision: 0.92, recall: 0.90 } },
  { name: 'KNN Baseline', taskType: 'classification', templateId: 'knn_classifier', algorithm: 'KNeighborsClassifier', metrics: { accuracy: 0.87, f1: 0.83, precision: 0.85, recall: 0.81 } },
  { name: 'Logistic Regression', taskType: 'classification', templateId: 'logistic_regression', algorithm: 'LogisticRegression', metrics: { accuracy: 0.91, f1: 0.88, precision: 0.89, recall: 0.87 } },
  { name: 'Gradient Boost', taskType: 'classification', templateId: 'gradient_boosting_classifier', algorithm: 'GradientBoostingClassifier', metrics: { accuracy: 0.96, f1: 0.94, precision: 0.95, recall: 0.93 } },
  { name: 'Linear Regression', taskType: 'regression', templateId: 'linear_regression', algorithm: 'LinearRegression', metrics: { r2: 0.85, mse: 0.12, mae: 0.28, rmse: 0.35 } },
];

// -- evaluation.json builders --

function classificationEvaluation(metrics: Record<string, number>) {
  return {
    taskType: 'classification' as const,
    timestamp: new Date().toISOString(),
    computeMs: 1200 + Math.floor(Math.random() * 800),
    confusion_matrix: {
      matrix: [[420, 30], [25, 525]],
      matrix_normalized: [[0.93, 0.07], [0.05, 0.95]],
      labels: ['0', '1'],
    },
    roc_curves: {
      '1': {
        fpr: [0, 0.01, 0.02, 0.05, 0.08, 0.12, 0.18, 0.25, 0.45, 0.7, 1.0],
        tpr: [0, 0.15, 0.35, 0.55, 0.72, 0.82, 0.90, 0.95, 0.98, 0.99, 1.0],
        auc: metrics.accuracy ?? 0.94,
      },
    },
    precision_recall_curves: {
      '1': {
        precision: [1.0, 0.98, 0.96, 0.94, 0.91, 0.88, 0.84, 0.78, 0.65, 0.50, 0.48],
        recall: [0, 0.10, 0.25, 0.45, 0.60, 0.72, 0.82, 0.90, 0.95, 0.98, 1.0],
        ap: metrics.precision ?? 0.92,
      },
    },
    classification_report: {
      '0': { precision: metrics.precision ?? 0.92, recall: metrics.recall ?? 0.90, f1: metrics.f1 ?? 0.91, support: 450 },
      '1': { precision: (metrics.precision ?? 0.92) + 0.01, recall: (metrics.recall ?? 0.90) + 0.02, f1: (metrics.f1 ?? 0.91) + 0.01, support: 550 },
      accuracy: metrics.accuracy ?? 0.94,
    },
    class_distribution: {
      train: { '0': 360, '1': 440 },
      test: { '0': 90, '1': 110 },
    },
    feature_importance: buildFeatureImportance(),
    learning_curve: buildLearningCurve(metrics.accuracy ?? 0.94),
    cross_validation: buildCrossValidation(metrics.accuracy ?? 0.94, 'accuracy'),
  };
}

function regressionEvaluation(metrics: Record<string, number>) {
  const yTrue = Array.from({ length: 20 }, (_, i) => 2.0 + i * 0.3 + (Math.random() - 0.5) * 0.4);
  const yPred = yTrue.map(v => v + (Math.random() - 0.5) * 0.6);
  const residuals = yTrue.map((v, i) => v - yPred[i]);
  return {
    taskType: 'regression' as const,
    timestamp: new Date().toISOString(),
    computeMs: 900 + Math.floor(Math.random() * 600),
    residuals: { y_true: yTrue, y_pred: yPred, residuals },
    residual_histogram: {
      bin_edges: [-1.0, -0.8, -0.6, -0.4, -0.2, 0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
      counts: [1, 2, 3, 4, 5, 5, 4, 3, 2, 1],
    },
    feature_importance: buildFeatureImportance(),
    learning_curve: buildLearningCurve(metrics.r2 ?? 0.85),
    cross_validation: buildCrossValidation(metrics.r2 ?? 0.85, 'r2'),
  };
}

function buildFeatureImportance() {
  return {
    model_based: {
      features: FEATURES,
      importances: [0.28, 0.24, 0.22, 0.15, 0.11],
      std: [0.03, 0.02, 0.03, 0.02, 0.01],
    },
    permutation: {
      features: FEATURES,
      importances_mean: [0.26, 0.22, 0.20, 0.18, 0.14],
      importances_std: [0.04, 0.03, 0.03, 0.02, 0.02],
    },
  };
}

function buildLearningCurve(peakScore: number) {
  const sizes = [50, 100, 200, 500, 1000];
  const base = peakScore - 0.15;
  const increments = [0, 0.04, 0.08, 0.12, 0.15];
  return {
    train_sizes: sizes,
    train_scores_mean: increments.map((inc) => Math.min(base + inc + 0.03, 1.0)),
    train_scores_std: [0.04, 0.03, 0.02, 0.015, 0.01],
    test_scores_mean: increments.map((inc) => Math.min(base + inc, 1.0)),
    test_scores_std: [0.06, 0.05, 0.04, 0.025, 0.02],
  };
}

function buildCrossValidation(mean: number, scoring: string) {
  const offsets = [-0.02, 0.01, -0.01, 0.02, 0.0];
  const scores = offsets.map(o => mean + o);
  return {
    scores,
    mean,
    std: 0.015,
    scoring,
  };
}

function clusteringEvaluation(metrics: Record<string, number>) {
  return {
    taskType: 'clustering' as const,
    timestamp: new Date().toISOString(),
    computeMs: 800 + Math.floor(Math.random() * 500),
    feature_importance: buildFeatureImportance(),
    learning_curve: buildLearningCurve(metrics.silhouette ?? 0.65),
    cross_validation: buildCrossValidation(metrics.silhouette ?? 0.65, 'silhouette'),
  };
}

// -- shap.json builder --

function buildShap(taskType: TaskType) {
  const nSamples = 20;
  const nFeatures = FEATURES.length;
  const values = Array.from({ length: nSamples }, () =>
    Array.from({ length: nFeatures }, () => parseFloat(((Math.random() - 0.5) * 0.4).toFixed(4)))
  );
  const data = Array.from({ length: nSamples }, () =>
    [30 + Math.floor(Math.random() * 40), 30000 + Math.floor(Math.random() * 70000), 500 + Math.floor(Math.random() * 350), Math.floor(Math.random() * 20), parseFloat((Math.random() * 0.8).toFixed(2))]
  );
  const meanAbs = FEATURES.map((_, fi) => {
    const col = values.map(row => Math.abs(row[fi]));
    return parseFloat((col.reduce((a, b) => a + b, 0) / nSamples).toFixed(4));
  });
  return {
    values,
    base_values: taskType === 'classification' ? 0.5 : taskType === 'regression' ? 4.2 : 0.0,
    data,
    feature_names: FEATURES,
    mean_abs_values: meanAbs,
  };
}

const ALGORITHM_TO_TEMPLATE: Record<string, string> = {
  'RandomForestClassifier': 'random_forest_classifier',
  'LogisticRegression': 'logistic_regression',
  'KNeighborsClassifier': 'knn_classifier',
  'GradientBoostingClassifier': 'gradient_boosting_classifier',
  'LinearRegression': 'linear_regression',
  'Ridge': 'ridge_regression',
  'RandomForestRegressor': 'random_forest_regressor',
  'KMeans': 'kmeans',
};

/** Randomize a value within +/- range */
function jitter(base: number, range: number) {
  return parseFloat((base + (Math.random() - 0.5) * 2 * range).toFixed(4));
}

function randomMetrics(taskType: TaskType): Record<string, number> {
  switch (taskType) {
    case 'classification':
      return { accuracy: jitter(0.91, 0.055), f1: jitter(0.88, 0.055), precision: jitter(0.89, 0.05), recall: jitter(0.87, 0.05) };
    case 'regression':
      return { r2: jitter(0.85, 0.06), mse: jitter(0.12, 0.04), mae: jitter(0.28, 0.06), rmse: jitter(0.35, 0.06) };
    case 'clustering':
      return { silhouette: jitter(0.62, 0.1), calinski_harabasz: jitter(320, 60), davies_bouldin: jitter(0.75, 0.15) };
  }
}

export async function seedOneModel(projectId: string, options: {
  name: string;
  taskType: TaskType;
  algorithm: string;
}): Promise<ModelRecord> {
  const metrics = randomMetrics(options.taskType);
  const record = await modelRepository.create({
    projectId,
    datasetId: FIXED_DATASET_ID,
    name: options.name,
    templateId: ALGORITHM_TO_TEMPLATE[options.algorithm] ?? `seed-${options.algorithm.toLowerCase().replace(/\s+/g, '_')}`,
    taskType: options.taskType,
    library: 'sklearn',
    algorithm: options.algorithm,
    parameters: {},
    metrics,
    status: 'completed',
    trainingMs: 1000 + Math.floor(Math.random() * 4000),
    targetColumn: options.taskType === 'clustering' ? undefined : 'target',
    featureColumns: FEATURES,
    sampleCount: 1000,
    evaluationStatus: 'ready',
  });

  const artifactDir = join(env.modelStorageDir, record.modelId);
  await mkdir(artifactDir, { recursive: true });

  const evaluation = options.taskType === 'classification'
    ? classificationEvaluation(metrics)
    : options.taskType === 'regression'
      ? regressionEvaluation(metrics)
      : clusteringEvaluation(metrics);

  const shap = buildShap(options.taskType);

  await Promise.all([
    writeFile(join(artifactDir, 'evaluation.json'), JSON.stringify(evaluation, null, 2), 'utf8'),
    writeFile(join(artifactDir, 'shap.json'), JSON.stringify(shap, null, 2), 'utf8'),
  ]);

  return record;
}

export async function seedModels(projectId: string): Promise<ModelRecord[]> {
  const created: ModelRecord[] = [];

  for (const spec of SEED_SPECS) {
    const record = await modelRepository.create({
      projectId,
      datasetId: FIXED_DATASET_ID,
      name: spec.name,
      templateId: spec.templateId,
      taskType: spec.taskType,
      library: 'sklearn',
      algorithm: spec.algorithm,
      parameters: {},
      metrics: spec.metrics,
      status: 'completed',
      trainingMs: 1000 + Math.floor(Math.random() * 4000),
      targetColumn: 'target',
      featureColumns: FEATURES,
      sampleCount: 1000,
      evaluationStatus: 'ready',
    });

    const artifactDir = join(env.modelStorageDir, record.modelId);
    await mkdir(artifactDir, { recursive: true });

    const evaluation = spec.taskType === 'classification'
      ? classificationEvaluation(spec.metrics)
      : regressionEvaluation(spec.metrics);

    const shap = buildShap(spec.taskType);

    await Promise.all([
      writeFile(join(artifactDir, 'evaluation.json'), JSON.stringify(evaluation, null, 2), 'utf8'),
      writeFile(join(artifactDir, 'shap.json'), JSON.stringify(shap, null, 2), 'utf8'),
    ]);

    created.push(record);
  }

  return created;
}
