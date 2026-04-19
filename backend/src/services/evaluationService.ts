import { join } from 'node:path';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import type { ModelTaskType } from '../types/model.js';
import {
  copyArtifactsToPermanentStorage,
  orchestrateContainerExecution,
} from '../utils/containerOrchestrator.js';
import { resolveAndHealTargetColumn } from '../utils/modelUtils.js';

import {
  extractWorkflowPrepSegmentsFromToolCalls,
  normalizeWorkflowPrepSegments,
} from './llm/trainingTools/workflowPrepSegments.js';
import { resolveModelTestSize } from './modelTestSize.js';
import {
  buildDatasetLoadLines,
  buildOutputDirSetup,
  buildResultSaving,
  buildStandardImports,
  buildTrainTestSplitLines,
} from './pythonScriptUtils.js';
import { loadRuntimeDependencies } from './runtimeDependencies.js';
import { getWorkflowRepository } from './workflows/repository/index.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const modelRepository = createModelRepository(env.modelMetadataPath);
const workflowRepository = getWorkflowRepository();

const logger = appLogger.child({ service: 'evaluationService' });

// Defer to env.executionTimeoutMs so tree-boosters / heavy models that take
// longer than 5 minutes to complete a full CV + learning-curve pass inherit
// the configured runtime limit (EXECUTION_TIMEOUT_MS) instead of being capped
// at the old 300s wall-clock.
const EVALUATION_TIMEOUT_MS = env.executionTimeoutMs;
const PERMUTATION_IMPORTANCE_MAX_SAMPLES = 400;
const PERMUTATION_IMPORTANCE_REPEATS = 3;
const LEARNING_CURVE_MAX_SAMPLES = 1000;
const LEARNING_CURVE_POINTS = 5;
const LEARNING_CURVE_CV_SPLITS = 3;
const CROSS_VALIDATION_MAX_SAMPLES = 1500;
const CROSS_VALIDATION_CV_SPLITS = 3;
const SHAP_MAX_SAMPLES = 200;
const EXPENSIVE_EVALUATION_MAX_SAMPLES = 1000;

function sanitizeEvaluationErrorMessage(message: string): string {
  const tracebackIndex = message.indexOf('Traceback');
  const trimmed = (tracebackIndex >= 0 ? message.slice(tracebackIndex) : message).trim();
  const lines = trimmed.split('\n');
  let omittedFutureWarnings = 0;

  const filtered = lines.filter((line) => {
    const normalized = line.trim();
    const isFutureWarning =
      normalized.includes('FutureWarning:') ||
      normalized.includes('Series.view is deprecated');
    if (isFutureWarning) {
      omittedFutureWarnings += 1;
      return false;
    }
    if (
      omittedFutureWarnings > 0 && (
        normalized.startsWith('ordinal =') ||
        normalized.startsWith('Use ``astype``') ||
        normalized.includes('deprecated and will be removed')
      )
    ) {
      return false;
    }
    return true;
  });

  const cleaned = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (omittedFutureWarnings > 0 && cleaned) {
    return `${cleaned}\n\n[${omittedFutureWarnings} FutureWarning lines omitted]`;
  }
  return cleaned || trimmed || message;
}

interface BuildEvaluationScriptOptions {
  modelPath: string;
  datasetPath: string;
  outputDir: string;
  taskType: ModelTaskType;
  targetColumn: string;
  testSize: number;
  workflowPrepSegments?: string[];
  featureColumns?: string[];
}

