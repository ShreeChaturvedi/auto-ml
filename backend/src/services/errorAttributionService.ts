import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import type { ErrorAnalysisResult } from '../types/experiments.js';
import type { ModelTaskType } from '../types/model.js';

import { getOrCreateContainer } from './containerManager.js';
import { syncWorkspaceDatasets } from './executionWorkspace.js';
import * as kernelManager from './kernelManager.js';

const modelRepository = createModelRepository(env.modelMetadataPath);

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => appLogger.info(`[errorAttribution] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Record<string, unknown>) => appLogger.warn(`[errorAttribution] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>) => appLogger.error(`[errorAttribution] ${msg}`, meta ?? ''),
};

const ERROR_ANALYSIS_TIMEOUT_MS = 120_000; // 2 minutes

/* ------------------------------------------------------------------ */
/*  Script builder                                                     */
/* ------------------------------------------------------------------ */

interface BuildErrorAnalysisScriptOptions {
  predictionsPath: string;
  outputDir: string;
  targetColumn: string;
  taskType: ModelTaskType;
}

export function buildErrorAnalysisScript(options: BuildErrorAnalysisScriptOptions): string {
  const { predictionsPath, outputDir, targetColumn, taskType } = options;

  const lines: string[] = [];

  // ── Imports ──
  lines.push('import json');
  lines.push('import os');
  lines.push('import numpy as np');
  lines.push('import pandas as pd');
  lines.push('from sklearn.tree import DecisionTreeClassifier');
  lines.push('');

  // ── Output dir ──
  lines.push(`output_dir = ${JSON.stringify(outputDir)}`);
  lines.push('os.makedirs(output_dir, exist_ok=True)');
  lines.push('');

  // ── Load predictions ──
  lines.push(`pred_df = pd.read_parquet(${JSON.stringify(predictionsPath)})`);
  lines.push(`target_column = ${JSON.stringify(targetColumn)}`);
  lines.push(`task_type = ${JSON.stringify(taskType)}`);
  lines.push('');

  lines.push('result = {}');
  lines.push('');

  // ── Error Tree ──
  lines.push('# Error tree: train a DecisionTreeClassifier(max_depth=4) on is_correct ~ features');
  lines.push("if 'is_correct' in pred_df.columns:");
  lines.push("    exclude = {'y_true', 'y_pred', 'is_correct', 'original_index'}");
  lines.push("    feature_cols = [c for c in pred_df.columns if c not in exclude and not c.startswith('y_proba_') and not c.startswith('proba_')]");
  lines.push('');
  lines.push('    if len(feature_cols) > 0:');
  lines.push('        X_err = pred_df[feature_cols].copy()');
  lines.push('        # Encode any object columns');
  lines.push("        for col in X_err.select_dtypes(include=['object', 'category']).columns:");
  lines.push('            X_err[col] = X_err[col].astype(str).factorize()[0]');
  lines.push('        X_err = X_err.fillna(0)');
  lines.push('        y_err = pred_df["is_correct"].astype(int)');
  lines.push('        tree = DecisionTreeClassifier(max_depth=4, random_state=42)');
  lines.push('        tree.fit(X_err, y_err)');
  lines.push('');
  lines.push('        # Build tree structure recursively');
  lines.push('        def build_tree_node(node_id=0):');
  lines.push('            t = tree.tree_');
  lines.push('            n_samples = int(t.n_node_samples[node_id])');
  lines.push('            # value shape: (n_nodes, n_classes, n_outputs) — for binary: [incorrect, correct]');
  lines.push('            values = t.value[node_id].flatten()');
  lines.push('            # Class 0 = incorrect (is_correct=0), Class 1 = correct (is_correct=1)');
  lines.push('            error_count = int(values[0]) if len(values) > 0 else 0');
  lines.push('            error_rate = float(error_count / n_samples) if n_samples > 0 else 0.0');
  lines.push('');
  lines.push('            node = {');
  lines.push("                'node_id': int(node_id),");
  lines.push("                'error_rate': round(error_rate, 4),");
  lines.push("                'sample_count': n_samples,");
  lines.push("                'error_count': error_count,");
  lines.push('            }');
  lines.push('');
  lines.push('            # Check if this is a split node (not a leaf)');
  lines.push('            left_child = t.children_left[node_id]');
  lines.push('            right_child = t.children_right[node_id]');
  lines.push('            if left_child != right_child:  # not a leaf');
  lines.push("                node['feature'] = feature_cols[t.feature[node_id]]");
  lines.push("                node['threshold'] = round(float(t.threshold[node_id]), 4)");
  lines.push("                node['left'] = build_tree_node(left_child)");
  lines.push("                node['right'] = build_tree_node(right_child)");
  lines.push('');
  lines.push('            return node');
  lines.push('');
  lines.push("        result['error_tree'] = build_tree_node()");
  lines.push('');

  // ── Misclassifications table (classification only) ──
  lines.push('    # Misclassifications table (top 50 by confidence, classification only)');
  lines.push("    if task_type == 'classification':");
  lines.push("        wrong = pred_df[pred_df['is_correct'] == False].copy()");
  lines.push("        proba_cols = [c for c in pred_df.columns if c.startswith('y_proba_') or c.startswith('proba_')]");
  lines.push('        if proba_cols:');
  lines.push("            wrong['confidence'] = wrong[proba_cols].max(axis=1)");
  lines.push('        else:');
  lines.push("            wrong['confidence'] = 0.5");
  lines.push("        wrong = wrong.sort_values('confidence', ascending=False).head(50)");
  lines.push('');
  lines.push('        misclassifications = []');
  lines.push('        for _, row in wrong.iterrows():');
  lines.push('            misclassifications.append({');
  lines.push("                'index': int(row.get('original_index', 0)),");
  lines.push("                'y_true': str(row['y_true']),");
  lines.push("                'y_pred': str(row['y_pred']),");
  lines.push("                'confidence': round(float(row['confidence']), 4),");
  lines.push("                'top_shap_contributors': []");
  lines.push('            })');
  lines.push("        result['misclassifications'] = misclassifications");
  lines.push('');

  // ── Save ──
  lines.push("# Save error analysis result");
  lines.push("with open(os.path.join(output_dir, 'error_analysis.json'), 'w') as f:");
  lines.push('    json.dump(result, f)');
  lines.push('');
  lines.push('print("Error analysis complete")');

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Runner                                                             */
/* ------------------------------------------------------------------ */

export async function runErrorAnalysis(modelId: string): Promise<ErrorAnalysisResult | null> {
  try {
    // 1. Read model record
    const model = await modelRepository.getById(modelId);
    if (!model) {
      logger.error('Model not found for error analysis', { modelId });
      return null;
    }

    // 2. Check prerequisites
    if (!model.artifact?.path) {
      logger.warn('Model has no artifact path', { modelId });
      return null;
    }
    if (!model.targetColumn) {
      logger.warn('Model has no target column', { modelId });
      return null;
    }
    if (model.taskType === 'clustering') {
      logger.warn('Clustering models do not support error analysis', { modelId });
      return null;
    }

    // 3. Check if predictions.parquet exists in permanent storage
    const storagePredictionsPath = join(env.modelStorageDir, modelId, 'predictions.parquet');
    if (!existsSync(storagePredictionsPath)) {
      logger.warn('predictions.parquet not found', { modelId, path: storagePredictionsPath });
      return null;
    }

    // 4. Get container
    const container = await getOrCreateContainer({
      projectId: model.projectId,
      pythonVersion: '3.11',
      workspacePath: join(env.executionWorkspaceDir, model.projectId, 'model-runtime'),
    });

    // 5. Sync workspace datasets (best-effort)
    if (container.workspacePath) {
      await syncWorkspaceDatasets(model.projectId, container.workspacePath).catch((error) => {
        logger.warn('Failed to sync datasets', { modelId, error });
      });
    }

    // 6. Build paths
    const containerPredictionsPath = `/workspace/eval/${modelId}/predictions.parquet`;
    const containerOutputDir = `/workspace/error-analysis/${modelId}`;

    // Ensure predictions.parquet is in the container workspace
    const workspaceEvalDir = join(container.workspacePath, 'eval', modelId);
    const workspacePredPath = join(workspaceEvalDir, 'predictions.parquet');
    if (!existsSync(workspacePredPath)) {
      await mkdir(workspaceEvalDir, { recursive: true });
      await copyFile(storagePredictionsPath, workspacePredPath);
    }

    // 7. Build and execute script
    const script = buildErrorAnalysisScript({
      predictionsPath: containerPredictionsPath,
      outputDir: containerOutputDir,
      targetColumn: model.targetColumn,
      taskType: model.taskType as 'classification' | 'regression',
    });

    const result = await kernelManager.execute(container, script, ERROR_ANALYSIS_TIMEOUT_MS);

    if (result.status !== 'success') {
      logger.error('Error analysis execution failed', {
        modelId,
        stderr: result.stderr,
        error: result.error,
      });
      return null;
    }

    // 8. Copy error_analysis.json to permanent storage
    const errorAnalysisWorkspacePath = join(
      container.workspacePath,
      'error-analysis',
      modelId,
      'error_analysis.json',
    );
    const storageDir = join(env.modelStorageDir, modelId);
    await mkdir(storageDir, { recursive: true });

    if (existsSync(errorAnalysisWorkspacePath)) {
      await copyFile(errorAnalysisWorkspacePath, join(storageDir, 'error_analysis.json'));
    } else {
      logger.error('error_analysis.json not produced by script', { modelId });
      return null;
    }

    // 9. Read and return the result
    const raw = await readFile(join(storageDir, 'error_analysis.json'), 'utf8');
    const parsed = JSON.parse(raw) as ErrorAnalysisResult;

    logger.info('Error analysis completed successfully', { modelId });
    return parsed;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Error analysis failed', { modelId, error: errorMessage });
    return null;
  }
}
