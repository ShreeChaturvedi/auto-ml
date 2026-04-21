import { describe, expect, it } from 'vitest';

import { buildTrainingRequest } from './trainingWorkflow.js';

describe('buildTrainingRequest', () => {
  const dataset = {
    datasetId: 'dataset-1',
    projectId: 'project-1',
    filename: 'feature_v1.csv',
    nRows: 100,
    nCols: 4,
    columns: [
      { name: 'Subject Area', dtype: 'string' },
      { name: 'usage_count', dtype: 'number' },
      { name: 'date_month', dtype: 'number' },
      { name: 'date_year', dtype: 'number' }
    ],
    sample: []
  };

  it('keeps prior experiment context after the first training write_cell', () => {
    const request = buildTrainingRequest({
      dataset,
      prompt: 'Continue training.',
      currentNode: 'write_code',
      toolResults: [
        {
          tool: 'write_cell',
          output: { cellId: 'cell-1' }
        }
      ],
      toolCallHistory: [
        { name: 'configure_experiment', args: { experimentName: 'subject_area_rf_v1' } },
        { name: 'propose_training_plan', args: { experimentId: 'exp-1' } }
      ],
      toolResultHistory: [
        { name: 'configure_experiment', response: { experimentId: 'exp-1' } },
        { name: 'propose_training_plan', response: { status: 'awaiting_approval' } }
      ]
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('CONTINUATION: ACTION REQUIRED: A training experiment is already configured and approved.');
    expect(userMessage?.content).toContain('call run_cell on it now');
    expect(userMessage?.content).not.toContain('No training experiment is configured yet');
  });

  it('uses the previously configured experimentId when run_cell succeeds in the resumed turn', () => {
    const request = buildTrainingRequest({
      dataset,
      prompt: 'Continue training.',
      currentNode: 'write_code',
      toolResults: [
        {
          tool: 'run_cell',
          output: {
            status: 'success',
            stdout: '{"accuracy": 0.93}'
          }
        }
      ],
      toolCallHistory: [
        { name: 'configure_experiment', args: { experimentName: 'subject_area_rf_v1' } },
        { name: 'propose_training_plan', args: { experimentId: 'exp-1' } }
      ],
      toolResultHistory: [
        { name: 'configure_experiment', response: { experimentId: 'exp-1' } },
        { name: 'propose_training_plan', response: { status: 'awaiting_approval' } }
      ]
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('CONTINUATION: ACTION REQUIRED: The training code ran successfully. Call execute_training NOW with experimentId="exp-1"');
    expect(userMessage?.content).not.toContain('no experiment is configured');
  });

  it('does not treat a fresh training turn as an approved continuation just because older history contains a proposal', () => {
    const request = buildTrainingRequest({
      dataset,
      prompt: 'Tune regularization while predicting usage_log1p from feature_v1.',
      currentNode: 'configure_experiment',
      toolResults: [],
      toolCallHistory: [
        { name: 'configure_experiment', args: { experimentName: 'older_run' } },
        { name: 'propose_training_plan', args: { experimentId: 'exp-old' } }
      ],
      toolResultHistory: [
        { name: 'configure_experiment', response: { experimentId: 'exp-old' } },
        { name: 'propose_training_plan', response: { status: 'awaiting_approval' } }
      ]
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('Start by calling configure_experiment');
    expect(userMessage?.content).not.toContain('The user approved the training plan from the previous turn');
  });

  it('redirects missing-experiment failures back to configure_experiment and proposal flow', () => {
    const request = buildTrainingRequest({
      dataset,
      prompt: 'Continue training.',
      currentNode: 'evaluate_results',
      toolResults: [
        {
          tool: 'register_model',
          error: 'Experiment ridge_usage_log1p_feature_v1 not found. Call configure_experiment first.'
        }
      ]
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('wrong experiment identifier');
    expect(userMessage?.content).toContain('Call configure_experiment now');
    expect(userMessage?.content).toContain('call propose_training_plan and stop for approval');
  });

  it('forces a corrected configure_experiment retry when proxy-model substitution is rejected', () => {
    const request = buildTrainingRequest({
      dataset,
      prompt: 'Train a decision tree regressor to predict monthly_spend.',
      currentNode: 'configure_experiment',
      toolResults: [
        {
          tool: 'configure_experiment',
          error: 'Experiment name "Decision Tree Regressor for monthly_spend" implies modelType="decision_tree_regressor" but configure_experiment requested "random_forest_regressor". Retry with modelType="decision_tree_regressor" and do not substitute a proxy model.'
        }
      ]
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('substituted the wrong model family');
    expect(userMessage?.content).toContain('modelType="decision_tree_regressor"');
    expect(userMessage?.content).toContain('Do NOT respond with fallback prose');
  });

  it('includes the selected dataset and target controls in the request context', () => {
    const request = buildTrainingRequest({
      dataset,
      targetColumn: 'Subject Area',
      prompt: 'Tune regularization while predicting usage_log1p from feature_v1.'
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('Selected training controls');
    expect(userMessage?.content).toContain('dataset "feature_v1.csv" and target "Subject Area"');
  });

  it('repairs markdown write failures by directing the model back to small executable code cells', () => {
    const request = buildTrainingRequest({
      dataset,
      prompt: 'Continue training.',
      currentNode: 'write_code',
      toolResults: [
        {
          tool: 'write_cell',
          error: 'Markdown cells are not allowed during training execution. Write executable code cells only.'
        }
      ]
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('Repair the notebook by writing ONLY executable code cells');
    expect(userMessage?.content).toContain('imports/config first');
  });

  it('repairs datetime promotion failures by directing the model to convert or drop raw datetime columns before numeric preprocessing', () => {
    const request = buildTrainingRequest({
      dataset,
      prompt: 'Continue training.',
      currentNode: 'write_code',
      toolResults: [
        {
          tool: 'run_cell',
          error: 'DTypePromotionError: datetime64 could not be promoted by float64 during numeric imputation.'
        }
      ]
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('raw datetime columns never enter numeric preprocessing');
    expect(userMessage?.content).toContain('convert it to numeric/ordinal values, derive date parts, or drop the raw datetime column');
    expect(userMessage?.content).toContain('date_month/date_year');
  });

  it('forces proposal after experiments are configured in propose_model stage', () => {
    const request = buildTrainingRequest({
      dataset,
      prompt: 'more models for feature_v2.csv',
      currentNode: 'propose_model',
      toolResults: [
        {
          tool: 'configure_experiment',
          output: { experimentId: 'exp-1', status: 'configured' }
        },
        {
          tool: 'configure_experiment',
          output: { experimentId: 'exp-2', status: 'configured' }
        }
      ]
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('configured experiments still need training plans');
    expect(userMessage?.content).toContain('Call propose_training_plan ONCE PER remaining configured experiment');
    expect(userMessage?.content).toContain('Do NOT continue with advisory text only');
  });

  it('forces remaining proposals when multiple configured experiments exist but only one has a plan', () => {
    const request = buildTrainingRequest({
      dataset,
      prompt: 'propose 3 models for me to train feature_v1.csv',
      currentNode: 'propose_model',
      toolResults: [
        {
          tool: 'configure_experiment',
          output: { experimentId: 'exp-1', experimentName: 'Feature_v1 Random Forest Regressor', status: 'configured' }
        },
        {
          tool: 'configure_experiment',
          output: { experimentId: 'exp-2', experimentName: 'Feature_v1 Ridge Regression', status: 'configured' }
        },
        {
          tool: 'configure_experiment',
          output: { experimentId: 'exp-3', experimentName: 'Feature_v1 Linear Regression', status: 'configured' }
        },
        {
          tool: 'propose_training_plan',
          output: { experimentId: 'exp-1', status: 'awaiting_approval' }
        }
      ]
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('2 configured experiments still need training plans');
    expect(userMessage?.content).toContain('Call propose_training_plan ONCE PER remaining configured experiment');
  });
});
