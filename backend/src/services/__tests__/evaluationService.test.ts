import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted state                                                      */
/* ------------------------------------------------------------------ */

const hoisted = vi.hoisted(() => {
  const mockOrchestrateContainerExecution = vi.fn();
  const mockCopyArtifactsToPermanentStorage = vi.fn();
  const mockGetById = vi.fn();
  const mockUpdate = vi.fn();
  const mockDatasetGetById = vi.fn();
  const mockWorkflowListRuns = vi.fn();
  const mockWorkflowGetRun = vi.fn();

  return {
    mockOrchestrateContainerExecution,
    mockCopyArtifactsToPermanentStorage,
    mockGetById,
    mockUpdate,
    mockDatasetGetById,
    mockWorkflowListRuns,
    mockWorkflowGetRun,
  };
});

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('../../utils/containerOrchestrator.js', () => ({
  orchestrateContainerExecution: hoisted.mockOrchestrateContainerExecution,
  copyArtifactsToPermanentStorage: hoisted.mockCopyArtifactsToPermanentStorage,
}));

vi.mock('../../repositories/modelRepository.js', () => ({
  createModelRepository: () => ({
    getById: hoisted.mockGetById,
    update: hoisted.mockUpdate,
  }),
}));

vi.mock('../../repositories/datasetRepository.js', () => ({
  createDatasetRepository: () => ({
    getById: hoisted.mockDatasetGetById,
    // listByProject is used by the featureColumns-superset fallback
    // added in #342. Default to empty so the fallback is a no-op in
    // tests that don't explicitly stub it.
    listByProject: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../workflows/repository/index.js', () => ({
  getWorkflowRepository: () => ({
    listRuns: hoisted.mockWorkflowListRuns,
    getRun: hoisted.mockWorkflowGetRun,
  }),
}));

vi.mock('../../config.js', () => ({
  env: {
    datasetMetadataPath: '/tmp/test-datasets.json',
    modelMetadataPath: '/tmp/test-models.json',
    modelStorageDir: '/tmp/test-model-storage',
    executionWorkspaceDir: '/tmp/test-workspaces',
    datasetStorageDir: '/tmp/test-datasets',
    executionTimeoutMs: 30000,
  },
}));

// Mock fs/promises to avoid actual file operations
vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('{}'),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

import { buildEvaluationScript, runEvaluation } from '../evaluationService.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const {
  mockOrchestrateContainerExecution,
  mockCopyArtifactsToPermanentStorage,
  mockGetById,
  mockUpdate,
  mockDatasetGetById,
  mockWorkflowListRuns,
  mockWorkflowGetRun,
} = hoisted;

function makeModelRecord(overrides: Record<string, unknown> = {}) {
  return {
    modelId: 'test-model-id',
    projectId: 'test-project',
    datasetId: 'test-dataset',
    name: 'Test Model',
    templateId: 'random-forest',
    taskType: 'classification',
    library: 'sklearn',
    algorithm: 'RandomForestClassifier',
    parameters: { n_estimators: 100 },
    metrics: { accuracy: 0.95 },
    status: 'completed',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    targetColumn: 'target',
    artifact: {
      filename: 'model.joblib',
      path: '/tmp/test-model-storage/test-model-id/model.joblib',
      size: 1024,
    },
    evaluationStatus: 'pending',
    ...overrides,
  };
}

function makeContainer() {
  return {
    id: 'container-1',
    containerId: 'docker-123',
    projectId: 'test-project',
    pythonVersion: '3.11',
    workspacePath: '/tmp/test-workspaces/test-project/model-runtime',
    kernelGatewayPort: 8888,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  };
}

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                   */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockWorkflowListRuns.mockResolvedValue([]);
  mockWorkflowGetRun.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe('buildEvaluationScript', () => {
  it('returns valid Python for classification task type', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m1/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m1',
      taskType: 'classification',
      targetColumn: 'target',
      testSize: 0.2,
    });

    // Must contain classification-specific code
    expect(script).toContain('confusion_matrix');
    expect(script).toContain('classification_report');
    expect(script).toContain('roc_curve');
    expect(script).toContain('precision_recall_curve');
    expect(script).toContain('calibration_curve');
    expect(script).toContain('class_distribution');
    expect(script).toContain('predict_proba');

    // Must contain general evaluation code
    expect(script).toContain('joblib.load');
    expect(script).toContain('def date_to_ordinal(X_col):');
    expect(script).toContain('pd.read_csv');
    expect(script).toContain('permutation_importance');
    expect(script).toContain('learning_curve');
    expect(script).toContain('cross_val_score');
    expect(script).toContain('_pi_max_samples = min(400, len(X_test))');
    expect(script).toContain('n_repeats=3');
    expect(script).toContain('max_samples = min(1000, len(X))');
    expect(script).toContain('_lc_cv = min(3, len(X_lc))');
    expect(script).toContain('_cv_max_samples = min(1500, len(X))');
    expect(script).toContain('cv=_cv_splits');
    expect(script).toContain('predictions.parquet');
    expect(script).toContain('predictions.csv');
    expect(script).toContain('result["predictionsArtifact"] = predictions_filename');
    expect(script).toContain('evaluation.json');

    // Classification scripts now also embed a runtime safety-net that emits
    // residual-based regression metrics when y_test turns out to be continuous.
    // The runtime `effective_task_type` guard gates which path actually runs.
    expect(script).toContain('_is_continuous_target');
    expect(script).toContain('effective_task_type');
    expect(script).toContain('residual_histogram');
    expect(script).toContain('residuals_arr');
  });

  it('returns valid Python for regression task type', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m2/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m2',
      taskType: 'regression',
      targetColumn: 'price',
      testSize: 0.2,
    });

    // Must contain regression-specific code
    expect(script).toContain('residuals');
    expect(script).toContain('residual_histogram');
    expect(script).toContain('np.histogram');

    // Must NOT contain classification-specific code
    expect(script).not.toContain('confusion_matrix');
    expect(script).not.toContain('roc_curve');
    expect(script).not.toContain('calibration_curve');

    // Must contain general evaluation code
    expect(script).toContain('permutation_importance');
    expect(script).toContain('learning_curve');
    expect(script).toContain('cross_val_score');
  });

  it('includes SHAP computation in try/except', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m3/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m3',
      taskType: 'classification',
      targetColumn: 'target',
      testSize: 0.2,
    });

    expect(script).toContain('shap');
    expect(script).toContain('try:');
    expect(script).toContain('except');
    expect(script).toContain('TreeExplainer');
    expect(script).toContain('LinearExplainer');
    expect(script).toContain('shap.json');
    expect(script).toContain('result["warnings"] = []');
    expect(script).toContain('Feature importance skipped:');
    expect(script).toContain('Learning curve skipped:');
    expect(script).toContain('Cross-validation skipped:');
    // Memory safety: subsample SHAP to 200 rows and use bounded background size
    expect(script).toContain('X_shap = X_test.iloc[:200] if len(X_test) > 200 else X_test');
    expect(script).toContain('X_train_shap = X_train.iloc[:200] if len(X_train) > 200 else X_train');
    expect(script).toContain('def _sanitize_json_value(value):');
    expect(script).toContain('json.dump(_sanitize_json_value(result), f, allow_nan=False)');
    expect(script).toContain('json.dump(_sanitize_json_value(shap_result), f, allow_nan=False)');
  });

  it('skips expensive secondary analysis for instance-based, kernel, and mlp estimators', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m4/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m4',
      taskType: 'classification',
      targetColumn: 'target',
      testSize: 0.2,
    });

    expect(script).toContain('expensive_analysis_model = (');
    expect(script).toContain('"neighbors" in fitted_model_module');
    expect(script).toContain('fitted_model_name in {"svc", "svr", "nusvc", "nusvr"}');
    expect(script).toContain('fitted_model_name.startswith("mlp")');
    expect(script).toContain('Permutation importance skipped for expensive estimator family');
    expect(script).toContain('Learning curve skipped for expensive estimator family');
    expect(script).toContain('Cross-validation skipped for expensive estimator family');
    expect(script).toContain('SHAP skipped for expensive estimator family');
    expect(script).toContain('evaluation_sample_warning = None');
    expect(script).toContain('expensive_eval_max_samples = 1000');
    expect(script).toContain('expensive_eval_max_samples = min(expensive_eval_max_samples, 250)');
    expect(script).toContain('expensive_eval_max_samples = min(expensive_eval_max_samples, 500)');
    expect(script).toContain('if expensive_analysis_model and len(X_test) > expensive_eval_max_samples:');
    expect(script).toContain('Evaluation used a capped holdout sample of');
    expect(script).toContain('result["evaluationSample"] = {');
  });

  it('resolves the fitted estimator from model, regressor, classifier, or the final pipeline step', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m5/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m5',
      taskType: 'regression',
      targetColumn: 'target',
      testSize: 0.2,
    });

    expect(script).toContain('fitted_model = pipeline.named_steps.get("model")');
    expect(script).toContain('fitted_model = pipeline.named_steps.get("regressor")');
    expect(script).toContain('fitted_model = pipeline.named_steps.get("classifier")');
    expect(script).toContain('fitted_model = pipeline.steps[-1][1]');
    expect(script).toContain('fitted_model._get_cat_feature_indices()');
    expect(script).toContain('fillna("__MISSING__").astype(str)');
    expect(script).toContain('requires_refit_categorical_metadata = is_direct_catboost and len(categorical_columns) > 0');
    expect(script).toContain('Learning curve skipped: direct CatBoost models with raw categorical columns need training-time cat_features metadata for refit.');
    expect(script).toContain('Cross-validation skipped: direct CatBoost models with raw categorical columns need training-time cat_features metadata for refit.');
  });

  it('defensively unwraps dict-wrapped model artifacts before calling predict', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m5/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m5',
      taskType: 'classification',
      targetColumn: 'target',
      testSize: 0.2,
    });

    expect(script).toContain('if isinstance(pipeline, dict):');
    expect(script).toContain("for _inner_key in ('pipeline', 'model', 'estimator', 'classifier', 'regressor', 'best_estimator')");
    expect(script).toContain('Saved model artifact is a dict with no predict-capable inner value');
  });

  it('auto-derives X_train/X_test/y_train/y_test from train_df/test_df when workflow prep is DataFrame-centric (pytorch_tabular)', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m-pt/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m-pt',
      taskType: 'regression',
      targetColumn: 'usage_log1p',
      testSize: 0.2,
      workflowPrepSegments: [
        'import pandas as pd',
        'df = pd.read_csv(WORKFLOW_DATASET_PATH)\ntrain_df = df.iloc[:5000]\ntest_df = df.iloc[5000:]',
      ],
    });

    // Target col literal injected into the auto-derive guard
    expect(script).toContain('_EVAL_TARGET_COL = "usage_log1p"');
    expect(script).toContain('_EVAL_KNOWN_FEATURES = []');
    // Auto-derive path triggers only when X_train is missing but train_df/test_df exist
    expect(script).toContain('if "X_train" not in globals() and "train_df" in globals() and "test_df" in globals():');
    expect(script).toContain('_common_cols = [c for c in _train_cols if c in _test_cols]');
    // Derivation lines (use _resolved_target, not raw _EVAL_TARGET_COL)
    expect(script).toContain('X_train = train_df.drop(columns=[_resolved_target])');
    expect(script).toContain('X_test = test_df.drop(columns=[_resolved_target])');
    expect(script).toContain('y_train = train_df[_resolved_target]');
    expect(script).toContain('y_test = test_df[_resolved_target]');
    // The strict-required-vars check still runs after the auto-derive
    expect(script).toContain('Workflow evaluation prep did not define required variables');
  });

  it('auto-derives a holdout split from X/y when workflow prep only leaves cross-validation variables', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m-cv/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m-cv',
      taskType: 'classification',
      targetColumn: 'target',
      testSize: 0.25,
      workflowPrepSegments: [
        'import pandas as pd',
        'df = pd.read_csv(WORKFLOW_DATASET_PATH)\nX = df.drop(columns=["target"])\ny = df["target"]',
      ],
    });

    expect(script).toContain('declared_task_type = "classification"');
    expect(script).toContain('test_size = 0.25');
    expect(script).toContain('if missing_runtime_vars and "X" in globals() and "y" in globals():');
    expect(script).toContain('X = pd.DataFrame(X)');
    expect(script).toContain('y = pd.Series(np.asarray(y).ravel(), name=_EVAL_TARGET_COL or "target")');
    expect(script).toContain('_eval_stratify = y');
    expect(script).toContain('X_train, X_test, y_train, y_test = train_test_split(');
    expect(script).toContain('Auto-derived X_train/X_test from X/y');
  });

  it('inlines the model record featureColumns list so the auto-derive resolver can find FE-derived targets', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m-fe/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m-fe',
      taskType: 'regression',
      targetColumn: 'usage_count',
      testSize: 0.2,
      workflowPrepSegments: ['df = pd.read_csv(WORKFLOW_DATASET_PATH)'],
      featureColumns: ['user_id', 'company_id', 'session_minutes'],
    });

    expect(script).toContain('_EVAL_KNOWN_FEATURES = ["user_id","company_id","session_minutes"]');
    expect(script).toContain('_candidates = [c for c in _common_cols if c not in _EVAL_KNOWN_FEATURES]');
  });

  it('normalizes DataFrame y_pred outputs (pytorch_tabular) preferring prediction column and skipping probability columns', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m6/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m6',
      taskType: 'classification',
      targetColumn: 'target',
      testSize: 0.2,
    });

    expect(script).toContain('if hasattr(y_pred, "columns"):');
    expect(script).toContain('if _name in ("prediction", "yhat"):');
    expect(script).toContain('"probability" in _lower or _lower.endswith("_proba")');
    expect(script).toContain('y_pred = y_pred[_label_col].values');
  });

  it('guards .predict against non-sklearn estimators with a clear error', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m7/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m7',
      taskType: 'regression',
      targetColumn: 'target',
      testSize: 0.2,
    });

    expect(script).toContain('if not hasattr(pipeline, "predict") or not callable(getattr(pipeline, "predict", None)):');
    expect(script).toContain('Saved model does not implement .predict(X_test)');
    expect(script).toContain('try:\n    y_pred = pipeline.predict(X_test)');
    expect(script).toContain('if isinstance(y_pred, tuple) and len(y_pred) >= 1:');
  });

  it('normalizes y_test/y_train to pandas Series for .value_counts() / .values compatibility', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m8/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m8',
      taskType: 'classification',
      targetColumn: 'target',
      testSize: 0.2,
    });

    expect(script).toContain('if not hasattr(y_test, "value_counts"):');
    expect(script).toContain('y_test = pd.Series(np.asarray(y_test).ravel(), name="y_test")');
    expect(script).toContain('if not hasattr(y_train, "value_counts"):');
  });

  it('uses np.asarray defensively for regression residuals to avoid .values on ndarray', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m9/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m9',
      taskType: 'regression',
      targetColumn: 'target',
      testSize: 0.2,
    });

    expect(script).toContain('_y_true_arr = np.asarray(y_test).ravel()');
    expect(script).toContain('_y_pred_arr = np.asarray(y_pred).ravel()');
    expect(script).toContain('residuals_arr = (_y_true_arr - _y_pred_arr).tolist()');
    // Predictions artifact also uses defensive conversion
    expect(script).toContain('pred_df["y_true"] = np.asarray(y_test).ravel()');
    expect(script).toContain('pred_df["y_pred"] = np.asarray(y_pred).ravel()');
  });

  it('loads raw torch.save artifacts via torch.load and wraps them in a predict adapter', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m-torch/model.pt',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m-torch',
      taskType: 'regression',
      targetColumn: 'target',
      testSize: 0.2,
    });

    expect(script).toContain('except Exception as _load_err:');
    expect(script).toContain('_is_torch_artifact =');
    expect(script).toContain('torch.load(_EVAL_MODEL_PATH, map_location="cpu", weights_only=False)');
    expect(script).toContain('class _TorchPredictAdapter:');
    expect(script).toContain('full nn.Module must be saved');
    expect(script).toContain('def predict(self, X):');
  });

  it('detects multi-output predictions and emits per-output metrics instead of raveling to 1-D', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m-multi/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m-multi',
      taskType: 'regression',
      targetColumn: 'target',
      testSize: 0.2,
    });

    expect(script).toContain('_yp_raw = np.asarray(y_pred)');
    expect(script).toContain('_is_multi_output = _yp_raw.ndim > 1 and _yp_raw.shape[1] > 1');
    expect(script).toContain('if not _is_multi_output:');
    expect(script).toContain('y_pred = _yp_raw  # preserve 2-D');
    expect(script).toContain('result["per_output_metrics"] = _per_output');
  });

  it('has pseudo-LC and pseudo-CV fallbacks for non-clonable estimators (pytorch_tabular, Prophet)', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m-lcfb/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m-lcfb',
      taskType: 'regression',
      targetColumn: 'target',
      testSize: 0.2,
    });

    // CV fallback
    expect(script).toContain('single_fit_holdout');
    expect(script).toContain('_manual_scores.append');
    // LC fallback
    expect(script).toContain('single_fit_pseudo');
    expect(script).toContain('Learning curve computed via single-fit pseudo method');
  });

  it('emits forecasting metrics block (MAPE/sMAPE/MASE/horizon) when taskType=forecasting', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m-fc/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m-fc',
      taskType: 'forecasting',
      targetColumn: 'sales',
      testSize: 0.2,
    });

    expect(script).toContain('if declared_task_type == "forecasting"');
    expect(script).toContain('forecasting_metrics');
    expect(script).toContain('_smape = float');
    expect(script).toContain('_mase =');
    expect(script).toContain('horizon_series');
    expect(script).toContain('residual_series');
  });

  it('emits clustering metrics block (silhouette/davies_bouldin/calinski_harabasz) when taskType=clustering', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m-cl/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m-cl',
      taskType: 'clustering',
      targetColumn: '',
      testSize: 0.2,
    });

    expect(script).toContain('if declared_task_type == "clustering"');
    expect(script).toContain('silhouette_score');
    expect(script).toContain('davies_bouldin_score');
    expect(script).toContain('calinski_harabasz_score');
    expect(script).toContain('clustering_metrics');
    expect(script).toContain('PCA(n_components=2');
  });
});

