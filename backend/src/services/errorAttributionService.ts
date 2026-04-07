import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import type { ErrorAnalysisResult } from '../types/experiments.js';
import type { ModelTaskType } from '../types/model.js';
import {
  copyArtifactsToPermanentStorage,
  orchestrateContainerExecution,
} from '../utils/containerOrchestrator.js';
import { resolveAndHealTargetColumn } from '../utils/modelUtils.js';

import {
  buildOutputDirSetup,
  buildResultSaving,
  buildStandardImports,
} from './pythonScriptUtils.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
const modelRepository = createModelRepository(env.modelMetadataPath);

const logger = appLogger.child({ service: 'errorAttribution' });

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
  lines.push(
    ...buildStandardImports([
      'from sklearn.tree import DecisionTreeClassifier',
    ])
  );

  // ── Output dir ──
  lines.push(...buildOutputDirSetup(outputDir));

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
  lines.push(
    ...buildResultSaving('output_dir', {
      resultVar: 'result',
      filename: 'error_analysis.json',
    })
  );
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
    if (model.taskType === 'clustering') {
      logger.warn('Clustering models do not support error analysis', { modelId });
      return null;
    }

    // 3. Resolve target column (heals stale metadata)
    const dataset = await datasetRepository.getById(model.datasetId);
    if (!dataset) {
      logger.warn('Dataset not found for error analysis', { modelId, datasetId: model.datasetId });
      return null;
    }
    const resolvedTargetColumn = await resolveAndHealTargetColumn(model, dataset.columns, modelRepository);

    // 4. Compute paths
    const storagePredictionsPath = join(env.modelStorageDir, modelId, 'predictions.parquet');
    const workspacePath = join(env.executionWorkspaceDir, model.projectId, 'model-runtime');
    const workspacePredPath = join(workspacePath, 'eval', modelId, 'predictions.parquet');

    // 5-8. Orchestrate container execution
    const { container, executionResult } = await orchestrateContainerExecution({
      projectId: model.projectId,
      pythonVersion: '3.11',
      scriptBuilder: () =>
        buildErrorAnalysisScript({
          predictionsPath: `/workspace/eval/${modelId}/predictions.parquet`,
          outputDir: `/workspace/error-analysis/${modelId}`,
          targetColumn: resolvedTargetColumn,
          taskType: model.taskType as 'classification' | 'regression',
        }),
      filesToCopy: [
        {
          permanentPath: storagePredictionsPath,
          workspacePath: workspacePredPath,
        },
      ],
      timeoutMs: ERROR_ANALYSIS_TIMEOUT_MS,
      containerOutputDir: `/workspace/error-analysis/${modelId}`,
    });

    if (executionResult.status !== 'success') {
      logger.error('Error analysis execution failed', {
        modelId,
        stderr: executionResult.stderr,
        error: executionResult.error,
      });
      return null;
    }

    // 9. Copy error_analysis.json to permanent storage
    await copyArtifactsToPermanentStorage(modelId, container, [
      {
        workspace: `error-analysis/${modelId}/error_analysis.json`,
        permanent: 'error_analysis.json',
      },
    ]);

    // 10. Read and return the result
    const raw = await readFile(join(env.modelStorageDir, modelId, 'error_analysis.json'), 'utf8');
    const parsed = JSON.parse(raw) as ErrorAnalysisResult;

    logger.info('Error analysis completed successfully', { modelId });
    return parsed;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Error analysis failed', { modelId, error: errorMessage });
    return null;
  }
}