export function buildEvaluationScript(options: BuildEvaluationScriptOptions): string {
  const {
    modelPath,
    datasetPath,
    outputDir,
    taskType,
    targetColumn,
    testSize,
    workflowPrepSegments,
    featureColumns,
  } = options;

  const lines: string[] = [];

  // ── Imports ──
  const extras: string[] = [
    'import time',
    'import joblib',
    'from sklearn.model_selection import train_test_split, cross_val_score, learning_curve',
    'from sklearn.inspection import permutation_importance',
  ];

  if (taskType === 'classification') {
    extras.push('from sklearn.metrics import (');
    extras.push('    confusion_matrix, classification_report, roc_curve, auc,');
    extras.push('    precision_recall_curve, average_precision_score');
    extras.push(')');
  } else if (taskType === 'regression') {
    extras.push('from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score');
  }

  lines.push(...buildStandardImports(extras));

  lines.push('start_time = time.time()');
  lines.push('');

  // ── Output dir ──
  lines.push(...buildOutputDirSetup(outputDir));

  // ── Compatibility helpers for serialized sklearn FunctionTransformer callables ──
  lines.push('def date_to_ordinal(X_col):');
  lines.push('    s = pd.Series(X_col.squeeze() if hasattr(X_col, "squeeze") else X_col)');
  lines.push('    dt = pd.to_datetime(s, errors="coerce")');
  lines.push('    return pd.DataFrame({"DATE_ordinal": dt.map(lambda x: x.toordinal() if pd.notna(x) else np.nan)})');
  lines.push('');

  const hasWorkflowPrepSegments = Array.isArray(workflowPrepSegments) && workflowPrepSegments.length > 0;
  if (hasWorkflowPrepSegments) {
    lines.push('# Rebuild the training/evaluation frame using the original notebook prep cells.');
    lines.push(`WORKFLOW_DATASET_PATH = ${JSON.stringify(datasetPath)}`);
    lines.push(`declared_task_type = ${JSON.stringify(taskType)}`);
    lines.push(`test_size = ${testSize}`);
    lines.push('def resolve_dataset_path(filename, dataset_id=None):');
    lines.push('    return WORKFLOW_DATASET_PATH');
    lines.push('');
    // Data-hygiene prelude — monkey-patches pd.Series.astype and
    // pd.DataFrame.astype so that casts to numeric dtypes on object
    // columns holding common dirty patterns (yes/no, true/false, "$95",
    // "1,715", "42%") auto-coerce instead of raising ValueError. The
    // LLM's training code frequently does `X[col].astype("float")`
    // without coercing first; this makes that pattern safe.
    // Robustness fix for #342+ training fragility #1.
    lines.push('_BOOL_LIKE_MAP = {"yes": 1, "no": 0, "true": 1, "false": 0, "y": 1, "n": 0, "t": 1, "f": 0}');
    lines.push('def _automl_try_coerce(series, target_dtype):');
    lines.push('    import pandas as pd');
    lines.push('    import numpy as np');
    lines.push('    try:');
    lines.push('        stripped = series.astype(str).str.strip().str.lower()');
    lines.push('    except Exception:');
    lines.push('        return None');
    lines.push('    non_null = stripped[(stripped.notna()) & (stripped != "") & (stripped != "nan")]');
    lines.push('    if len(non_null) == 0:');
    lines.push('        return None');
    lines.push('    if non_null.isin(list(_BOOL_LIKE_MAP.keys())).all():');
    lines.push('        mapped = stripped.map(_BOOL_LIKE_MAP)');
    lines.push('        try:');
    lines.push('            return mapped.astype(target_dtype)');
    lines.push('        except Exception:');
    lines.push('            return mapped');
    lines.push('    cleaned = stripped.str.replace(",", "", regex=False).str.replace("$", "", regex=False).str.replace("%", "", regex=False)');
    lines.push('    cleaned = cleaned.str.replace(r"k$", "000", regex=True).str.replace(r"m$", "000000", regex=True)');
    lines.push('    numeric = pd.to_numeric(cleaned, errors="coerce")');
    lines.push('    if numeric.notna().sum() / max(len(non_null), 1) >= 0.9:');
    lines.push('        try:');
    lines.push('            return numeric.astype(target_dtype)');
    lines.push('        except Exception:');
    lines.push('            return numeric');
    lines.push('    return None');
    lines.push('');
    lines.push('_NUMERIC_DTYPE_TOKENS = ("float", "int", "float32", "float64", "int32", "int64", "number")');
    lines.push('_original_series_astype = pd.Series.astype');
    lines.push('def _safe_series_astype(self, dtype, *args, **kwargs):');
    lines.push('    try:');
    lines.push('        return _original_series_astype(self, dtype, *args, **kwargs)');
    lines.push('    except (ValueError, TypeError):');
    lines.push('        if self.dtype == object and any(tok in str(dtype).lower() for tok in _NUMERIC_DTYPE_TOKENS):');
    lines.push('            coerced = _automl_try_coerce(self, dtype)');
    lines.push('            if coerced is not None:');
    lines.push('                print(f"[data-hygiene] auto-coerced Series to {dtype} via yes/no or numeric-string mapping")');
    lines.push('                return coerced');
    lines.push('        raise');
    lines.push('pd.Series.astype = _safe_series_astype');
    lines.push('');
    for (const segment of workflowPrepSegments) {
      lines.push(segment);
      lines.push('');
    }
    // Auto-derive the sklearn-style X_train/X_test/y_train/y_test variables
    // when the prep segments only expose DataFrame-centric splits
    // (train_df/test_df). This happens for pytorch_tabular training (FT/Tab/
    // TabNet transformers) where the LLM-generated code passes whole DataFrames
    // to TabularModel.fit(). Falling through to the concat + pipeline.predict
    // path below needs sklearn-shape variables.
    //
    // Target-column resolution: start from the user's configured target, but
    // fall back to any column in train_df that's NOT a user-configured feature
    // (handles the case where Feature Engineering derived a transformed target
    // like usage_log1p while the model record still carries the original
    // usage_count).
    const knownFeatureColumns = Array.isArray(featureColumns) && featureColumns.length > 0
      ? featureColumns.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    lines.push(`_EVAL_TARGET_COL = ${JSON.stringify(targetColumn)}`);
    lines.push(`_EVAL_KNOWN_FEATURES = ${JSON.stringify(knownFeatureColumns)}`);
    lines.push('if "X_train" not in globals() and "train_df" in globals() and "test_df" in globals():');
    lines.push('    if not hasattr(train_df, "columns") or not hasattr(test_df, "columns"):');
    lines.push('        raise ValueError("Workflow evaluation prep exposed train_df/test_df but they are not pandas DataFrames.")');
    lines.push('    _train_cols = list(train_df.columns)');
    lines.push('    _test_cols = list(test_df.columns)');
    lines.push('    _common_cols = [c for c in _train_cols if c in _test_cols]');
    lines.push('    _resolved_target = _EVAL_TARGET_COL if _EVAL_TARGET_COL and _EVAL_TARGET_COL in _common_cols else None');
    lines.push('    # Try the model record\'s featureColumns list (authoritative) — target is');
    lines.push('    # any common column NOT in that list. Handles Feature-Engineering derived');
    lines.push('    # targets (e.g. usage_log1p when the model was configured for usage_count).');
    lines.push('    if _resolved_target is None and _EVAL_KNOWN_FEATURES:');
    lines.push('        _candidates = [c for c in _common_cols if c not in _EVAL_KNOWN_FEATURES]');
    lines.push('        if len(_candidates) == 1:');
    lines.push('            _resolved_target = _candidates[0]');
    lines.push('        elif len(_candidates) > 1 and _EVAL_TARGET_COL:');
    lines.push('            _suffix_match = [c for c in _candidates if c.startswith(_EVAL_TARGET_COL) or _EVAL_TARGET_COL in c]');
    lines.push('            if len(_suffix_match) == 1:');
    lines.push('                _resolved_target = _suffix_match[0]');
    lines.push('            elif len(_candidates) > 0:');
    lines.push('                _resolved_target = _candidates[0]');
    lines.push('    # Last resort: any column exposed by prep that matches FEATURE_COLUMNS / feature_columns globals.');
    lines.push('    if _resolved_target is None:');
    lines.push('        _configured_features = list(globals().get("FEATURE_COLUMNS", globals().get("feature_columns", [])) or [])');
    lines.push('        if _configured_features:');
    lines.push('            _candidates = [c for c in _common_cols if c not in _configured_features]');
    lines.push('            if len(_candidates) >= 1:');
    lines.push('                _resolved_target = _candidates[0]');
    lines.push('    if _resolved_target is None and _EVAL_TARGET_COL:');
    lines.push('        _suffix_hits = [c for c in _common_cols if c.startswith(_EVAL_TARGET_COL) or _EVAL_TARGET_COL in c]');
    lines.push('        if len(_suffix_hits) == 1:');
    lines.push('            _resolved_target = _suffix_hits[0]');
    lines.push('    if _resolved_target is None:');
    lines.push('        raise ValueError(');
    lines.push('            f"Workflow evaluation prep left train_df/test_df but no target column could be resolved. "');
    lines.push('            f"Configured target={_EVAL_TARGET_COL!r}; train_df columns={_train_cols[:30]}; known_features={_EVAL_KNOWN_FEATURES[:10]}."');
    lines.push('        )');
    lines.push('    X_train = train_df.drop(columns=[_resolved_target])');
    lines.push('    X_test = test_df.drop(columns=[_resolved_target])');
    lines.push('    y_train = train_df[_resolved_target]');
    lines.push('    y_test = test_df[_resolved_target]');
    lines.push('    print(f"[eval] Auto-derived X/y from train_df/test_df (target={_resolved_target!r}; configured={_EVAL_TARGET_COL!r})")');
    lines.push('');
    lines.push('required_names = ["X_train", "X_test", "y_train", "y_test"]');
    lines.push('missing_runtime_vars = [name for name in required_names if name not in globals()]');
    lines.push('if missing_runtime_vars and "X" in globals() and "y" in globals():');
    lines.push('    if not hasattr(X, "columns"):');
    lines.push('        X = pd.DataFrame(X)');
    lines.push('    if not isinstance(y, pd.Series):');
    lines.push('        y = pd.Series(np.asarray(y).ravel(), name=_EVAL_TARGET_COL or "target")');
    lines.push('    _eval_stratify = None');
    lines.push('    if declared_task_type == "classification":');
    lines.push('        _class_counts = y.value_counts(dropna=False)');
    lines.push('        _min_class_count = int(_class_counts.min()) if len(_class_counts) > 0 else 0');
    lines.push('        if y.nunique() > 1 and _min_class_count >= 2:');
    lines.push('            _eval_stratify = y');
    lines.push('    X_train, X_test, y_train, y_test = train_test_split(');
    lines.push('        X, y, test_size=test_size, random_state=42, stratify=_eval_stratify');
    lines.push('    )');
    lines.push('    missing_runtime_vars = [name for name in required_names if name not in globals()]');
    lines.push('    print(f"[eval] Auto-derived X_train/X_test from X/y (task={declared_task_type}; stratify={_eval_stratify is not None})")');
    lines.push('if missing_runtime_vars:');
    lines.push('    raise ValueError(f"Workflow evaluation prep did not define required variables: {missing_runtime_vars}")');
    lines.push('if not hasattr(X_train, "columns") or not hasattr(X_test, "columns"):');
    lines.push('    raise ValueError("Workflow evaluation prep must leave X_train and X_test as pandas DataFrames.")');
    lines.push('feature_columns = list(X_test.columns)');
    // Coerce y_train/y_test to pandas Series before concat — some LLM-generated
    // prep code leaves them as numpy arrays which pd.concat rejects.
    lines.push('if not isinstance(y_train, pd.Series):');
    lines.push('    y_train = pd.Series(np.asarray(y_train).ravel(), name="y_train")');
    lines.push('if not isinstance(y_test, pd.Series):');
    lines.push('    y_test = pd.Series(np.asarray(y_test).ravel(), name="y_test")');
    lines.push('X = pd.concat([X_train, X_test], axis=0, ignore_index=True)');
    lines.push('y = pd.concat([y_train, y_test], axis=0, ignore_index=True)');
    lines.push('');
  } else {
    // ── Load dataset ──
    lines.push(...buildDatasetLoadLines(datasetPath));
    lines.push('');

    // ── Extract raw features (Pipeline handles preprocessing internally) ──
    lines.push(`target_col = ${JSON.stringify(targetColumn)}`);
    lines.push('df = df.dropna(subset=[target_col])');
    lines.push('y = df[target_col]');
    lines.push('X = df.drop(columns=[target_col])');
    lines.push('feature_columns = list(X.columns)');
    lines.push('');

    // ── Train/test split ──
    lines.push(...buildTrainTestSplitLines({ taskType, testSize }));
    lines.push('');
  }

  // ── Load pipeline ──
  // Primary path: joblib.load for sklearn/pytorch_tabular/etc. Fallback path:
  // raw torch.save artifacts (.pt/.pth) that joblib can't unpickle; load with
  // torch.load and wrap the nn.Module in an sklearn-compatible adapter.
  lines.push(`_EVAL_MODEL_PATH = ${JSON.stringify(modelPath)}`);
  lines.push('try:');
  lines.push('    pipeline = joblib.load(_EVAL_MODEL_PATH)');
  lines.push('except Exception as _load_err:');
  lines.push('    _msg = str(_load_err).lower()');
  lines.push('    _is_torch_artifact = (_EVAL_MODEL_PATH.endswith(".pt") or _EVAL_MODEL_PATH.endswith(".pth")');
  lines.push('        or "not a zipfile" in _msg or "invalid load key" in _msg or "magic number" in _msg)');
  lines.push('    if not _is_torch_artifact:');
  lines.push('        raise');
  lines.push('    import torch');
  lines.push('    _loaded = torch.load(_EVAL_MODEL_PATH, map_location="cpu", weights_only=False)');
  lines.push('    if isinstance(_loaded, dict) and all(isinstance(v, torch.Tensor) for v in _loaded.values()):');
  lines.push('        raise TypeError("Saved artifact is a torch state_dict; the full nn.Module must be saved (torch.save(model, path)), not model.state_dict().")');
  lines.push('    if not hasattr(_loaded, "eval") or not callable(getattr(_loaded, "__call__", None)):');
  lines.push('        raise TypeError(f"Loaded torch artifact is not an nn.Module: got {type(_loaded).__name__}.")');
  lines.push('    class _TorchPredictAdapter:');
  lines.push('        def __init__(self, module, feature_columns):');
  lines.push('            self.module = module.eval()');
  lines.push('            self.feature_columns = list(feature_columns or [])');
  lines.push('        def predict(self, X):');
  lines.push('            cols = [c for c in self.feature_columns if c in X.columns] if hasattr(X, "columns") else None');
  lines.push('            X_np = (X[cols].to_numpy(dtype=np.float32) if cols else np.asarray(X, dtype=np.float32))');
  lines.push('            with torch.no_grad():');
  lines.push('                out = self.module(torch.tensor(X_np))');
  lines.push('            arr = out.detach().cpu().numpy()');
  lines.push('            return arr.argmax(axis=1) if (arr.ndim > 1 and arr.shape[1] > 1) else arr.ravel()');
  lines.push('        def predict_proba(self, X):');
  lines.push('            cols = [c for c in self.feature_columns if c in X.columns] if hasattr(X, "columns") else None');
  lines.push('            X_np = (X[cols].to_numpy(dtype=np.float32) if cols else np.asarray(X, dtype=np.float32))');
  lines.push('            with torch.no_grad():');
  lines.push('                out = self.module(torch.tensor(X_np))');
  lines.push('            arr = out.detach().cpu().numpy()');
  lines.push('            if arr.ndim == 1:');
  lines.push('                arr = np.stack([1 - arr, arr], axis=1)');
  lines.push('            row_sums = arr.sum(axis=1, keepdims=True)');
  lines.push('            return arr / np.where(row_sums != 0, row_sums, 1)');
  lines.push('    pipeline = _TorchPredictAdapter(_loaded, feature_columns)');
  lines.push('    print(f"[eval] Loaded raw torch.nn.Module via torch.load and wrapped in sklearn-compatible adapter.")');
  lines.push('');
  // Defensive unwrap: older runs may have saved a dict wrapper around the
  // estimator. Accept that shape so evaluation doesn't fall over downstream.
  lines.push('if isinstance(pipeline, dict):');
  lines.push('    _unwrapped = None');
  lines.push("    for _inner_key in ('pipeline', 'model', 'estimator', 'classifier', 'regressor', 'best_estimator'):");
  lines.push('        _candidate = pipeline.get(_inner_key)');
  lines.push('        if _candidate is not None and hasattr(_candidate, "predict"):');
  lines.push('            _unwrapped = _candidate');
  lines.push('            break');
  lines.push('    if _unwrapped is None:');
  lines.push("        raise TypeError('Saved model artifact is a dict with no predict-capable inner value. Re-train and save the Pipeline or fitted estimator directly.')");
  lines.push('    pipeline = _unwrapped');
  lines.push('');

  // ── Resolve fitted estimator / compatibility sanitation ──
  lines.push('# Resolve the fitted estimator step robustly');
  lines.push('fitted_model = None');
  lines.push('if hasattr(pipeline, "named_steps"):');
  lines.push('    fitted_model = pipeline.named_steps.get("model")');
  lines.push('    if fitted_model is None:');
  lines.push('        fitted_model = pipeline.named_steps.get("regressor")');
  lines.push('    if fitted_model is None:');
  lines.push('        fitted_model = pipeline.named_steps.get("classifier")');
  lines.push('if fitted_model is None and hasattr(pipeline, "steps") and len(pipeline.steps) > 0:');
  lines.push('    fitted_model = pipeline.steps[-1][1]');
  lines.push('if fitted_model is None:');
  lines.push('    fitted_model = pipeline');
  lines.push('');
  lines.push('# Normalize DataFrame categorical values for direct-estimator compatibility.');
  lines.push('categorical_columns = []');
  lines.push('if hasattr(X_train, "columns") and hasattr(X_test, "columns"):');
  lines.push('    categorical_column_set = set()');
  lines.push('    for frame in (X_train, X_test):');
  lines.push('        categorical_column_set.update(frame.select_dtypes(include=["object", "category", "string"]).columns.tolist())');
  lines.push('    if hasattr(fitted_model, "_get_cat_feature_indices"):');
  lines.push('        try:');
  lines.push('            for idx in fitted_model._get_cat_feature_indices():');
  lines.push('                idx_int = int(idx)');
  lines.push('                if 0 <= idx_int < len(X_train.columns):');
  lines.push('                    categorical_column_set.add(X_train.columns[idx_int])');
  lines.push('        except Exception:');
  lines.push('            pass');
  lines.push('    categorical_columns = sorted(categorical_column_set)');
  lines.push('    for col in categorical_columns:');
  lines.push('        if col in X_train.columns:');
  lines.push('            X_train[col] = X_train[col].fillna("__MISSING__").astype(str)');
  lines.push('        if col in X_test.columns:');
  lines.push('            X_test[col] = X_test[col].fillna("__MISSING__").astype(str)');
  lines.push('        if col in X.columns:');
  lines.push('            X[col] = X[col].fillna("__MISSING__").astype(str)');
  lines.push('');
  lines.push('has_pipeline_preprocessor = hasattr(pipeline, "named_steps") and "preprocessor" in pipeline.named_steps');
  lines.push('fitted_model_module = str(getattr(fitted_model.__class__, "__module__", "")).lower()');
  lines.push('fitted_model_name = str(getattr(fitted_model.__class__, "__name__", "")).lower()');
  lines.push('expensive_analysis_model = (');
  lines.push('    "neighbors" in fitted_model_module');
  lines.push('    or fitted_model_name.startswith("kneighbors")');
  lines.push('    or fitted_model_name in {"svc", "svr", "nusvc", "nusvr"}');
  lines.push('    or fitted_model_name.startswith("mlp")');
  lines.push(')');
  lines.push(`expensive_eval_max_samples = ${EXPENSIVE_EVALUATION_MAX_SAMPLES}`);
  lines.push('if "neighbors" in fitted_model_module or fitted_model_name.startswith("kneighbors") or fitted_model_name in {"svc", "svr", "nusvc", "nusvr"}:');
  lines.push('    expensive_eval_max_samples = min(expensive_eval_max_samples, 250)');
  lines.push('elif fitted_model_name.startswith("mlp"):');
  lines.push('    expensive_eval_max_samples = min(expensive_eval_max_samples, 500)');
  lines.push('is_direct_catboost = ("catboost" in fitted_model_module or "catboost" in fitted_model_name) and not has_pipeline_preprocessor');
  lines.push('requires_refit_categorical_metadata = is_direct_catboost and len(categorical_columns) > 0');
  lines.push('');
  lines.push('evaluation_sample_warning = None');
  lines.push('if expensive_analysis_model and len(X_test) > expensive_eval_max_samples:');
  lines.push('    _eval_sample_size = min(len(X_test), expensive_eval_max_samples)');
  lines.push('    if hasattr(X_test, "iloc"):');
  lines.push('        X_test = X_test.iloc[:_eval_sample_size].copy()');
  lines.push('    else:');
  lines.push('        X_test = X_test[:_eval_sample_size]');
  lines.push('    if hasattr(y_test, "iloc"):');
  lines.push('        y_test = y_test.iloc[:_eval_sample_size].copy()');
  lines.push('    else:');
  lines.push('        y_test = np.asarray(y_test)[:_eval_sample_size]');
  lines.push('    if "test_df" in globals() and hasattr(test_df, "iloc"):');
  lines.push('        test_df = test_df.iloc[:_eval_sample_size].copy()');
  lines.push('    evaluation_sample_warning = (');
  lines.push('        f"Evaluation used a capped holdout sample of {_eval_sample_size} rows "');
  lines.push('        f"out of {len(X)} total rows for expensive estimator family: {type(fitted_model).__name__}"');
  lines.push('    )');
  lines.push('    print(evaluation_sample_warning)');
  lines.push('');

  // ── Predictions ──
  // Guard .predict(): non-sklearn estimators (raw torch.nn.Module, some
  // forecasting libraries, anomaly-detection wrappers) may lack the method
  // entirely. Raise a clean error instead of crashing deep in the stack.
  lines.push('if not hasattr(pipeline, "predict") or not callable(getattr(pipeline, "predict", None)):');
  lines.push('    raise TypeError(');
  lines.push('        f"Saved model does not implement .predict(X_test) (class={type(pipeline).__module__}.{type(pipeline).__name__}). "');
  lines.push('        "Evaluation requires an sklearn-compatible .predict method. For forecasting/clustering/anomaly models, use the matching task_type or wrap the estimator in a Pipeline."');
  lines.push('    )');
  lines.push('_predict_original_err = None');
  lines.push('try:');
  lines.push('    y_pred = pipeline.predict(X_test)');
  lines.push('except Exception as _predict_err:');
  lines.push('    _predict_original_err = _predict_err');
  lines.push('    y_pred = None');
  // DataFrame-centric models (pytorch_tabular TabularModel, etc.) expect the
  // full test DataFrame WITH the target column (their preprocessor uses the
  // stored scaler/encoder metadata and requires column alignment). Retry with
  // test_df if it's in scope.
  lines.push('if y_pred is None and "test_df" in globals():');
  lines.push('    try:');
  lines.push('        y_pred = pipeline.predict(test_df)');
  lines.push('        print(f"[eval] .predict(X_test) raised {type(_predict_original_err).__name__}; retried with test_df and succeeded.")');
  lines.push('    except Exception as _retry_err:');
  lines.push('        raise RuntimeError(');
  lines.push('            f"pipeline.predict failed on both X_test and test_df. "');
  lines.push('            f"X_test error: {type(_predict_original_err).__name__}: {_predict_original_err}. "');
  lines.push('            f"test_df error: {type(_retry_err).__name__}: {_retry_err}"');
  lines.push('        ) from _retry_err');
  lines.push('if y_pred is None:');
  lines.push('    raise RuntimeError(f"pipeline.predict(X_test) failed: {type(_predict_original_err).__name__}: {_predict_original_err}") from _predict_original_err');
  // Handle (predictions, uncertainties) tuple outputs from some Bayesian /
  // probabilistic models.
  lines.push('if isinstance(y_pred, tuple) and len(y_pred) >= 1:');
  lines.push('    y_pred = y_pred[0]');
  // Normalize DataFrame predictions (pytorch_tabular TabularModel returns a
  // DataFrame with columns like "prediction", "target_prediction", or
  // "target_<class>_probability"). Pick the class-label column, never a
  // probability column. Also handles Prophet-style yhat DataFrames.
  lines.push('if hasattr(y_pred, "columns"):');
  lines.push('    _pred_cols = list(y_pred.columns)');
  lines.push('    _label_col = None');
  lines.push('    for _name in _pred_cols:');
  lines.push('        if _name in ("prediction", "yhat"):');
  lines.push('            _label_col = _name');
  lines.push('            break');
  lines.push('    if _label_col is None:');
  lines.push('        for _name in _pred_cols:');
  lines.push('            _lower = str(_name).lower()');
  lines.push('            if "probability" in _lower or _lower.endswith("_proba") or _lower.endswith("_upper") or _lower.endswith("_lower"):');
  lines.push('                continue');
  lines.push('            if "prediction" in _lower or _lower == "yhat":');
  lines.push('                _label_col = _name');
  lines.push('                break');
  lines.push('    if _label_col is None:');
  lines.push('        _label_col = _pred_cols[-1]');
  lines.push('    y_pred = y_pred[_label_col].values');
  // Ensure y_pred is a 1-D numpy array for downstream metrics.
  // Multi-output detection: keep 2-D shape when the model emits multiple
  // targets (e.g., multi-label classification or multi-output regression).
  // Downstream blocks gate on _is_multi_output to skip aggregate metrics
  // (confusion_matrix, residual histogram) and emit per-output metrics instead.
  lines.push('_yp_raw = np.asarray(y_pred)');
  lines.push('_is_multi_output = _yp_raw.ndim > 1 and _yp_raw.shape[1] > 1');
  lines.push('if not _is_multi_output:');
  lines.push('    y_pred = _yp_raw.ravel()');
  lines.push('else:');
  lines.push('    y_pred = _yp_raw  # preserve 2-D');
  lines.push('');

  // Normalize y_test / y_train into pandas Series so downstream code that
  // calls .value_counts(), .unique(), .values etc. works regardless of whether
  // the prep provided pandas or numpy. y_test_series / y_train_series shadow
  // the original names to keep the rest of the script readable.
  lines.push('if not hasattr(y_test, "value_counts"):');
  lines.push('    y_test = pd.Series(np.asarray(y_test).ravel(), name="y_test")');
  lines.push('if not hasattr(y_train, "value_counts"):');
  lines.push('    y_train = pd.Series(np.asarray(y_train).ravel(), name="y_train")');
  lines.push('');

  // ── Task-type runtime safety net ──
  // The registered taskType may not match the actual target column (happens
  // when an older model was trained before profile-aware configure_experiment
  // shipped). Detect continuous targets at runtime and flip to regression
  // metrics so the evaluation job produces numbers instead of crashing at
  // `confusion_matrix` with "continuous is not supported".
  lines.push(`declared_task_type = ${JSON.stringify(taskType)}`);
  lines.push('def _is_continuous_target(arr):');
  lines.push('    arr = np.asarray(arr).ravel()');
  lines.push('    if arr.dtype.kind == "f" and not np.all(np.isclose(arr, np.round(arr))):');
  lines.push('        return True');
  lines.push('    try:');
  lines.push('        unique_count = int(len(np.unique(arr)))');
  lines.push('    except Exception:');
  lines.push('        return False');
  lines.push('    return unique_count > 50');
  lines.push('effective_task_type = declared_task_type');
  lines.push('task_type_mismatch = None');
  lines.push('if declared_task_type == "classification" and _is_continuous_target(y_test):');
  lines.push('    effective_task_type = "regression"');
  lines.push('    task_type_mismatch = {');
  lines.push('        "declared": declared_task_type,');
  lines.push('        "detected": "regression",');
  lines.push('        "reason": f"Target y_test has {len(np.unique(np.asarray(y_test).ravel()))} unique values — treated as continuous. Falling back to regression metrics."');
  lines.push('    }');
  lines.push('elif declared_task_type == "regression" and not _is_continuous_target(y_test):');
  lines.push('    _unique = int(len(np.unique(np.asarray(y_test).ravel())))');
  lines.push('    if _unique <= 20:');
  lines.push('        task_type_mismatch = {');
  lines.push('            "declared": declared_task_type,');
  lines.push('            "detected": "classification",');
  lines.push('            "reason": f"Target y_test has only {_unique} unique values — could be classification. Keeping regression metrics as declared."');
  lines.push('        }');
  lines.push('print(f"[eval] declared_task_type={declared_task_type} effective_task_type={effective_task_type}")');
  lines.push('if task_type_mismatch is not None and task_type_mismatch.get("declared") != task_type_mismatch.get("detected"):');
  lines.push('    _mismatch_reason = task_type_mismatch.get("reason", "")');
  lines.push('    print(f"[eval] Task type mismatch: {_mismatch_reason}")');
  lines.push('');

  // ── Result dict ──
  lines.push('result = {}');
  lines.push(`result["taskType"] = ${JSON.stringify(taskType)}`);
  lines.push('result["effectiveTaskType"] = effective_task_type');
  lines.push('if task_type_mismatch is not None:');
  lines.push('    result["taskTypeMismatch"] = task_type_mismatch');
  lines.push('result["warnings"] = []');
  lines.push('if evaluation_sample_warning is not None:');
  lines.push('    result["warnings"].append(evaluation_sample_warning)');
  lines.push('    result["evaluationSample"] = {');
  lines.push('        "applied": True,');
  lines.push('        "maxRows": int(len(X_test)),');
  lines.push('        "totalRows": int(len(X)),');
  lines.push('    }');
  lines.push('if task_type_mismatch is not None and task_type_mismatch.get("declared") != task_type_mismatch.get("detected"):');
  lines.push('    result["warnings"].append(task_type_mismatch["reason"])');
  lines.push('');

  // ── Feature importance ──
  lines.push('# Feature importance');
  lines.push('try:');
  lines.push('    fi = {}');
  lines.push('');
  lines.push('    # Resolve OHE-expanded feature names from the trained pipeline');
  lines.push('    try:');
  lines.push('        ohe_feature_names = list(pipeline.named_steps["preprocessor"].get_feature_names_out())');
  lines.push('    except Exception:');
  lines.push('        ohe_feature_names = feature_columns');
  lines.push('');
  lines.push('    # Model-based importance');
  lines.push('    if hasattr(fitted_model, "feature_importances_"):');
  lines.push('        fi["model_based"] = {');
  lines.push('            "features": ohe_feature_names,');
  lines.push('            "importances": [float(x) for x in fitted_model.feature_importances_]');
  lines.push('        }');
  lines.push('    elif hasattr(fitted_model, "coef_"):');
  lines.push('        coefs = fitted_model.coef_');
  lines.push('        if coefs.ndim > 1:');
  lines.push('            coefs = np.mean(np.abs(coefs), axis=0)');
  lines.push('        else:');
  lines.push('            coefs = np.abs(coefs)');
  lines.push('        fi["model_based"] = {');
  lines.push('            "features": ohe_feature_names,');
  lines.push('            "importances": [float(x) for x in coefs]');
  lines.push('        }');
  lines.push('');
  lines.push('    if expensive_analysis_model:');
  lines.push('        feature_warning = f"Permutation importance skipped for expensive estimator family: {type(fitted_model).__name__}"');
  lines.push('        result["warnings"].append(feature_warning)');
  lines.push('        print(feature_warning)');
  lines.push('    else:');
  lines.push('        # Permutation importance');
  lines.push(`        _pi_max_samples = min(${PERMUTATION_IMPORTANCE_MAX_SAMPLES}, len(X_test))`);
  lines.push('        X_pi = X_test.iloc[:_pi_max_samples]');
  lines.push('        y_pi = y_test.iloc[:_pi_max_samples]');
  lines.push(`        perm_result = permutation_importance(pipeline, X_pi, y_pi, n_repeats=${PERMUTATION_IMPORTANCE_REPEATS}, random_state=42, n_jobs=1)`);
  lines.push('        fi["permutation"] = {');
  lines.push('            "features": feature_columns,');
  lines.push('            "importances_mean": [float(x) for x in perm_result.importances_mean],');
  lines.push('            "importances_std": [float(x) for x in perm_result.importances_std]');
  lines.push('        }');
  lines.push('    if fi:');
  lines.push('        result["feature_importance"] = fi');
  lines.push('except Exception as feature_err:');
  lines.push('    feature_warning = f"Feature importance skipped: {feature_err}"');
  lines.push('    result["warnings"].append(feature_warning)');
  lines.push('    print(feature_warning)');
  lines.push('');

  // ── Learning curve ──
  lines.push('# Learning curve');
  lines.push('if expensive_analysis_model:');
  lines.push('    learning_curve_warning = f"Learning curve skipped for expensive estimator family: {type(fitted_model).__name__}"');
  lines.push('    result["warnings"].append(learning_curve_warning)');
  lines.push('    print(learning_curve_warning)');
  lines.push('elif requires_refit_categorical_metadata:');
  lines.push('    learning_curve_warning = "Learning curve skipped: direct CatBoost models with raw categorical columns need training-time cat_features metadata for refit."');
  lines.push('    result["warnings"].append(learning_curve_warning)');
  lines.push('    print(learning_curve_warning)');
  lines.push('else:');
  lines.push('    try:');
  lines.push(`        max_samples = min(${LEARNING_CURVE_MAX_SAMPLES}, len(X))`);
  lines.push('        X_lc = X.iloc[:max_samples]');
  lines.push('        y_lc = y.iloc[:max_samples]');
  lines.push(`        _lc_cv = min(${LEARNING_CURVE_CV_SPLITS}, len(X_lc))`);
  lines.push('        if _lc_cv < 2:');
  lines.push('            raise ValueError("Learning curve requires at least 2 samples.")');
  lines.push('        train_sizes_abs, train_scores, test_scores = learning_curve(');
  lines.push(`            pipeline, X_lc, y_lc, train_sizes=np.linspace(0.2, 1.0, ${LEARNING_CURVE_POINTS}), cv=_lc_cv, n_jobs=1`);
  lines.push('        )');
  lines.push('        result["learning_curve"] = {');
  lines.push('            "train_sizes": [int(x) for x in train_sizes_abs],');
  lines.push('            "train_scores_mean": [float(x) for x in train_scores.mean(axis=1)],');
  lines.push('            "train_scores_std": [float(x) for x in train_scores.std(axis=1)],');
  lines.push('            "test_scores_mean": [float(x) for x in test_scores.mean(axis=1)],');
  lines.push('            "test_scores_std": [float(x) for x in test_scores.std(axis=1)]');
  lines.push('        }');
  lines.push('    except Exception as learning_curve_err:');
  lines.push('        # Secondary fallback: single-fit pseudo-learning-curve for non-clonable');
  lines.push('        # estimators (pytorch_tabular, Prophet, custom wrappers).');
  lines.push('        try:');
  lines.push('            _sizes = np.linspace(0.1, 1.0, 6)');
  lines.push('            _train_sizes_abs, _train_means, _test_means = [], [], []');
  lines.push('            for _frac in _sizes:');
  lines.push('                _k = max(1, int(len(X_lc) * _frac))');
  lines.push('                _train_sizes_abs.append(_k)');
  lines.push('                try:');
  lines.push('                    _X_slice_lc = X_lc.iloc[:_k]');
  lines.push('                    _yt_true = np.asarray(y_lc.iloc[:_k]).ravel()');
  lines.push('                    try:');
  lines.push('                        _yt_slice = np.asarray(pipeline.predict(_X_slice_lc)).ravel()');
  lines.push('                    except Exception:');
  lines.push('                        _slice_df_lc = _X_slice_lc.copy()');
  lines.push('                        _tname = _resolved_target if "_resolved_target" in globals() else _EVAL_TARGET_COL');
  lines.push('                        if _tname:');
  lines.push('                            _slice_df_lc[_tname] = _yt_true');
  lines.push('                        _yp_raw_lc = pipeline.predict(_slice_df_lc)');
  lines.push('                        if hasattr(_yp_raw_lc, "columns"):');
  lines.push('                            _cands = [c for c in _yp_raw_lc.columns if c in ("prediction", "yhat") or "prediction" in str(c).lower()]');
  lines.push('                            _yt_slice = np.asarray(_yp_raw_lc[_cands[0]] if _cands else _yp_raw_lc.iloc[:, -1]).ravel()');
  lines.push('                        else:');
  lines.push('                            _yt_slice = np.asarray(_yp_raw_lc).ravel()');
  lines.push('                    if effective_task_type == "regression":');
  lines.push('                        _ss_res = float(np.sum((_yt_true - _yt_slice) ** 2))');
  lines.push('                        _ss_tot = float(np.sum((_yt_true - _yt_true.mean()) ** 2))');
  lines.push('                        _score = 1.0 - _ss_res / _ss_tot if _ss_tot > 0 else 0.0');
  lines.push('                    else:');
  lines.push('                        _score = float(np.mean(_yt_true == _yt_slice))');
  lines.push('                    _train_means.append(_score); _test_means.append(_score)');
  lines.push('                except Exception:');
  lines.push('                    _train_means.append(0.0); _test_means.append(0.0)');
  lines.push('            result["learning_curve"] = {');
  lines.push('                "train_sizes": [int(x) for x in _train_sizes_abs],');
  lines.push('                "train_scores_mean": [float(x) for x in _train_means],');
  lines.push('                "train_scores_std": [0.0 for _ in _train_means],');
  lines.push('                "test_scores_mean": [float(x) for x in _test_means],');
  lines.push('                "test_scores_std": [0.0 for _ in _test_means],');
  lines.push('                "lc_type": "single_fit_pseudo",');
  lines.push('            }');
  lines.push('            _pseudo_warning = f"Learning curve computed via single-fit pseudo method (sklearn fallback: {learning_curve_err})."');
  lines.push('            result["warnings"].append(_pseudo_warning)');
  lines.push('            print(_pseudo_warning)');
  lines.push('        except Exception as _pseudo_err:');
  lines.push('            learning_curve_warning = f"Learning curve skipped: {learning_curve_err} (pseudo fallback also failed: {_pseudo_err})"');
  lines.push('            result["warnings"].append(learning_curve_warning)');
  lines.push('            print(learning_curve_warning)');
  lines.push('');

  // ── Cross validation ──
  lines.push('# Cross validation');
  if (taskType === 'classification') {
    lines.push('scoring = "accuracy" if effective_task_type == "classification" else "r2"');
  } else {
    lines.push('scoring = "r2"');
  }
  lines.push('if expensive_analysis_model:');
  lines.push('    cross_validation_warning = f"Cross-validation skipped for expensive estimator family: {type(fitted_model).__name__}"');
  lines.push('    result["warnings"].append(cross_validation_warning)');
  lines.push('    print(cross_validation_warning)');
  lines.push('elif requires_refit_categorical_metadata:');
  lines.push('    cross_validation_warning = "Cross-validation skipped: direct CatBoost models with raw categorical columns need training-time cat_features metadata for refit."');
  lines.push('    result["warnings"].append(cross_validation_warning)');
  lines.push('    print(cross_validation_warning)');
  lines.push('else:');
  lines.push('    try:');
  lines.push(`        _cv_max_samples = min(${CROSS_VALIDATION_MAX_SAMPLES}, len(X))`);
  lines.push('        X_cv = X.iloc[:_cv_max_samples]');
  lines.push('        y_cv = y.iloc[:_cv_max_samples]');
  lines.push(`        _cv_splits = min(${CROSS_VALIDATION_CV_SPLITS}, len(X_cv))`);
  lines.push('        if _cv_splits < 2:');
  lines.push('            raise ValueError("Cross-validation requires at least 2 samples.")');
  lines.push('        cv_scores = cross_val_score(pipeline, X_cv, y_cv, cv=_cv_splits, scoring=scoring, n_jobs=1)');
  lines.push('        result["cross_validation"] = {');
  lines.push('            "scores": [float(x) for x in cv_scores],');
  lines.push('            "mean": float(cv_scores.mean()),');
  lines.push('            "std": float(cv_scores.std()),');
  lines.push('            "scoring": scoring');
  lines.push('        }');
  lines.push('    except Exception as cross_validation_err:');
  lines.push('        # Secondary fallback: single-fit pseudo-CV with KFold slicing.');
  lines.push('        # The already-fitted pipeline is scored across 5 different test');
  lines.push('        # slices of the data — exposes slice-variance without requiring');
  lines.push('        # the estimator to be sklearn-clonable (pytorch_tabular etc.).');
  lines.push('        try:');
  lines.push('            from sklearn.model_selection import KFold');
  lines.push('            _kf = KFold(n_splits=5, shuffle=True, random_state=42)');
  lines.push('            _manual_scores = []');
  lines.push('            _has_test_df = "test_df" in globals()');
  lines.push('            for _tr_idx, _te_idx in _kf.split(X):');
  lines.push('                _y_true_fold = np.asarray(y.iloc[_te_idx]).ravel()');
  lines.push('                _X_slice = X.iloc[_te_idx]');
  lines.push('                try:');
  lines.push('                    _y_pred_fold = np.asarray(pipeline.predict(_X_slice)).ravel()');
  lines.push('                except Exception:');
  lines.push('                    try:');
  lines.push('                        # DataFrame-centric models (pytorch_tabular) need the');
  lines.push('                        # target column present — reconstruct from X + y.');
  lines.push('                        _slice_df = _X_slice.copy()');
  lines.push('                        _target_name = _resolved_target if "_resolved_target" in globals() else _EVAL_TARGET_COL');
  lines.push('                        if _target_name:');
  lines.push('                            _slice_df[_target_name] = _y_true_fold');
  lines.push('                        _y_pred_raw = pipeline.predict(_slice_df)');
  lines.push('                        if hasattr(_y_pred_raw, "columns"):');
  lines.push('                            _candidates = [c for c in _y_pred_raw.columns if c in ("prediction", "yhat") or "prediction" in str(c).lower()]');
  lines.push('                            _y_pred_fold = np.asarray(_y_pred_raw[_candidates[0]] if _candidates else _y_pred_raw.iloc[:, -1]).ravel()');
  lines.push('                        else:');
  lines.push('                            _y_pred_fold = np.asarray(_y_pred_raw).ravel()');
  lines.push('                    except Exception:');
  lines.push('                        continue');
  lines.push('                if effective_task_type == "regression":');
  lines.push('                    _ss_res = float(np.sum((_y_true_fold - _y_pred_fold) ** 2))');
  lines.push('                    _ss_tot = float(np.sum((_y_true_fold - _y_true_fold.mean()) ** 2))');
  lines.push('                    _manual_scores.append(1.0 - _ss_res / _ss_tot if _ss_tot > 0 else 0.0)');
  lines.push('                else:');
  lines.push('                    _manual_scores.append(float(np.mean(_y_true_fold == _y_pred_fold)))');
  lines.push('            if _manual_scores:');
  lines.push('                result["cross_validation"] = {');
  lines.push('                    "scores": [float(s) for s in _manual_scores],');
  lines.push('                    "mean": float(np.mean(_manual_scores)),');
  lines.push('                    "std": float(np.std(_manual_scores)),');
  lines.push('                    "scoring": scoring,');
  lines.push('                    "cv_type": "single_fit_holdout",');
  lines.push('                }');
  lines.push('                _cv_warn = f"Cross-validation computed via single-fit holdout (sklearn fallback: {cross_validation_err})."');
  lines.push('                result["warnings"].append(_cv_warn)');
  lines.push('                print(_cv_warn)');
  lines.push('            else:');
  lines.push('                raise RuntimeError("All CV folds failed to score.")');
  lines.push('        except Exception as _cv_fallback_err:');
  lines.push('            cross_validation_warning = f"Cross-validation skipped: {cross_validation_err} (fallback also failed: {_cv_fallback_err})"');
  lines.push('            result["warnings"].append(cross_validation_warning)');
  lines.push('            print(cross_validation_warning)');
  lines.push('');

  // ── Task-type specific metrics ──
  // `has_proba` / `y_proba` / `classes` get set inside the classification
  // branch; they're also referenced below for the predictions artifact, so
  // declare defaults here so the runtime regression-fallback path doesn't
  // raise NameError when the declared classification path is skipped.
  lines.push('has_proba = False');
  lines.push('y_proba = None');
  lines.push('classes = []');
  lines.push('');

  // Multi-output per-output metrics (skip aggregate CM / residuals for multi-
  // output). Emitted before the task-type-specific block so both branches can
  // gate on _is_multi_output.
  lines.push('if _is_multi_output:');
  lines.push('    _yt_raw = np.asarray(y_test)');
  lines.push('    if _yt_raw.ndim == 1:');
  lines.push('        _yt_raw = _yt_raw.reshape(-1, 1)');
  lines.push('    _output_names = (list(y_test.columns) if hasattr(y_test, "columns")');
  lines.push('        else [f"output_{i}" for i in range(_yp_raw.shape[1])])');
  lines.push('    _per_output = []');
  lines.push('    for _i, _name in enumerate(_output_names):');
  lines.push('        _entry = {"output_index": _i, "output_name": str(_name)}');
  lines.push('        try:');
  lines.push('            if effective_task_type == "regression":');
  lines.push('                _entry["mse"] = float(np.mean((_yt_raw[:, _i] - _yp_raw[:, _i]) ** 2))');
  lines.push('                _entry["mae"] = float(np.mean(np.abs(_yt_raw[:, _i] - _yp_raw[:, _i])))');
  lines.push('                _ss_res = float(np.sum((_yt_raw[:, _i] - _yp_raw[:, _i]) ** 2))');
  lines.push('                _ss_tot = float(np.sum((_yt_raw[:, _i] - _yt_raw[:, _i].mean()) ** 2))');
  lines.push('                _entry["r2"] = float(1.0 - _ss_res / _ss_tot) if _ss_tot > 0 else None');
  lines.push('            else:');
  lines.push('                from sklearn.metrics import accuracy_score, f1_score');
  lines.push('                _entry["accuracy"] = float(accuracy_score(_yt_raw[:, _i], _yp_raw[:, _i]))');
  lines.push('                _entry["f1"] = float(f1_score(_yt_raw[:, _i], _yp_raw[:, _i], average="macro", zero_division=0))');
  lines.push('        except Exception as _per_err:');
  lines.push('            _entry["error"] = f"{type(_per_err).__name__}: {_per_err}"');
  lines.push('        _per_output.append(_entry)');
  lines.push('    result["per_output_metrics"] = _per_output');
  lines.push('    result["outputs"] = list(_output_names)');
  lines.push('');

  if (taskType === 'classification') {
    lines.push('if effective_task_type == "classification" and not _is_multi_output:');
    lines.push('    # Classification-specific metrics');
    lines.push('    labels = sorted([str(c) for c in y.unique()])');
    lines.push('    cm = confusion_matrix(y_test, y_pred, labels=sorted(y.unique()))');
    lines.push('    cm_normalized = cm.astype(float) / cm.sum(axis=1, keepdims=True)');
    lines.push('    cm_normalized = np.nan_to_num(cm_normalized)');
    lines.push('    result["confusion_matrix"] = {');
    lines.push('        "matrix": cm.tolist(),');
    lines.push('        "matrix_normalized": cm_normalized.tolist(),');
    lines.push('        "labels": labels');
    lines.push('    }');
    lines.push('');
    lines.push('    # Classification report');
    lines.push('    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)');
    lines.push('    result["classification_report"] = {}');
    lines.push('    for key, val in report.items():');
    lines.push('        if isinstance(val, dict):');
    lines.push('            result["classification_report"][str(key)] = {k: float(v) for k, v in val.items()}');
    lines.push('        else:');
    lines.push('            result["classification_report"][str(key)] = float(val)');
    lines.push('');
    lines.push('    # Class distribution');
    lines.push('    train_dist = y_train.value_counts().to_dict()');
    lines.push('    test_dist = y_test.value_counts().to_dict()');
    lines.push('    result["class_distribution"] = {');
    lines.push('        "train": {str(k): int(v) for k, v in train_dist.items()},');
    lines.push('        "test": {str(k): int(v) for k, v in test_dist.items()}');
    lines.push('    }');
    lines.push('');
    lines.push('    # Probability-based curves');
    lines.push('    has_proba = hasattr(pipeline, "predict_proba")');
    lines.push('    try:');
    lines.push('      if has_proba:');
    lines.push('        y_proba = pipeline.predict_proba(X_test)');
    lines.push('        classes = [str(c) for c in fitted_model.classes_]');
    lines.push('        n_classes = len(classes)');
    lines.push('        # Binarize for multiclass curves');
    lines.push('        y_test_bin = None');
    lines.push('        if n_classes > 2:');
    lines.push('            from sklearn.preprocessing import label_binarize');
    lines.push('            y_test_bin = label_binarize(y_test, classes=fitted_model.classes_)');
    lines.push('        # ROC curves');
    lines.push('        roc_curves = {}');
    lines.push('        if n_classes == 2:');
    lines.push('            fpr, tpr, _ = roc_curve(y_test, y_proba[:, 1], pos_label=fitted_model.classes_[1])');
    lines.push('            roc_auc = float(auc(fpr, tpr))');
    lines.push('            roc_curves[classes[1]] = {"fpr": fpr.tolist(), "tpr": tpr.tolist(), "auc": roc_auc}');
    lines.push('        else:');
    lines.push('            for i, cls in enumerate(classes):');
    lines.push('                fpr, tpr, _ = roc_curve(y_test_bin[:, i], y_proba[:, i])');
    lines.push('                roc_auc = float(auc(fpr, tpr))');
    lines.push('                roc_curves[cls] = {"fpr": fpr.tolist(), "tpr": tpr.tolist(), "auc": roc_auc}');
    lines.push('        result["roc_curves"] = roc_curves');
    lines.push('        # Precision-recall curves');
    lines.push('        pr_curves = {}');
    lines.push('        if n_classes == 2:');
    lines.push('            prec, rec, _ = precision_recall_curve(y_test, y_proba[:, 1], pos_label=fitted_model.classes_[1])');
    lines.push('            ap = float(average_precision_score(y_test == fitted_model.classes_[1], y_proba[:, 1]))');
    lines.push('            pr_curves[classes[1]] = {"precision": prec.tolist(), "recall": rec.tolist(), "ap": ap}');
    lines.push('        else:');
    lines.push('            for i, cls in enumerate(classes):');
    lines.push('                prec, rec, _ = precision_recall_curve(y_test_bin[:, i], y_proba[:, i])');
    lines.push('                ap = float(average_precision_score(y_test_bin[:, i], y_proba[:, i]))');
    lines.push('                pr_curves[cls] = {"precision": prec.tolist(), "recall": rec.tolist(), "ap": ap}');
    lines.push('        result["precision_recall_curves"] = pr_curves');
    lines.push('        # Calibration curve (binary only)');
    lines.push('        if n_classes == 2:');
    lines.push('            from sklearn.calibration import calibration_curve as cal_curve');
    lines.push('            prob_true, prob_pred = cal_curve(y_test == fitted_model.classes_[1], y_proba[:, 1], n_bins=10)');
    lines.push('            result["calibration_curve"] = {');
    lines.push('                "prob_true": prob_true.tolist(),');
    lines.push('                "prob_pred": prob_pred.tolist(),');
    lines.push('                "n_bins": 10');
    lines.push('            }');
    lines.push('    except Exception as curve_err:');
    lines.push('        probability_warning = f"Probability curves skipped: {curve_err}"');
    lines.push('        result["warnings"].append(probability_warning)');
    lines.push('        print(probability_warning)');
    lines.push('else:');
    lines.push('    # Declared classification but y_test is continuous: emit regression fallback metrics');
    lines.push('    residuals_arr = (np.asarray(y_test).ravel() - np.asarray(y_pred).ravel()).tolist()');
    lines.push('    result["residuals"] = {');
    lines.push('        "y_true": np.asarray(y_test).ravel().tolist(),');
    lines.push('        "y_pred": np.asarray(y_pred).ravel().tolist(),');
    lines.push('        "residuals": residuals_arr');
    lines.push('    }');
    lines.push('    counts, bin_edges = np.histogram(residuals_arr, bins=30)');
    lines.push('    result["residual_histogram"] = {');
    lines.push('        "bin_edges": bin_edges.tolist(),');
    lines.push('        "counts": counts.tolist()');
    lines.push('    }');
    lines.push('');
  } else if (taskType === 'regression') {
    lines.push('if not _is_multi_output:');
    lines.push('    _y_true_arr = np.asarray(y_test).ravel()');
    lines.push('    _y_pred_arr = np.asarray(y_pred).ravel()');
    lines.push('    residuals_arr = (_y_true_arr - _y_pred_arr).tolist()');
    lines.push('    result["residuals"] = {');
    lines.push('        "y_true": _y_true_arr.tolist(),');
    lines.push('        "y_pred": _y_pred_arr.tolist(),');
    lines.push('        "residuals": residuals_arr');
    lines.push('    }');
    lines.push('    counts, bin_edges = np.histogram(residuals_arr, bins=30)');
    lines.push('    result["residual_histogram"] = {');
    lines.push('        "bin_edges": bin_edges.tolist(),');
    lines.push('        "counts": counts.tolist()');
    lines.push('    }');
    lines.push('');
  }

  // ── Forecasting metrics (task_type='forecasting' or time-series regressions) ──
  // Emits MAPE/sMAPE/MASE + horizon/residual series keyed on any datetime
  // column in X_test. Runs when declared_task_type=='forecasting' OR when the
  // model record's split_strategy is time-series. Safe: skipped for clustering.
  lines.push('if declared_task_type == "forecasting" and not _is_multi_output:');
  lines.push('    try:');
  lines.push('        _ts_col = None');
  lines.push('        for _c in (list(X_test.columns) if hasattr(X_test, "columns") else []):');
  lines.push('            if pd.api.types.is_datetime64_any_dtype(X_test[_c]):');
  lines.push('                _ts_col = _c');
  lines.push('                break');
  lines.push('        _yt_fc = np.asarray(y_test, dtype=float).ravel()');
  lines.push('        _yp_fc = np.asarray(y_pred, dtype=float).ravel()');
  lines.push('        _mae  = float(np.mean(np.abs(_yt_fc - _yp_fc)))');
  lines.push('        _rmse = float(np.sqrt(np.mean((_yt_fc - _yp_fc) ** 2)))');
  lines.push('        _mape = None if np.any(_yt_fc == 0) else float(np.mean(np.abs((_yt_fc - _yp_fc) / _yt_fc)) * 100)');
  lines.push('        _smape = float(np.mean(2.0 * np.abs(_yp_fc - _yt_fc) / (np.abs(_yt_fc) + np.abs(_yp_fc) + 1e-8)) * 100)');
  lines.push('        _mase = None');
  lines.push('        if "y_train" in globals():');
  lines.push('            _yt_train = np.asarray(y_train, dtype=float).ravel()');
  lines.push('            if len(_yt_train) > 1:');
  lines.push('                _naive_mae = float(np.mean(np.abs(np.diff(_yt_train))))');
  lines.push('                _mase = float(_mae / _naive_mae) if _naive_mae > 0 else None');
  lines.push('        _ts_values = (X_test[_ts_col].astype(str).tolist() if _ts_col else [str(i) for i in range(len(_yt_fc))])');
  lines.push('        result["forecasting_metrics"] = {');
  lines.push('            "mape": _mape, "smape": _smape, "rmse": _rmse, "mae": _mae, "mase": _mase,');
  lines.push('            "timestamp_column": _ts_col,');
  lines.push('            "horizon_series": {"timestamps": _ts_values, "y_true": _yt_fc.tolist(), "y_pred": _yp_fc.tolist()},');
  lines.push('            "residual_series": {"timestamps": _ts_values, "residuals": (_yt_fc - _yp_fc).tolist()},');
  lines.push('        }');
  lines.push('    except Exception as _fc_err:');
  lines.push('        result["warnings"].append(f"Forecasting metrics skipped: {_fc_err}")');
  lines.push('');

  // ── Clustering metrics (task_type='clustering') ──
  // Run when the model was trained on an unsupervised task. Uses the fitted
  // model's labels_ attribute (KMeans, etc.) or pipeline.predict(X_test) for
  // estimators that emit cluster assignments. Safe to compute when we have a
  // target too — the metrics just ignore y_test.
  lines.push('if declared_task_type == "clustering":');
  lines.push('    try:');
  lines.push('        from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score');
  lines.push('        from sklearn.decomposition import PCA');
  lines.push('        _cluster_labels = None');
  lines.push('        if hasattr(pipeline, "predict"):');
  lines.push('            try:');
  lines.push('                _cluster_labels = np.asarray(pipeline.predict(X_test)).ravel()');
  lines.push('            except Exception:');
  lines.push('                _cluster_labels = None');
  lines.push('        if _cluster_labels is None and hasattr(fitted_model, "labels_"):');
  lines.push('            _cluster_labels = np.asarray(fitted_model.labels_).ravel()');
  lines.push('        if _cluster_labels is None:');
  lines.push('            raise TypeError("Clustering model exposes neither .predict nor .labels_ — cannot compute cluster metrics.")');
  lines.push('        _X_numeric = X_test.select_dtypes(include=[np.number]).to_numpy() if hasattr(X_test, "select_dtypes") else np.asarray(X_test, dtype=float)');
  lines.push('        _unique_clusters = set(_cluster_labels.tolist())');
  lines.push('        result["clustering_metrics"] = {');
  lines.push('            "n_clusters": int(len(_unique_clusters)),');
  lines.push('            "cluster_sizes": {str(k): int(v) for k, v in pd.Series(_cluster_labels).value_counts().items()},');
  lines.push('            "silhouette": float(silhouette_score(_X_numeric, _cluster_labels)) if len(_unique_clusters) > 1 else None,');
  lines.push('            "davies_bouldin": float(davies_bouldin_score(_X_numeric, _cluster_labels)) if len(_unique_clusters) > 1 else None,');
  lines.push('            "calinski_harabasz": float(calinski_harabasz_score(_X_numeric, _cluster_labels)) if len(_unique_clusters) > 1 else None,');
  lines.push('        }');
  lines.push('        if _X_numeric.shape[1] >= 2:');
  lines.push('            _pca = PCA(n_components=2, random_state=42)');
  lines.push('            _projection = _pca.fit_transform(_X_numeric)');
  lines.push('            result["clustering_metrics"]["projection"] = {');
  lines.push('                "points": _projection.tolist(),');
  lines.push('                "labels": [int(x) for x in _cluster_labels],');
  lines.push('            }');
  lines.push('    except Exception as _cl_err:');
  lines.push('        result["warnings"].append(f"Clustering metrics skipped: {_cl_err}")');
  lines.push('');

  // ── Save predictions artifact (includes features for error analysis) ──
  lines.push('# Save predictions — include features so error analysis can build an error tree');
  lines.push('pred_df = X_test.reset_index(drop=True)');
  lines.push('pred_df["y_true"] = np.asarray(y_test).ravel()');
  lines.push('pred_df["y_pred"] = np.asarray(y_pred).ravel()');
  lines.push('pred_df["original_index"] = list(y_test.index) if hasattr(y_test, "index") else list(range(len(pred_df)))');
  if (taskType === 'classification') {
    lines.push('if effective_task_type == "classification":');
    lines.push('    pred_df["is_correct"] = (pred_df["y_true"] == pred_df["y_pred"])');
    lines.push('    if has_proba:');
    lines.push('        for i, cls in enumerate(classes):');
    lines.push('            pred_df[f"proba_{cls}"] = y_proba[:, i]');
    lines.push('else:');
    lines.push('    _resid_abs = (pred_df["y_true"] - pred_df["y_pred"]).abs()');
    lines.push('    pred_df["is_correct"] = _resid_abs <= _resid_abs.std()');
  } else {
    // For regression: "correct" = residual within 1 std of all residuals
    lines.push('residuals = (pred_df["y_true"] - pred_df["y_pred"]).abs()');
    lines.push('pred_df["is_correct"] = residuals <= residuals.std()');
  }
  lines.push('predictions_filename = "predictions.parquet"');
  lines.push('try:');
  lines.push('    pred_df.to_parquet(os.path.join(output_dir, predictions_filename), index=False)');
  lines.push('except ImportError:');
  lines.push('    predictions_filename = "predictions.csv"');
  lines.push('    pred_df.to_csv(os.path.join(output_dir, predictions_filename), index=False)');
  lines.push('result["predictionsArtifact"] = predictions_filename');
  lines.push('');

  // ── Timing ──
  lines.push('compute_ms = int((time.time() - start_time) * 1000)');
  lines.push('result["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())');
  lines.push('result["computeMs"] = compute_ms');
  lines.push('');

  // ── Save evaluation.json ──
  lines.push(
    ...buildResultSaving('output_dir', {
      resultVar: 'result',
      filename: 'evaluation.json',
    })
  );

  // ── SHAP computation (best-effort) ──
  lines.push('# SHAP computation (best-effort, failure does not block evaluation)');
  lines.push('try:');
  lines.push('    if expensive_analysis_model:');
  lines.push('        raise RuntimeError(f"SHAP skipped for expensive estimator family: {type(fitted_model).__name__}")');
  lines.push('    import shap');
  lines.push(`    X_shap = X_test.iloc[:${SHAP_MAX_SAMPLES}] if len(X_test) > ${SHAP_MAX_SAMPLES} else X_test`);
  lines.push('    X_shap_transformed = pipeline.named_steps["preprocessor"].transform(X_shap)');
  lines.push('    shap_feature_names = list(pipeline.named_steps["preprocessor"].get_feature_names_out())');
  lines.push('    shap_values = None');
  lines.push('    explainer = None');
  lines.push('');
  lines.push('    # Tree-based models');
  lines.push('    if hasattr(fitted_model, "estimators_") or hasattr(fitted_model, "get_booster"):');
  lines.push('        explainer = shap.TreeExplainer(fitted_model)');
  lines.push('        shap_values = explainer.shap_values(X_shap_transformed)');
  lines.push('    # Linear models');
  lines.push('    elif hasattr(fitted_model, "coef_"):');
  lines.push(`        X_train_shap = X_train.iloc[:${SHAP_MAX_SAMPLES}] if len(X_train) > ${SHAP_MAX_SAMPLES} else X_train`);
  lines.push('        X_train_transformed = pipeline.named_steps["preprocessor"].transform(X_train_shap)');
  lines.push('        explainer = shap.LinearExplainer(fitted_model, X_train_transformed)');
  lines.push('        shap_values = explainer.shap_values(X_shap_transformed)');
  lines.push('');
  lines.push('    if shap_values is not None and explainer is not None:');
  lines.push('        # Handle multiclass (list of arrays)');
  lines.push('        if isinstance(shap_values, list):');
  lines.push('            shap_values = shap_values[0]');
  lines.push('        if hasattr(shap_values, "values"):');
  lines.push('            shap_arr = shap_values.values');
  lines.push('        else:');
  lines.push('            shap_arr = np.array(shap_values)');
  lines.push('');
  lines.push('        base_val = explainer.expected_value');
  lines.push('        if isinstance(base_val, (list, np.ndarray)):');
  lines.push('            base_val = [float(x) for x in base_val]');
  lines.push('        else:');
  lines.push('            base_val = float(base_val)');
  lines.push('');
  lines.push('        shap_result = {');
  lines.push('            "values": shap_arr.tolist(),');
  lines.push('            "base_values": base_val,');
  lines.push('            "data": X_shap_transformed.tolist() if hasattr(X_shap_transformed, "tolist") else np.array(X_shap_transformed).tolist(),');
  lines.push('            "feature_names": shap_feature_names,');
  lines.push('            "mean_abs_values": [float(x) for x in np.mean(np.abs(shap_arr), axis=0)]');
  lines.push('        }');
  lines.push('        with open(os.path.join(output_dir, "shap.json"), "w") as f:');
  lines.push('            json.dump(_sanitize_json_value(shap_result), f, allow_nan=False)');
  lines.push('except Exception as shap_err:');
  lines.push('    shap_warning = f"SHAP computation skipped: {shap_err}"');
  lines.push('    result["warnings"].append(shap_warning)');
  lines.push('    print(shap_warning)');
  lines.push('');
  lines.push('print("Evaluation complete")');

  return lines.join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function extractWorkflowPrepSegmentsFromSnapshot(
  snapshot: { run: { metadata?: Record<string, unknown> } } | undefined,
  experimentId: string,
): string[] {
  const history = asRecord(snapshot?.run.metadata)?.history;
  return extractWorkflowPrepSegmentsFromToolCalls(asRecord(history)?.toolCalls, experimentId);
}

async function loadWorkflowPrepSegments(
  model: { metadata?: Record<string, unknown>; projectId: string },
): Promise<{ segments: string[]; source: 'stored' | 'history' | 'none' }> {
  const metadata = asRecord(model.metadata);
  if (metadata?.source !== 'llm-workflow') {
    return { segments: [], source: 'none' };
  }

  const experimentId = typeof metadata.experimentId === 'string' ? metadata.experimentId : null;
  if (!experimentId) {
    return { segments: [], source: 'none' };
  }

  const storedPrepSegments = normalizeWorkflowPrepSegments(metadata.workflowPrepSegments);
  if (storedPrepSegments.length > 0) {
    return { segments: storedPrepSegments, source: 'stored' };
  }

  const workflowRunId = typeof metadata.workflowRunId === 'string' ? metadata.workflowRunId : null;
  if (workflowRunId) {
    const snapshot = await workflowRepository.getRun(workflowRunId);
    const prepSegments = extractWorkflowPrepSegmentsFromSnapshot(snapshot, experimentId);
    if (prepSegments.length > 0) {
      return { segments: prepSegments, source: 'history' };
    }
  }

  const runs = await workflowRepository.listRuns(model.projectId, 'training');
  for (const run of runs) {
    if (workflowRunId && run.runId === workflowRunId) {
      continue;
    }
    const snapshot = await workflowRepository.getRun(run.runId);
    const prepSegments = extractWorkflowPrepSegmentsFromSnapshot(snapshot, experimentId);
    if (prepSegments.length > 0) {
      return { segments: prepSegments, source: 'history' };
    }
  }

  return { segments: [], source: 'none' };
}

// loadRuntimeDependencies moved to ../runtimeDependencies.ts so the deployment
// pipeline can share the same merging logic — issue #323.

export async function runEvaluation(modelId: string): Promise<void> {
  try {
    // 1. Read model record
    const model = await modelRepository.getById(modelId);
    if (!model) {
      logger.error('Model not found for evaluation', { modelId });
      throw new Error('Model not found');
    }

    // 2. Set evaluationStatus = 'computing'
    await modelRepository.update(modelId, (current) => ({
      ...current,
      evaluationStatus: 'computing' as const,
      evaluationError: undefined,
    }));

    // 3. Check prerequisites
    if (!model.artifact?.path) {
      throw new Error('Model has no artifact path');
    }
    if (model.taskType === 'clustering') {
      throw new Error('Clustering models do not support evaluation');
    }

    // 4. Get dataset info — prefer the dataset whose column set covers
    //    model.featureColumns. Older rows may carry the source upload id
    //    instead of the preprocessed derived id (fixed for new rows by
    //    registrationTools.ts, but this fallback keeps already-registered
    //    models evaluable). Issue #342.
    let dataset = await datasetRepository.getById(model.datasetId);
    const featureCols = Array.isArray(model.featureColumns) ? model.featureColumns : [];
    const needsFallback = (candidate: typeof dataset): boolean => {
      if (!candidate) return true;
      if (featureCols.length === 0) return false;
      const columnNames = new Set(candidate.columns.map((col) => col.name));
      return featureCols.some((name) => !columnNames.has(name));
    };
    if (needsFallback(dataset)) {
      const projectDatasets = await datasetRepository.listByProject(model.projectId);
      // Search derived datasets first (those with metadata.derivedFrom) — they
      // are the preprocessing output the training cell most likely fit on.
      const derivedFirst = [...projectDatasets].sort((a, b) => {
        const aDerived = a.metadata?.derivedFrom ? 1 : 0;
        const bDerived = b.metadata?.derivedFrom ? 1 : 0;
        return bDerived - aDerived;
      });
      const match = derivedFirst.find((candidate) => {
        if (candidate.datasetId === model.datasetId) return false;
        if (featureCols.length === 0) return false;
        const columnNames = new Set(candidate.columns.map((col) => col.name));
        return featureCols.every((name) => columnNames.has(name));
      });
      if (match) {
        appLogger.warn(
          '[evaluationService] model.datasetId columns do not cover featureColumns; resolving to a project dataset that does',
          {
            modelId,
            originalDatasetId: model.datasetId,
            resolvedDatasetId: match.datasetId,
            derivedFrom: match.metadata?.derivedFrom
          }
        );
        dataset = match;
      }
    }
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    // 5. Resolve target column (heals stale metadata)
    const targetColumn = await resolveAndHealTargetColumn(model, dataset.columns, modelRepository);

    // 6. Pre-compute workspace paths (same pattern as containerOrchestrator)
    const workspaceModelPath = join('models', modelId, 'model.joblib');
    const testSize = resolveModelTestSize(model);
    const workflowPrep = await loadWorkflowPrepSegments(model);
    const runtimeDependencies = loadRuntimeDependencies(model, workflowPrep.segments);
    if (workflowPrep.source === 'history' && workflowPrep.segments.length > 0) {
      await modelRepository.update(modelId, (current) => ({
        ...current,
        metadata: {
          ...(asRecord(current.metadata) ?? {}),
          workflowPrepSegments: workflowPrep.segments,
        },
      }));
    }

    // 7. Orchestrate container execution
    const { container, executionResult } = await orchestrateContainerExecution({
      projectId: model.projectId,
      pythonVersion: '3.11',
      scriptBuilder: () =>
        buildEvaluationScript({
          modelPath: `/workspace/models/${modelId}/model.joblib`,
          datasetPath: `/workspace/datasets/${dataset.filename}`,
          outputDir: `/workspace/eval/${modelId}`,
          taskType: model.taskType as 'classification' | 'regression',
          targetColumn,
          testSize,
          workflowPrepSegments: workflowPrep.segments,
          featureColumns: Array.isArray(model.featureColumns) ? model.featureColumns : undefined,
        }),
      filesToCopy: [
        {
          permanentPath: model.artifact.path,
          workspacePath: workspaceModelPath,
        },
      ],
      packagesToInstall: runtimeDependencies,
      timeoutMs: EVALUATION_TIMEOUT_MS,
      containerOutputDir: `/workspace/eval/${modelId}`,
    });

    // 8. Check execution result
    if (executionResult.status !== 'success') {
      const executionFailureMessage = executionResult.status === 'timeout'
        ? (executionResult.error || executionResult.stderr || 'Evaluation execution timed out')
        : (executionResult.stderr || executionResult.error || 'Evaluation execution failed');
      throw new Error(executionFailureMessage);
    }

    // 9. Copy artifacts to permanent storage
    await copyArtifactsToPermanentStorage(modelId, container, [
      {
        workspace: `eval/${modelId}/evaluation.json`,
        permanent: 'evaluation.json',
      },
      {
        workspace: `eval/${modelId}/shap.json`,
        permanent: 'shap.json',
        optional: true,
      },
      {
        workspace: `eval/${modelId}/predictions.parquet`,
        permanent: 'predictions.parquet',
        optional: true,
      },
      {
        workspace: `eval/${modelId}/predictions.csv`,
        permanent: 'predictions.csv',
        optional: true,
      },
    ]);

    // 10. Set evaluationStatus = 'ready'
    await modelRepository.update(modelId, (current) => ({
      ...current,
      evaluationStatus: 'ready' as const,
      evaluationComputedAt: new Date().toISOString(),
      evaluationError: undefined,
    }));

    logger.info('Evaluation completed successfully', { modelId });
  } catch (err) {
    const errorMessage = sanitizeEvaluationErrorMessage(
      err instanceof Error ? err.message : String(err),
    );
    logger.error('Evaluation failed', { modelId, error: errorMessage });

    // Set evaluationStatus = 'failed'
    await modelRepository.update(modelId, (current) => ({
      ...current,
      evaluationStatus: 'failed' as const,
      evaluationError: errorMessage,
    })).catch((updateErr) => {
      logger.error('Failed to update model status after evaluation failure', {
        modelId,
        error: updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    });
  }
}
