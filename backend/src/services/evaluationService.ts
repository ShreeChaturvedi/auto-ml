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
import {
  inferRuntimeDependenciesFromCode,
  inferRuntimeDependenciesFromModelType,
  normalizeRuntimeDependencies,
} from './runtimeDependencies.js';
import { getWorkflowRepository } from './workflows/repository/index.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const modelRepository = createModelRepository(env.modelMetadataPath);
const workflowRepository = getWorkflowRepository();

const logger = appLogger.child({ service: 'evaluationService' });

const EVALUATION_TIMEOUT_MS = 300_000; // 5 minutes

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
    lines.push('def resolve_dataset_path(filename, dataset_id=None):');
    lines.push('    return WORKFLOW_DATASET_PATH');
    lines.push('');
    for (const segment of workflowPrepSegments) {
      lines.push(segment);
      lines.push('');
    }
    lines.push('required_names = ["X_train", "X_test", "y_train", "y_test"]');
    lines.push('missing_runtime_vars = [name for name in required_names if name not in globals()]');
    lines.push('if missing_runtime_vars:');
    lines.push('    raise ValueError(f"Workflow evaluation prep did not define required variables: {missing_runtime_vars}")');
    lines.push('if not hasattr(X_train, "columns") or not hasattr(X_test, "columns"):');
    lines.push('    raise ValueError("Workflow evaluation prep must leave X_train and X_test as pandas DataFrames.")');
    lines.push('feature_columns = list(X_test.columns)');
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
  lines.push(`pipeline = joblib.load(${JSON.stringify(modelPath)})`);
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
  lines.push('is_direct_catboost = ("catboost" in fitted_model_module or "catboost" in fitted_model_name) and not has_pipeline_preprocessor');
  lines.push('requires_refit_categorical_metadata = is_direct_catboost and len(categorical_columns) > 0');
  lines.push('');

  // ── Predictions ──
  lines.push('y_pred = pipeline.predict(X_test)');
  lines.push('');

  // ── Result dict ──
  lines.push('result = {}');
  lines.push(`result["taskType"] = ${JSON.stringify(taskType)}`);
  lines.push('result["warnings"] = []');
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
  lines.push('    # Permutation importance');
  lines.push('    perm_result = permutation_importance(pipeline, X_test, y_test, n_repeats=10, random_state=42, n_jobs=-1)');
  lines.push('    fi["permutation"] = {');
  lines.push('        "features": feature_columns,');
  lines.push('        "importances_mean": [float(x) for x in perm_result.importances_mean],');
  lines.push('        "importances_std": [float(x) for x in perm_result.importances_std]');
  lines.push('    }');
  lines.push('    if fi:');
  lines.push('        result["feature_importance"] = fi');
  lines.push('except Exception as feature_err:');
  lines.push('    feature_warning = f"Feature importance skipped: {feature_err}"');
  lines.push('    result["warnings"].append(feature_warning)');
  lines.push('    print(feature_warning)');
  lines.push('');

  // ── Learning curve ──
  lines.push('# Learning curve');
  lines.push('if requires_refit_categorical_metadata:');
  lines.push('    learning_curve_warning = "Learning curve skipped: direct CatBoost models with raw categorical columns need training-time cat_features metadata for refit."');
  lines.push('    result["warnings"].append(learning_curve_warning)');
  lines.push('    print(learning_curve_warning)');
  lines.push('else:');
  lines.push('    try:');
  lines.push('        max_samples = min(3000, len(X))');
  lines.push('        X_lc = X.iloc[:max_samples]');
  lines.push('        y_lc = y.iloc[:max_samples]');
  lines.push('        train_sizes_abs, train_scores, test_scores = learning_curve(');
  lines.push('            pipeline, X_lc, y_lc, train_sizes=np.linspace(0.1, 1.0, 8), cv=5, n_jobs=-1');
  lines.push('        )');
  lines.push('        result["learning_curve"] = {');
  lines.push('            "train_sizes": [int(x) for x in train_sizes_abs],');
  lines.push('            "train_scores_mean": [float(x) for x in train_scores.mean(axis=1)],');
  lines.push('            "train_scores_std": [float(x) for x in train_scores.std(axis=1)],');
  lines.push('            "test_scores_mean": [float(x) for x in test_scores.mean(axis=1)],');
  lines.push('            "test_scores_std": [float(x) for x in test_scores.std(axis=1)]');
  lines.push('        }');
  lines.push('    except Exception as learning_curve_err:');
  lines.push('        learning_curve_warning = f"Learning curve skipped: {learning_curve_err}"');
  lines.push('        result["warnings"].append(learning_curve_warning)');
  lines.push('        print(learning_curve_warning)');
  lines.push('');

  // ── Cross validation ──
  lines.push('# Cross validation');
  if (taskType === 'classification') {
    lines.push('scoring = "accuracy"');
  } else {
    lines.push('scoring = "r2"');
  }
  lines.push('if requires_refit_categorical_metadata:');
  lines.push('    cross_validation_warning = "Cross-validation skipped: direct CatBoost models with raw categorical columns need training-time cat_features metadata for refit."');
  lines.push('    result["warnings"].append(cross_validation_warning)');
  lines.push('    print(cross_validation_warning)');
  lines.push('else:');
  lines.push('    try:');
  lines.push('        cv_scores = cross_val_score(pipeline, X, y, cv=5, scoring=scoring, n_jobs=-1)');
  lines.push('        result["cross_validation"] = {');
  lines.push('            "scores": [float(x) for x in cv_scores],');
  lines.push('            "mean": float(cv_scores.mean()),');
  lines.push('            "std": float(cv_scores.std()),');
  lines.push('            "scoring": scoring');
  lines.push('        }');
  lines.push('    except Exception as cross_validation_err:');
  lines.push('        cross_validation_warning = f"Cross-validation skipped: {cross_validation_err}"');
  lines.push('        result["warnings"].append(cross_validation_warning)');
  lines.push('        print(cross_validation_warning)');
  lines.push('');

  // ── Task-type specific metrics ──
  if (taskType === 'classification') {
    lines.push('# Classification-specific metrics');
    lines.push('');
    lines.push('# Confusion matrix');
    lines.push('labels = sorted([str(c) for c in y.unique()])');
    lines.push('cm = confusion_matrix(y_test, y_pred, labels=sorted(y.unique()))');
    lines.push('cm_normalized = cm.astype(float) / cm.sum(axis=1, keepdims=True)');
    lines.push('cm_normalized = np.nan_to_num(cm_normalized)');
    lines.push('result["confusion_matrix"] = {');
    lines.push('    "matrix": cm.tolist(),');
    lines.push('    "matrix_normalized": cm_normalized.tolist(),');
    lines.push('    "labels": labels');
    lines.push('}');
    lines.push('');

    lines.push('# Classification report');
    lines.push('report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)');
    lines.push('result["classification_report"] = {}');
    lines.push('for key, val in report.items():');
    lines.push('    if isinstance(val, dict):');
    lines.push('        result["classification_report"][str(key)] = {k: float(v) for k, v in val.items()}');
    lines.push('    else:');
    lines.push('        result["classification_report"][str(key)] = float(val)');
    lines.push('');

    lines.push('# Class distribution');
    lines.push('train_dist = y_train.value_counts().to_dict()');
    lines.push('test_dist = y_test.value_counts().to_dict()');
    lines.push('result["class_distribution"] = {');
    lines.push('    "train": {str(k): int(v) for k, v in train_dist.items()},');
    lines.push('    "test": {str(k): int(v) for k, v in test_dist.items()}');
    lines.push('}');
    lines.push('');

    lines.push('# Probability-based curves');
    lines.push('has_proba = hasattr(pipeline, "predict_proba")');
    lines.push('try:');
    lines.push('  if has_proba:');
    lines.push('    y_proba = pipeline.predict_proba(X_test)');
    lines.push('    classes = [str(c) for c in fitted_model.classes_]');
    lines.push('    n_classes = len(classes)');
    lines.push('');
    lines.push('    # Binarize for multiclass curves');
    lines.push('    y_test_bin = None');
    lines.push('    if n_classes > 2:');
    lines.push('        from sklearn.preprocessing import label_binarize');
    lines.push('        y_test_bin = label_binarize(y_test, classes=fitted_model.classes_)');
    lines.push('');
    lines.push('    # ROC curves');
    lines.push('    roc_curves = {}');
    lines.push('    if n_classes == 2:');
    lines.push('        fpr, tpr, _ = roc_curve(y_test, y_proba[:, 1], pos_label=fitted_model.classes_[1])');
    lines.push('        roc_auc = float(auc(fpr, tpr))');
    lines.push('        roc_curves[classes[1]] = {"fpr": fpr.tolist(), "tpr": tpr.tolist(), "auc": roc_auc}');
    lines.push('    else:');
    lines.push('        for i, cls in enumerate(classes):');
    lines.push('            fpr, tpr, _ = roc_curve(y_test_bin[:, i], y_proba[:, i])');
    lines.push('            roc_auc = float(auc(fpr, tpr))');
    lines.push('            roc_curves[cls] = {"fpr": fpr.tolist(), "tpr": tpr.tolist(), "auc": roc_auc}');
    lines.push('    result["roc_curves"] = roc_curves');
    lines.push('');
    lines.push('    # Precision-recall curves');
    lines.push('    pr_curves = {}');
    lines.push('    if n_classes == 2:');
    lines.push('        prec, rec, _ = precision_recall_curve(y_test, y_proba[:, 1], pos_label=fitted_model.classes_[1])');
    lines.push('        ap = float(average_precision_score(y_test == fitted_model.classes_[1], y_proba[:, 1]))');
    lines.push('        pr_curves[classes[1]] = {"precision": prec.tolist(), "recall": rec.tolist(), "ap": ap}');
    lines.push('    else:');
    lines.push('        for i, cls in enumerate(classes):');
    lines.push('            prec, rec, _ = precision_recall_curve(y_test_bin[:, i], y_proba[:, i])');
    lines.push('            ap = float(average_precision_score(y_test_bin[:, i], y_proba[:, i]))');
    lines.push('            pr_curves[cls] = {"precision": prec.tolist(), "recall": rec.tolist(), "ap": ap}');
    lines.push('    result["precision_recall_curves"] = pr_curves');
    lines.push('');
    lines.push('    # Calibration curve (binary only)');
    lines.push('    if n_classes == 2:');
    lines.push('        from sklearn.calibration import calibration_curve as cal_curve');
    lines.push('        prob_true, prob_pred = cal_curve(y_test == fitted_model.classes_[1], y_proba[:, 1], n_bins=10)');
    lines.push('        result["calibration_curve"] = {');
    lines.push('            "prob_true": prob_true.tolist(),');
    lines.push('            "prob_pred": prob_pred.tolist(),');
    lines.push('            "n_bins": 10');
    lines.push('        }');
  lines.push('except Exception as curve_err:');
  lines.push('    probability_warning = f"Probability curves skipped: {curve_err}"');
  lines.push('    result["warnings"].append(probability_warning)');
  lines.push('    print(probability_warning)');
    lines.push('');
  } else if (taskType === 'regression') {
    lines.push('# Regression-specific metrics');
    lines.push('residuals_arr = (y_test.values - y_pred).tolist()');
    lines.push('result["residuals"] = {');
    lines.push('    "y_true": y_test.values.tolist(),');
    lines.push('    "y_pred": y_pred.tolist(),');
    lines.push('    "residuals": residuals_arr');
    lines.push('}');
    lines.push('');
    lines.push('# Residual histogram');
    lines.push('counts, bin_edges = np.histogram(residuals_arr, bins=30)');
    lines.push('result["residual_histogram"] = {');
    lines.push('    "bin_edges": bin_edges.tolist(),');
    lines.push('    "counts": counts.tolist()');
    lines.push('}');
    lines.push('');
  }

  // ── Save predictions artifact (includes features for error analysis) ──
  lines.push('# Save predictions — include features so error analysis can build an error tree');
  lines.push('pred_df = X_test.reset_index(drop=True)');
  lines.push('pred_df["y_true"] = y_test.values');
  lines.push('pred_df["y_pred"] = y_pred');
  lines.push('pred_df["original_index"] = y_test.index.tolist()');
  if (taskType === 'classification') {
    lines.push('pred_df["is_correct"] = (pred_df["y_true"] == pred_df["y_pred"])');
    lines.push('if has_proba:');
    lines.push('    for i, cls in enumerate(classes):');
    lines.push('        pred_df[f"proba_{cls}"] = y_proba[:, i]');
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
  lines.push('    import shap');
  lines.push('    X_shap = X_test.iloc[:1000] if len(X_test) > 1000 else X_test');
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
  lines.push('        X_train_transformed = pipeline.named_steps["preprocessor"].transform(X_train)');
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
  lines.push('            json.dump(shap_result, f)');
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

function loadRuntimeDependencies(
  model: { metadata?: Record<string, unknown>; algorithm?: string },
  workflowPrepSegments: string[],
): string[] {
  const metadata = asRecord(model.metadata);
  const storedDependencies = normalizeRuntimeDependencies(metadata?.runtimeDependencies);
  const inferredDependencies = inferRuntimeDependenciesFromModelType(model.algorithm);
  const codeInferredDependencies = inferRuntimeDependenciesFromCode(workflowPrepSegments.join('\n'));
  return normalizeRuntimeDependencies([
    ...storedDependencies,
    ...inferredDependencies,
    ...codeInferredDependencies,
  ]);
}

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
    }));

    // 3. Check prerequisites
    if (!model.artifact?.path) {
      throw new Error('Model has no artifact path');
    }
    if (model.taskType === 'clustering') {
      throw new Error('Clustering models do not support evaluation');
    }

    // 4. Get dataset info
    const dataset = await datasetRepository.getById(model.datasetId);
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
      throw new Error(executionResult.stderr || executionResult.error || 'Evaluation execution failed');
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