describe('runEvaluation', () => {
  it('sets evaluationStatus to computing then ready on success', async () => {
    const model = makeModelRecord();
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockResolvedValue({
      container,
      executionResult: {
        status: 'success',
        stderr: '',
        executionMs: 5000,
      },
    });

    await runEvaluation('test-model-id');

    // Verify status transitions
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    // First call: set to 'computing'
    const firstUpdateCall = mockUpdate.mock.calls[0];
    expect(firstUpdateCall[0]).toBe('test-model-id');
    const firstResult = firstUpdateCall[1](model);
    expect(firstResult.evaluationStatus).toBe('computing');

    // Second call: set to 'ready'
    const secondUpdateCall = mockUpdate.mock.calls[1];
    expect(secondUpdateCall[0]).toBe('test-model-id');
    const secondResult = secondUpdateCall[1](model);
    expect(secondResult.evaluationStatus).toBe('ready');
    expect(secondResult.evaluationComputedAt).toBeDefined();
  });

  it('sets evaluationStatus to failed on Docker error', async () => {
    const model = makeModelRecord();
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockResolvedValue({
      container,
      executionResult: {
        status: 'error',
        stderr: 'RuntimeError: CUDA out of memory',
        error: 'Execution failed',
        executionMs: 1000,
      },
    });

    await runEvaluation('test-model-id');

    // Verify status transitions
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    // First call: set to 'computing'
    const firstResult = mockUpdate.mock.calls[0][1](model);
    expect(firstResult.evaluationStatus).toBe('computing');

    // Second call: set to 'failed'
    const secondResult = mockUpdate.mock.calls[1][1](model);
    expect(secondResult.evaluationStatus).toBe('failed');
    expect(secondResult.evaluationError).toContain('CUDA out of memory');
  });

  it('strips warning spam from persisted evaluation errors', async () => {
    const model = makeModelRecord();
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockResolvedValue({
      container,
      executionResult: {
        status: 'error',
        stderr: '<cell>:45: FutureWarning: Series.view is deprecated\\nordinal = (dt.view("int64") / 1e9 / 86400).astype(float)\\nTraceback (most recent call last):\\nImportError: Unable to find a usable engine',
        error: 'Execution failed',
        executionMs: 1000,
      },
    });

    await runEvaluation('test-model-id');

    const failedResult = mockUpdate.mock.calls[1][1](model);
    expect(failedResult.evaluationStatus).toBe('failed');
    expect(failedResult.evaluationError).toContain('Traceback');
    expect(failedResult.evaluationError).toContain('ImportError');
    expect(failedResult.evaluationError).not.toContain('Series.view is deprecated');
    expect(failedResult.evaluationError).not.toContain('ordinal =');
  });

  it('prefers the execution timeout message over stderr warnings when evaluation times out', async () => {
    const model = makeModelRecord();
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockResolvedValue({
      container,
      executionResult: {
        status: 'timeout',
        stderr: '/usr/local/lib/python3.11/site-packages/sklearn/neural_network/_multilayer_perceptron.py:690: ConvergenceWarning: example',
        error: 'Execution timed out after 30000ms',
        executionMs: 30000,
      },
    });

    await runEvaluation('test-model-id');

    const failedResult = mockUpdate.mock.calls[1][1](model);
    expect(failedResult.evaluationStatus).toBe('failed');
    expect(failedResult.evaluationError).toContain('Execution timed out after 30000ms');
    expect(failedResult.evaluationError).not.toContain('ConvergenceWarning');
  });

  it('copies artifacts to modelStorageDir on success', async () => {
    const model = makeModelRecord();
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockResolvedValue({
      container,
      executionResult: {
        status: 'success',
        stderr: '',
        executionMs: 5000,
      },
    });
    mockCopyArtifactsToPermanentStorage.mockResolvedValue(undefined);

    await runEvaluation('test-model-id');

    // Guard: verify orchestration was actually invoked
    expect(mockOrchestrateContainerExecution).toHaveBeenCalledTimes(1);

    // Verify copyArtifactsToPermanentStorage was called
    expect(mockCopyArtifactsToPermanentStorage).toHaveBeenCalledTimes(1);

    // Get the call arguments
    const callArgs = mockCopyArtifactsToPermanentStorage.mock.calls[0];
    const [modelId, copyContainer, artifacts] = callArgs;

    // Verify arguments
    expect(modelId).toBe('test-model-id');
    expect(copyContainer).toBe(container);

    // Should have artifact entries for evaluation.json, predictions parquet/csv, and shap.json
    const artifactWorkspaces = artifacts.map((a: Record<string, unknown>) => a.workspace);
    expect(artifactWorkspaces).toContain('eval/test-model-id/evaluation.json');
    expect(artifactWorkspaces).toContain('eval/test-model-id/predictions.parquet');
    expect(artifactWorkspaces).toContain('eval/test-model-id/predictions.csv');
    expect(artifactWorkspaces).toContain('eval/test-model-id/shap.json');
  });

  it('copies the model artifact into a workspace-relative models directory before evaluation', async () => {
    const model = makeModelRecord();
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockImplementation(async (config: unknown) => {
      const cfg = config as { filesToCopy: Array<{ permanentPath: string; workspacePath: string }> };
      expect(cfg.filesToCopy).toEqual([
        {
          permanentPath: model.artifact!.path,
          workspacePath: 'models/test-model-id/model.joblib'
        }
      ]);
      return {
        container,
        executionResult: {
          status: 'success',
          stderr: '',
          executionMs: 5000,
        },
      };
    });
    mockCopyArtifactsToPermanentStorage.mockResolvedValue(undefined);

    await runEvaluation('test-model-id');

    expect(mockOrchestrateContainerExecution).toHaveBeenCalledTimes(1);
  });

  it('reuses the stored model test size when building the evaluation script', async () => {
    const model = makeModelRecord({ metadata: { testSize: 0.3 } });
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockImplementation(async (config: unknown) => {
      const cfg = config as { scriptBuilder: () => string };
      const script = cfg.scriptBuilder();
      expect(script).toContain('test_size = 0.3');
      return {
        container,
        executionResult: { status: 'success', stderr: '', executionMs: 5000 },
      };
    });

    await runEvaluation('test-model-id');
  });

  it('installs stored or inferred runtime dependencies before evaluation execution', async () => {
    const model = makeModelRecord({
      algorithm: 'catboost_classifier',
      metadata: {
        runtimeDependencies: ['catboost'],
      },
    });
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockImplementation(async (config: unknown) => {
      const cfg = config as { packagesToInstall?: string[] };
      expect(cfg.packagesToInstall).toEqual(['catboost']);
      return {
        container,
        executionResult: { status: 'success', stderr: '', executionMs: 5000 },
      };
    });

    await runEvaluation('test-model-id');
  });

  it('replays notebook prep segments for llm-workflow models before running evaluation', async () => {
    const model = makeModelRecord({
      projectId: 'test-project',
      taskType: 'regression',
      metadata: {
        source: 'llm-workflow',
        experimentId: 'exp-1',
      },
    });
    const container = makeContainer();
    const dataset = {
      datasetId: 'test-dataset',
      filename: 'data.csv',
      projectId: 'test-project',
      columns: [{ name: 'feat1' }, { name: 'target' }],
    };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockWorkflowListRuns.mockResolvedValue([
      { runId: 'run-1', projectId: 'test-project', phase: 'training', updatedAt: new Date().toISOString() }
    ]);
    mockWorkflowGetRun.mockResolvedValue({
      run: {
        metadata: {
          history: {
            toolCalls: [
              {
                args: {
                  metadata: {
                    trainingDraft: {
                      experimentId: 'exp-1',
                      segments: [
                        { content: 'DATASET_ID = "test-dataset"\nDATASET_FILENAME = "data.csv"\nTARGET_COLUMN = "target"\nTEST_SIZE = 0.2' },
                        { content: 'dataset_path = resolve_dataset_path(DATASET_FILENAME, DATASET_ID)\ndf = pd.read_csv(dataset_path)\nX_train = df[["feat1"]].iloc[:3].copy()\ny_train = df[TARGET_COLUMN].iloc[:3].copy()\nX_test = df[["feat1"]].iloc[3:].copy()\ny_test = df[TARGET_COLUMN].iloc[3:].copy()' },
                        { content: 'pipeline.fit(X_train, y_train)\ny_pred = pipeline.predict(X_test)' },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      },
    });
    mockOrchestrateContainerExecution.mockImplementation(async (config: unknown) => {
      const script = (config as { scriptBuilder: () => string }).scriptBuilder();
      expect(script).toContain('resolve_dataset_path(DATASET_FILENAME, DATASET_ID)');
      expect(script).toContain('X_train = df[["feat1"]].iloc[:3].copy()');
      expect(script).not.toContain('pipeline.fit(X_train, y_train)');
      expect(script).not.toContain('X = df.drop(columns=[target_col])');
      return {
        container,
        executionResult: { status: 'success', stderr: '', executionMs: 5000 },
      };
    });

    await runEvaluation('test-model-id');

    const backfillCall = mockUpdate.mock.calls.find(([, updater]) => {
      const updated = (updater as (record: typeof model) => typeof model)(model);
      const metadata = updated.metadata as Record<string, unknown> | undefined;
      return Array.isArray(metadata?.workflowPrepSegments) && metadata.workflowPrepSegments.length === 2;
    });
    expect(backfillCall).toBeDefined();
  });

  it('uses canonical pandas/sklearn functions for data-hygiene wrappers so warm-kernel reruns do not recurse', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m-warm/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m-warm',
      taskType: 'classification',
      targetColumn: 'target',
      testSize: 0.2,
      workflowPrepSegments: [
        'FEATURE_COLUMNS = ["feat1"]',
        'df = pd.read_csv(WORKFLOW_DATASET_PATH)\nX_train = df[["feat1"]].copy()\ny_train = df["target"].copy()\nX_test = X_train.copy()\ny_test = y_train.copy()',
      ],
    });

    expect(script).toContain('import pandas.core.generic as _automl_pd_generic');
    expect(script).toContain('getattr(pd.Series, "_automl_original_astype", None)');
    expect(script).toContain('_automl_pd_generic.NDFrame.astype');
    expect(script).toContain('pd.Series._automl_original_astype = _original_series_astype');
    expect(script).toContain('import pandas.io.parsers.readers as _automl_pd_readers');
    expect(script).toContain('getattr(pd, "_automl_original_read_csv", None)');
    expect(script).toContain('_automl_pd_readers.read_csv');
    expect(script).toContain('pd._automl_original_read_csv = _original_read_csv');
    expect(script).toContain('import sklearn.model_selection._split as _automl_sk_model_selection_split');
    expect(script).toContain('getattr(_automl_sk_model_selection, "_automl_original_train_test_split", None)');
    expect(script).toContain('_automl_sk_model_selection_split.train_test_split');
    expect(script).toContain('_automl_sk_model_selection._automl_original_train_test_split = _original_train_test_split');
  });

  it('recovers the workflow target column from live history and prefers live prep replay over stale stored snapshots', async () => {
    const model = makeModelRecord({
      projectId: 'test-project',
      taskType: 'classification',
      targetColumn: 'storage_used_gb_per_active_user',
      featureColumns: ['total_logins', 'storage_used_gb_per_active_user'],
      metadata: {
        source: 'llm-workflow',
        experimentId: 'exp-1',
        workflowRunId: 'run-1',
        workflowPrepSegments: ['df = pd.read_csv("stale.csv")'],
      },
    });
    const container = makeContainer();
    const dataset = {
      datasetId: 'test-dataset',
      filename: 'data.csv',
      projectId: 'test-project',
      columns: [
        { name: 'total_logins' },
        { name: 'storage_used_gb_per_active_user' },
      ],
    };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockWorkflowGetRun.mockResolvedValue({
      run: {
        metadata: {
          history: {
            toolCalls: [
              {
                tool: 'write_cell',
                args: {
                  cellId: 'cell-1',
                  content: 'df = pd.read_csv(WORKFLOW_DATASET_PATH)\ndf["churn_proxy"] = (df["total_logins"] < 3).astype(int)',
                  metadata: {
                    trainingDraft: {
                      experimentId: 'exp-1',
                    },
                  },
                },
              },
              {
                tool: 'write_cell',
                args: {
                  cellId: 'cell-2',
                  content: 'X_train = df[["total_logins"]].copy()\ny_train = df["churn_proxy"].copy()\nX_test = X_train.copy()\ny_test = y_train.copy()',
                  metadata: {
                    trainingDraft: {
                      experimentId: 'exp-1',
                    },
                  },
                },
              },
            ],
            toolResults: [
              {
                tool: 'run_cell',
                output: {
                  status: 'success',
                  stdout: '__TRAIN_COMPLETE__|{"accuracy":0.91,"target_column":"churn_proxy"}',
                },
              },
            ],
          },
        },
      },
    });
    mockOrchestrateContainerExecution.mockImplementation(async (config: unknown) => {
      const script = (config as { scriptBuilder: () => string }).scriptBuilder();
      expect(script).toContain('_EVAL_TARGET_COL = "churn_proxy"');
      expect(script).toContain('df["churn_proxy"] = (df["total_logins"] < 3).astype(int)');
      expect(script).not.toContain('pd.read_csv("stale.csv")');
      return {
        container,
        executionResult: { status: 'success', stderr: '', executionMs: 5000 },
      };
    });

    await runEvaluation('test-model-id');

    const targetRepairCall = mockUpdate.mock.calls.find(([, updater]) => {
      const updated = (updater as (record: typeof model) => typeof model)(model);
      return updated.targetColumn === 'churn_proxy';
    });
    expect(targetRepairCall).toBeDefined();

    const prepBackfillCall = mockUpdate.mock.calls.find(([, updater]) => {
      const updated = (updater as (record: typeof model) => typeof model)(model);
      const metadata = updated.metadata as Record<string, unknown> | undefined;
      return Array.isArray(metadata?.workflowPrepSegments)
        && metadata.workflowPrepSegments.includes('df = pd.read_csv(WORKFLOW_DATASET_PATH)\ndf["churn_proxy"] = (df["total_logins"] < 3).astype(int)');
    });
    expect(prepBackfillCall).toBeDefined();
  });

  it('normalizes legacy workflow prep syntax and infers runtime dependencies from replayed prep code', async () => {
    const model = makeModelRecord({
      algorithm: 'gradient_boosting_classifier',
      metadata: {
        source: 'llm-workflow',
        experimentId: 'exp-1',
        workflowPrepSegments: [
          'from catboost import CatBoostClassifier',
          'df["event_date"] = df["event_date"].view("int64")',
          'X_train = df[["feat1"]].iloc[:3].copy()\ny_train = df["target"].iloc[:3].copy()\nX_test = df[["feat1"]].iloc[3:].copy()\ny_test = df["target"].iloc[3:].copy()',
        ],
      },
    });
    const container = makeContainer();
    const dataset = {
      datasetId: 'test-dataset',
      filename: 'data.csv',
      projectId: 'test-project',
      columns: [{ name: 'feat1' }, { name: 'target' }],
    };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockImplementation(async (config: unknown) => {
      const cfg = config as { packagesToInstall?: string[]; scriptBuilder: () => string };
      expect(cfg.packagesToInstall).toEqual(['catboost']);
      const script = cfg.scriptBuilder();
      expect(script).toContain('.astype("int64")');
      expect(script).not.toContain('.view("int64")');
      return {
        container,
        executionResult: { status: 'success', stderr: '', executionMs: 5000 },
      };
    });

    await runEvaluation('test-model-id');
  });

  it('does not throw when model is not found', async () => {
    mockGetById.mockResolvedValue(undefined);

    // Should not throw (fire-and-forget safety)
    await expect(runEvaluation('nonexistent')).resolves.toBeUndefined();
  });

  it('sets failed status when dataset is not found', async () => {
    const model = makeModelRecord();

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(undefined);

    await runEvaluation('test-model-id');

    // Should have been called twice: computing + failed
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    const failedResult = mockUpdate.mock.calls[1][1](model);
    expect(failedResult.evaluationStatus).toBe('failed');
    expect(failedResult.evaluationError).toContain('Dataset not found');
  });
});
