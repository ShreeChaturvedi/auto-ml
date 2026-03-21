import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import type { ModelTaskType } from '../types/model.js';

import { getOrCreateContainer } from './containerManager.js';
import { syncWorkspaceDatasets } from './executionWorkspace.js';
import * as kernelManager from './kernelManager.js';
import { buildDatasetLoadLines, buildPreprocessingLines, buildTrainTestSplitLines } from './pythonScriptUtils.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const modelRepository = createModelRepository(env.modelMetadataPath);

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => appLogger.info(`[evaluationService] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Record<string, unknown>) => appLogger.warn(`[evaluationService] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>) => appLogger.error(`[evaluationService] ${msg}`, meta ?? ''),
};

const EVALUATION_TIMEOUT_MS = 300_000; // 5 minutes

interface BuildEvaluationScriptOptions {
  modelPath: string;
  datasetPath: string;
  outputDir: string;
  taskType: ModelTaskType;
  targetColumn: string;
  testSize: number;
}

export function buildEvaluationScript(options: BuildEvaluationScriptOptions): string {
  const {
    modelPath,
    datasetPath,
    outputDir,
    taskType,
    targetColumn,
    testSize,
  } = options;

  const lines: string[] = [];

  // ── Imports ──
  lines.push('import json');
  lines.push('import time');
  lines.push('import os');
  lines.push('import numpy as np');
  lines.push('import pandas as pd');
  lines.push('import joblib');
  lines.push('from sklearn.model_selection import train_test_split, cross_val_score, learning_curve');
  lines.push('from sklearn.inspection import permutation_importance');

  if (taskType === 'classification') {
    lines.push('from sklearn.metrics import (');
    lines.push('    confusion_matrix, classification_report, roc_curve, auc,');
    lines.push('    precision_recall_curve, average_precision_score, calibration_curve');
    lines.push(')');
  } else if (taskType === 'regression') {
    lines.push('from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score');
  }

  lines.push('');
  lines.push('start_time = time.time()');
  lines.push('');

  // ── Output dir ──
  lines.push(`output_dir = ${JSON.stringify(outputDir)}`);
  lines.push('os.makedirs(output_dir, exist_ok=True)');
  lines.push('');

  // ── Load model ──
  lines.push(`model = joblib.load(${JSON.stringify(modelPath)})`);
  lines.push('');

  // ── Load dataset ──
  lines.push(...buildDatasetLoadLines(datasetPath));
  lines.push('');

  // ── Preprocessing (same as training) ──
  lines.push(...buildPreprocessingLines({
    targetColumn,
    includeFeatureColumns: true,
  }));
  lines.push('');

  // ── Train/test split ──
  lines.push(...buildTrainTestSplitLines({ taskType, testSize }));
  lines.push('');

  // ── Predictions ──
  lines.push('y_pred = model.predict(X_test)');
  lines.push('');

  // ── Result dict ──
  lines.push('result = {}');
  lines.push(`result["taskType"] = ${JSON.stringify(taskType)}`);
  lines.push('');

  // ── Feature importance ──
  lines.push('# Feature importance');
  lines.push('fi = {}');
  lines.push('');
  lines.push('# Model-based importance');
  lines.push('if hasattr(model, "feature_importances_"):');
  lines.push('    fi["model_based"] = {');
  lines.push('        "features": feature_columns,');
  lines.push('        "importances": [float(x) for x in model.feature_importances_]');
  lines.push('    }');
  lines.push('elif hasattr(model, "coef_"):');
  lines.push('    coefs = model.coef_');
  lines.push('    if coefs.ndim > 1:');
  lines.push('        coefs = np.mean(np.abs(coefs), axis=0)');
  lines.push('    else:');
  lines.push('        coefs = np.abs(coefs)');
  lines.push('    fi["model_based"] = {');
  lines.push('        "features": feature_columns,');
  lines.push('        "importances": [float(x) for x in coefs]');
  lines.push('    }');
  lines.push('');
  lines.push('# Permutation importance');
  lines.push('perm_result = permutation_importance(model, X_test, y_test, n_repeats=10, random_state=42, n_jobs=-1)');
  lines.push('fi["permutation"] = {');
  lines.push('    "features": feature_columns,');
  lines.push('    "importances_mean": [float(x) for x in perm_result.importances_mean],');
  lines.push('    "importances_std": [float(x) for x in perm_result.importances_std]');
  lines.push('}');
  lines.push('result["feature_importance"] = fi');
  lines.push('');

  // ── Learning curve ──
  lines.push('# Learning curve');
  lines.push('max_samples = min(3000, len(X))');
  lines.push('X_lc = X.iloc[:max_samples]');
  lines.push('y_lc = y.iloc[:max_samples]');
  lines.push('train_sizes_abs, train_scores, test_scores = learning_curve(');
  lines.push('    model, X_lc, y_lc, train_sizes=np.linspace(0.1, 1.0, 8), cv=5, n_jobs=-1');
  lines.push(')');
  lines.push('result["learning_curve"] = {');
  lines.push('    "train_sizes": [int(x) for x in train_sizes_abs],');
  lines.push('    "train_scores_mean": [float(x) for x in train_scores.mean(axis=1)],');
  lines.push('    "train_scores_std": [float(x) for x in train_scores.std(axis=1)],');
  lines.push('    "test_scores_mean": [float(x) for x in test_scores.mean(axis=1)],');
  lines.push('    "test_scores_std": [float(x) for x in test_scores.std(axis=1)]');
  lines.push('}');
  lines.push('');

  // ── Cross validation ──
  lines.push('# Cross validation');
  if (taskType === 'classification') {
    lines.push('scoring = "accuracy"');
  } else {
    lines.push('scoring = "r2"');
  }
  lines.push('cv_scores = cross_val_score(model, X, y, cv=5, scoring=scoring, n_jobs=-1)');
  lines.push('result["cross_validation"] = {');
  lines.push('    "scores": [float(x) for x in cv_scores],');
  lines.push('    "mean": float(cv_scores.mean()),');
  lines.push('    "std": float(cv_scores.std()),');
  lines.push('    "scoring": scoring');
  lines.push('}');
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
    lines.push('has_proba = hasattr(model, "predict_proba")');
    lines.push('try:');
    lines.push('  if has_proba:');
    lines.push('    y_proba = model.predict_proba(X_test)');
    lines.push('    classes = [str(c) for c in model.classes_]');
    lines.push('    n_classes = len(classes)');
    lines.push('');
    lines.push('    # Binarize for multiclass curves');
    lines.push('    y_test_bin = None');
    lines.push('    if n_classes > 2:');
    lines.push('        from sklearn.preprocessing import label_binarize');
    lines.push('        y_test_bin = label_binarize(y_test, classes=model.classes_)');
    lines.push('');
    lines.push('    # ROC curves');
    lines.push('    roc_curves = {}');
    lines.push('    if n_classes == 2:');
    lines.push('        fpr, tpr, _ = roc_curve(y_test, y_proba[:, 1], pos_label=model.classes_[1])');
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
    lines.push('        prec, rec, _ = precision_recall_curve(y_test, y_proba[:, 1], pos_label=model.classes_[1])');
    lines.push('        ap = float(average_precision_score(y_test == model.classes_[1], y_proba[:, 1]))');
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
    lines.push('        prob_true, prob_pred = cal_curve(y_test == model.classes_[1], y_proba[:, 1], n_bins=10)');
    lines.push('        result["calibration_curve"] = {');
    lines.push('            "prob_true": prob_true.tolist(),');
    lines.push('            "prob_pred": prob_pred.tolist(),');
    lines.push('            "n_bins": 10');
    lines.push('        }');
    lines.push('except Exception as curve_err:');
    lines.push('    print(f"Probability curves skipped: {curve_err}")');
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

  // ── Save predictions parquet ──
  lines.push('# Save predictions');
  lines.push('pred_df = pd.DataFrame({');
  lines.push('    "y_true": y_test.values,');
  lines.push('    "y_pred": y_pred,');
  lines.push('    "original_index": y_test.index.tolist()');
  lines.push('})');
  if (taskType === 'classification') {
    lines.push('pred_df["is_correct"] = (pred_df["y_true"] == pred_df["y_pred"])');
    lines.push('if has_proba:');
    lines.push('    for i, cls in enumerate(classes):');
    lines.push('        pred_df[f"proba_{cls}"] = y_proba[:, i]');
  } else {
    lines.push('pred_df["is_correct"] = False  # not applicable for regression');
  }
  lines.push('pred_df.to_parquet(os.path.join(output_dir, "predictions.parquet"), index=False)');
  lines.push('');

  // ── Timing ──
  lines.push('compute_ms = int((time.time() - start_time) * 1000)');
  lines.push('result["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())');
  lines.push('result["computeMs"] = compute_ms');
  lines.push('');

  // ── Save evaluation.json ──
  lines.push('with open(os.path.join(output_dir, "evaluation.json"), "w") as f:');
  lines.push('    json.dump(result, f)');
  lines.push('');

  // ── SHAP computation (best-effort) ──
  lines.push('# SHAP computation (best-effort, failure does not block evaluation)');
  lines.push('try:');
  lines.push('    import shap');
  lines.push('    X_shap = X_test.iloc[:1000] if len(X_test) > 1000 else X_test');
  lines.push('    shap_values = None');
  lines.push('    explainer = None');
  lines.push('');
  lines.push('    # Tree-based models');
  lines.push('    if hasattr(model, "estimators_") or hasattr(model, "get_booster"):');
  lines.push('        explainer = shap.TreeExplainer(model)');
  lines.push('        shap_values = explainer.shap_values(X_shap)');
  lines.push('    # Linear models');
  lines.push('    elif hasattr(model, "coef_"):');
  lines.push('        explainer = shap.LinearExplainer(model, X_train)');
  lines.push('        shap_values = explainer.shap_values(X_shap)');
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
  lines.push('            "data": X_shap.values.tolist(),');
  lines.push('            "feature_names": feature_columns,');
  lines.push('            "mean_abs_values": [float(x) for x in np.mean(np.abs(shap_arr), axis=0)]');
  lines.push('        }');
  lines.push('        with open(os.path.join(output_dir, "shap.json"), "w") as f:');
  lines.push('            json.dump(shap_result, f)');
  lines.push('except Exception as shap_err:');
  lines.push('    print(f"SHAP computation skipped: {shap_err}")');
  lines.push('');
  lines.push('print("Evaluation complete")');

  return lines.join('\n');
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
    if (!model.targetColumn) {
      throw new Error('Model has no target column (clustering models are not evaluated)');
    }
    if (model.taskType === 'clustering') {
      throw new Error('Clustering models do not support evaluation');
    }

    // 4. Get dataset info
    const dataset = await datasetRepository.getById(model.datasetId);
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    // 5. Get container
    const container = await getOrCreateContainer({
      projectId: model.projectId,
      pythonVersion: '3.11',
      workspacePath: join(env.executionWorkspaceDir, model.projectId, 'model-runtime'),
    });

    // 6. Sync workspace datasets
    if (container.workspacePath) {
      await syncWorkspaceDatasets(model.projectId, container.workspacePath).catch((error) => {
        logger.warn('Failed to sync datasets', { modelId, error });
      });
    }

    // 7. Build paths
    const containerModelPath = `/workspace/models/${modelId}/model.joblib`;
    const containerDatasetPath = `/workspace/datasets/${dataset.filename}`;
    const containerOutputDir = `/workspace/eval/${modelId}`;

    // Ensure the model artifact is available in the container workspace
    const workspaceModelDir = join(container.workspacePath, 'models', modelId);
    const workspaceModelPath = join(workspaceModelDir, 'model.joblib');
    if (!existsSync(workspaceModelPath)) {
      await mkdir(workspaceModelDir, { recursive: true });
      await copyFile(model.artifact.path, workspaceModelPath);
    }

    // 8. Build evaluation script
    const script = buildEvaluationScript({
      modelPath: containerModelPath,
      datasetPath: containerDatasetPath,
      outputDir: containerOutputDir,
      taskType: model.taskType as 'classification' | 'regression',
      targetColumn: model.targetColumn,
      testSize: 0.2,
    });

    // 9. Execute in Docker
    const result = await kernelManager.execute(container, script, EVALUATION_TIMEOUT_MS);

    // 10. Check result
    if (result.status !== 'success') {
      throw new Error(result.stderr || result.error || 'Evaluation execution failed');
    }

    // 11. Copy artifacts to permanent storage
    const evalWorkspaceDir = join(container.workspacePath, 'eval', modelId);
    const storageDir = join(env.modelStorageDir, modelId);
    await mkdir(storageDir, { recursive: true });

    const evaluationJsonSrc = join(evalWorkspaceDir, 'evaluation.json');
    const shapJsonSrc = join(evalWorkspaceDir, 'shap.json');
    const predictionsParquetSrc = join(evalWorkspaceDir, 'predictions.parquet');

    const copyPromises: Promise<void>[] = [];

    if (existsSync(evaluationJsonSrc)) {
      copyPromises.push(copyFile(evaluationJsonSrc, join(storageDir, 'evaluation.json')));
    }
    if (existsSync(shapJsonSrc)) {
      copyPromises.push(copyFile(shapJsonSrc, join(storageDir, 'shap.json')));
    }
    if (existsSync(predictionsParquetSrc)) {
      copyPromises.push(copyFile(predictionsParquetSrc, join(storageDir, 'predictions.parquet')));
    }

    await Promise.all(copyPromises);

    // 12. Set evaluationStatus = 'ready'
    await modelRepository.update(modelId, (current) => ({
      ...current,
      evaluationStatus: 'ready' as const,
      evaluationComputedAt: new Date().toISOString(),
    }));

    logger.info('Evaluation completed successfully', { modelId });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
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
