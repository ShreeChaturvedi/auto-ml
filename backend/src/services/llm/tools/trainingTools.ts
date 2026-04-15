import type { LlmToolDefinition } from '../llmClient.js';

/**
 * Training lifecycle tool definitions.
 * These tools orchestrate the model training workflow: experiment setup,
 * plan proposal, execution, evaluation, registration, and comparison.
 */
export const TRAINING_TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    name: 'configure_experiment',
    description:
      'Set up a training experiment with model type, hyperparameters, and split strategy. ' +
      'Must be called before propose_training_plan to establish the experiment context.',
    parameters: {
      type: 'object',
      properties: {
        experimentName: {
          type: 'string',
          description: 'Human-readable name for this experiment.'
        },
        modelType: {
          type: 'string',
          description:
            'Model family or algorithm (e.g. "random_forest", "xgboost", "logistic_regression", "neural_network").'
        },
        hyperparameters: {
          type: 'object',
          description: 'Key-value map of hyperparameters for the chosen model type.',
          additionalProperties: true
        },
        splitStrategy: {
          type: 'string',
          enum: ['train_test', 'kfold', 'stratified_kfold', 'time_series'],
          description: 'Data split strategy for training and validation.'
        },
        splitRatio: {
          type: 'number',
          description: 'Train/test split ratio (e.g. 0.8 for 80% train). Defaults to 0.8.'
        },
        targetColumn: {
          type: 'string',
          description: 'Target column for supervised learning.'
        },
        featureColumns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Explicit list of feature columns. If omitted, all non-target columns are used.'
        },
        randomSeed: {
          type: 'number',
          description: 'Random seed for reproducibility.'
        }
      },
      required: ['experimentName', 'modelType', 'splitStrategy']
    }
  },
  {
    name: 'propose_training_plan',
    description:
      'Propose a training approach with rationale, including model choice justification, ' +
      'expected metrics, and potential risks. Returns a structured plan for user review.',
    parameters: {
      type: 'object',
      properties: {
        experimentId: {
          type: 'string',
          description: 'Experiment identifier from configure_experiment.'
        },
        rationale: {
          type: 'string',
          description: 'Explanation of why this model and configuration were chosen.'
        },
        expectedMetrics: {
          type: 'object',
          description: 'Expected metric ranges (e.g. { "accuracy": "0.85-0.92", "f1": "0.80-0.88" }).',
          additionalProperties: { type: 'string' }
        },
        risks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Known risks or caveats for this approach.'
        },
        alternatives: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              modelType: { type: 'string' },
              reason: { type: 'string' }
            },
            required: ['modelType', 'reason']
          },
          description: 'Alternative model approaches considered.'
        }
      },
      required: ['experimentId', 'rationale']
    }
  },
  {
    name: 'execute_training',
    description:
      'Run training code in the notebook and capture metrics. The code should be written ' +
      'to notebook cells first using write_cell/run_cell, then this tool records the execution outcome.',
    parameters: {
      type: 'object',
      properties: {
        experimentId: {
          type: 'string',
          description: 'Experiment identifier.'
        },
        cellIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Notebook cell IDs that contain the training code.'
        },
        prepSegments: {
          type: 'array',
          items: { type: 'string' },
          description: 'Notebook preparation code segments required to rebuild the training feature frame during later evaluation.'
        },
        metrics: {
          type: 'object',
          description: 'Training metrics captured from execution output.',
          additionalProperties: true
        },
        trainingDurationMs: {
          type: 'number',
          description: 'Training wall-clock duration in milliseconds.'
        },
        succeeded: {
          type: 'boolean',
          description: 'Whether training completed successfully.'
        },
        errorMessage: {
          type: 'string',
          description: 'Error message if training failed.'
        }
      },
      required: ['experimentId', 'succeeded']
    }
  },
  {
    name: 'evaluate_results',
    description:
      'Compute evaluation metrics on the trained model: accuracy, F1, confusion matrix, ' +
      'learning curves, and other task-appropriate metrics.',
    parameters: {
      type: 'object',
      properties: {
        experimentId: {
          type: 'string',
          description: 'Experiment identifier.'
        },
        metrics: {
          type: 'object',
          description:
            'Evaluation metrics (e.g. accuracy, f1, precision, recall, rmse, mae, r2, confusion_matrix).',
          additionalProperties: true
        },
        learningCurve: {
          type: 'object',
          properties: {
            trainScores: { type: 'array', items: { type: 'number' } },
            valScores: { type: 'array', items: { type: 'number' } },
            trainSizes: { type: 'array', items: { type: 'number' } }
          },
          description: 'Learning curve data points.'
        },
        featureImportance: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              feature: { type: 'string' },
              importance: { type: 'number' }
            },
            required: ['feature', 'importance']
          },
          description: 'Feature importance rankings.'
        },
        notes: {
          type: 'string',
          description: 'Additional evaluation notes or observations.'
        }
      },
      required: ['experimentId', 'metrics']
    }
  },
  {
    name: 'register_model',
    description:
      'Commit a trained model to the experiment registry with its metrics, hyperparameters, ' +
      'and metadata. This makes the model available for comparison and deployment.',
    parameters: {
      type: 'object',
      properties: {
        experimentId: {
          type: 'string',
          description: 'Experiment identifier.'
        },
        modelName: {
          type: 'string',
          description: 'Display name for the registered model.'
        },
        modelType: {
          type: 'string',
          description: 'Model type/algorithm used.'
        },
        metrics: {
          type: 'object',
          description: 'Final evaluation metrics for this model.',
          additionalProperties: true
        },
        hyperparameters: {
          type: 'object',
          description: 'Hyperparameters used for training.',
          additionalProperties: true
        },
        artifactPath: {
          type: 'string',
          description: 'Relative path to the serialized model artifact (for example "model.joblib").'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorizing the model (e.g. "baseline", "tuned", "production").'
        }
      },
      required: ['experimentId', 'modelName', 'modelType', 'metrics', 'artifactPath']
    }
  },
  {
    name: 'compare_models',
    description:
      'Side-by-side comparison of registered models. Returns a comparison table with metrics, ' +
      'hyperparameters, and a recommendation.',
    parameters: {
      type: 'object',
      properties: {
        experimentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of experiment IDs to compare.'
        },
        primaryMetric: {
          type: 'string',
          description: 'Primary metric for ranking models (e.g. "f1", "accuracy", "rmse").'
        },
        includeHyperparameters: {
          type: 'boolean',
          description: 'Whether to include hyperparameter details in the comparison.'
        },
        sortOrder: {
          type: 'string',
          enum: ['ascending', 'descending'],
          description: 'Sort order for ranking. Use "ascending" for error metrics (RMSE, MAE) where lower is better. Defaults to auto-detect based on metric name.'
        }
      },
      required: ['experimentIds', 'primaryMetric']
    }
  }
];

export const TRAINING_TOOL_NAMES: readonly string[] = TRAINING_TOOL_DEFINITIONS.map((t) => t.name);
