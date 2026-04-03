import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { env } from '../config.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import type { ModelRecord } from '../types/model.js';

const modelRepository = createModelRepository(env.modelMetadataPath);
const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

const FEATURES = ['age', 'income', 'credit_score', 'years_employed', 'debt_ratio'];
const FALLBACK_DATASET_ID = '00000000-0000-0000-0000-000000000001';

const FEATURE_TYPES: Record<string, 'float' | 'int' | 'str'> = {
  age: 'int',
  income: 'float',
  credit_score: 'int',
  years_employed: 'int',
  debt_ratio: 'float',
};

const SAMPLE_REQUEST: Record<string, unknown> = {
  age: 35,
  income: 55000.0,
  credit_score: 720,
  years_employed: 8,
  debt_ratio: 0.32,
};

/** Resolve the project's actual dataset so seeded models reference real data. */
async function resolveDataset(projectId: string) {
  const datasets = await datasetRepository.listByProject(projectId);
  return datasets.length > 0 ? datasets[0] : undefined;
}

/** Infer target column: explicit "target" column, else last column (standard ML convention). */
export function inferTargetColumn(columns: { name: string }[]): string {
  if (columns.length === 0) return 'target';
  const explicit = columns.find((c) => c.name.toLowerCase() === 'target');
  if (explicit) return explicit.name;
  return columns[columns.length - 1].name;
}

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

// -- baseline.json builder --

function buildBaselineJson() {
  return {
    numeric: {
      age: { mean: 38.5, std: 12.3, min: 18, max: 75, q25: 28, q50: 37, q75: 49, histogram: { bins: [18, 23.85, 29.7, 35.55, 41.4, 47.25, 53.1, 58.95, 64.8, 70.65, 75], counts: [45, 78, 120, 135, 110, 95, 72, 48, 32, 15] } },
      income: { mean: 52000, std: 22000, min: 15000, max: 150000, q25: 35000, q50: 48000, q75: 65000, histogram: { bins: [15000, 28500, 42000, 55500, 69000, 82500, 96000, 109500, 123000, 136500, 150000], counts: [40, 95, 150, 180, 130, 85, 55, 30, 18, 7] } },
      credit_score: { mean: 690, std: 85, min: 350, max: 850, q25: 630, q50: 700, q75: 760, histogram: { bins: [350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850], counts: [8, 15, 30, 55, 90, 140, 180, 200, 150, 82] } },
      years_employed: { mean: 7.2, std: 5.8, min: 0, max: 35, q25: 2, q50: 6, q75: 11, histogram: { bins: [0, 3.5, 7, 10.5, 14, 17.5, 21, 24.5, 28, 31.5, 35], counts: [120, 180, 150, 130, 100, 70, 45, 25, 12, 5] } },
      debt_ratio: { mean: 0.35, std: 0.18, min: 0, max: 0.95, q25: 0.2, q50: 0.33, q75: 0.48, histogram: { bins: [0, 0.095, 0.19, 0.285, 0.38, 0.475, 0.57, 0.665, 0.76, 0.855, 0.95], counts: [35, 70, 120, 160, 140, 110, 80, 50, 25, 10] } },
    },
    categorical: {},
    prediction_distribution: { '0': 420, '1': 580 },
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
  const dataset = await resolveDataset(projectId);
  const datasetId = dataset?.datasetId ?? FALLBACK_DATASET_ID;
  const targetColumn = options.taskType === 'clustering'
    ? undefined
    : inferTargetColumn(dataset?.columns ?? []);
  const record = await modelRepository.create({
    projectId,
    datasetId,
    name: options.name,
    templateId: ALGORITHM_TO_TEMPLATE[options.algorithm] ?? `seed-${options.algorithm.toLowerCase().replace(/\s+/g, '_')}`,
    taskType: options.taskType,
    library: 'sklearn',
    algorithm: options.algorithm,
    parameters: {},
    metrics,
    status: 'completed',
    trainingMs: 1000 + Math.floor(Math.random() * 4000),
    targetColumn,
    featureColumns: FEATURES,
    sampleCount: 1000,
    evaluationStatus: 'ready',
    featureTypes: FEATURE_TYPES,
    sampleRequest: SAMPLE_REQUEST,
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
    writeFile(join(artifactDir, 'baseline.json'), JSON.stringify(buildBaselineJson(), null, 2), 'utf8'),
  ]);

  return record;
}

export async function seedModels(projectId: string): Promise<ModelRecord[]> {
  const created: ModelRecord[] = [];
  const dataset = await resolveDataset(projectId);
  const datasetId = dataset?.datasetId ?? FALLBACK_DATASET_ID;
  const targetColumn = inferTargetColumn(dataset?.columns ?? []);

  for (const spec of SEED_SPECS) {
    const record = await modelRepository.create({
      projectId,
      datasetId,
      name: spec.name,
      templateId: spec.templateId,
      taskType: spec.taskType,
      library: 'sklearn',
      algorithm: spec.algorithm,
      parameters: {},
      metrics: spec.metrics,
      status: 'completed',
      trainingMs: 1000 + Math.floor(Math.random() * 4000),
      targetColumn,
      featureColumns: FEATURES,
      sampleCount: 1000,
      evaluationStatus: 'ready',
      featureTypes: FEATURE_TYPES,
      sampleRequest: SAMPLE_REQUEST,
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
      writeFile(join(artifactDir, 'baseline.json'), JSON.stringify(buildBaselineJson(), null, 2), 'utf8'),
    ]);

    created.push(record);
  }

  return created;
}
