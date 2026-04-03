import { describe, expect, it } from 'vitest';

import { buildFeatureEngineeringRequest } from './featureWorkflow.js';

describe('buildFeatureEngineeringRequest', () => {
  const dataset = {
    datasetId: 'dataset-1',
    projectId: 'project-1',
    filename: 'customers.csv',
    nRows: 5,
    nCols: 4,
    columns: [
      { name: 'signup_date', dtype: 'date' },
      { name: 'city', dtype: 'string' },
      { name: 'spend', dtype: 'number' },
      { name: 'visits', dtype: 'number' }
    ],
    sample: []
  };

  it('continues from the selected proposal instead of the last proposal in history', () => {
    const request = buildFeatureEngineeringRequest({
      dataset,
      prompt: [
        'Implement the enabled features in the notebook.',
        '',
        'Selected feature IDs to implement: feat-signup-month, feat-city-frequency',
        'Enabled features to implement: signup_month (extract_month on signup_date); city_frequency (frequency_encode on city)'
      ].join('\n'),
      toolResults: [
        {
          tool: 'propose_feature',
          output: {
            featureId: 'feat-signup-month',
            featureName: 'signup_month',
            method: 'extract_month'
          }
        },
        {
          tool: 'propose_feature',
          output: {
            featureId: 'feat-log-spend',
            featureName: 'log_spend',
            method: 'log1p_transform'
          }
        },
        {
          tool: 'propose_feature',
          output: {
            featureId: 'feat-city-frequency',
            featureName: 'city_frequency',
            method: 'frequency_encode'
          }
        }
      ],
      featureMethods: ['extract_month', 'log1p_transform', 'frequency_encode']
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('CONTINUATION: The user enabled 2 proposed features: "feat-signup-month" (signup_month: extract_month');
    expect(userMessage?.content).toContain('Start with "feat-signup-month" by calling materialize_feature_code');
    expect(userMessage?.content).not.toContain('Next: call materialize_feature_code for feature "feat-city-frequency".');
  });

  it('builds an explicit continuation directive after propose_feature and requires a tool call', () => {
    const request = buildFeatureEngineeringRequest({
      dataset,
      prompt: 'Implement the selected feature in the notebook.',
      toolResults: [
        {
          tool: 'propose_feature',
          output: {
            featureId: 'feat-signup-month',
            featureName: 'signup_month',
            method: 'extract_month'
          }
        }
      ],
      featureMethods: ['extract_month', 'frequency_encode']
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('CONTINUATION: Next: call materialize_feature_code for feature "feat-signup-month".');
    expect(userMessage?.content).not.toContain('call render_ui now');
    expect(request.toolChoice).toBe('any');
    expect(request.maxOutputTokens).toBe(12000);
  });

  it('continues selected-feature implementation even when lifecycle history is missing', () => {
    const request = buildFeatureEngineeringRequest({
      dataset,
      prompt: [
        'Implement the enabled features in the notebook.',
        '',
        'Selected feature IDs to implement: feat-signup-month, feat-city-frequency',
        'Enabled features to implement: signup_month (extract_month on signup_date); city_frequency (frequency_encode on city)'
      ].join('\n'),
      toolResults: [],
      featureMethods: ['extract_month', 'frequency_encode']
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain(
      'CONTINUATION: The user already selected feature "feat-signup-month" for implementation. Call materialize_feature_code for "feat-signup-month" first'
    );
    expect(userMessage?.content).toContain('Do NOT propose more features.');
    expect(request.toolChoice).toBe('any');
  });

  it('pauses at proposals with a render_ui directive when the user only asked for ideas', () => {
    const request = buildFeatureEngineeringRequest({
      dataset,
      prompt: 'Suggest feature ideas for this dataset.',
      toolResults: [
        {
          tool: 'propose_feature',
          output: {
            featureId: 'feat-signup-month',
            featureName: 'signup_month',
            method: 'extract_month'
          }
        },
        {
          tool: 'propose_feature',
          output: {
            featureId: 'feat-city-frequency',
            featureName: 'city_frequency',
            method: 'frequency_encode'
          }
        },
        {
          tool: 'propose_feature',
          output: {
            featureId: 'feat-log-spend',
            featureName: 'log_spend',
            method: 'log1p_transform'
          }
        }
      ],
      featureMethods: ['extract_month', 'frequency_encode', 'log1p_transform']
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('Present proposals via render_ui with feature_suggestion items');
    expect(userMessage?.content).not.toContain('materialize_feature_code');
  });

  it('injects the lifecycle contract and tool instructions into the system prompt', () => {
    const request = buildFeatureEngineeringRequest({
      dataset,
      prompt: 'Help me engineer better churn features.',
      toolResults: [],
      featureMethods: ['extract_month', 'frequency_encode', 'log1p_transform']
    });

    const systemMessage = request.messages.find((message) => message.role === 'system');
    expect(systemMessage?.content).toContain('Feature Engineering Lifecycle Contract');
    expect(systemMessage?.content).toContain('You MUST use the feature engineering lifecycle tools');
    expect(systemMessage?.content).toContain('ALL Python code MUST be authored via write_cell into notebook cells');
  });
});
