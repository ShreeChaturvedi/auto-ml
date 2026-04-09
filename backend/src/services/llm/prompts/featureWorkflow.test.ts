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
    expect(userMessage?.content).toContain('CONTINUATION: ACTION REQUIRED:');
    expect(userMessage?.content).toContain('The user enabled 2 proposed features: "feat-signup-month" (signup_month: extract_month');
    expect(userMessage?.content).toContain('Start with "feat-signup-month" by calling materialize_feature_code');
    expect(userMessage?.content).not.toContain('Next: call materialize_feature_code for feature "feat-city-frequency".');
  });

  it('requires user selection after propose_feature when no selected feature IDs are provided', () => {
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
    expect(userMessage?.content).toContain('CONTINUATION: ACTION REQUIRED:');
    expect(userMessage?.content).toContain(
      'All features have been proposed. Present proposals via render_ui with feature_suggestion items. Do NOT materialize code — wait for the user to select which features to implement.'
    );
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
    expect(userMessage?.content).toContain('CONTINUATION: ACTION REQUIRED:');
    expect(userMessage?.content).toContain(
      'The user selected 2 features for implementation: "feat-signup-month", "feat-city-frequency". Start with "feat-signup-month" by calling materialize_feature_code'
    );
    expect(userMessage?.content).toContain('Do NOT checkpoint until every selected feature is registered.');
    expect(request.toolChoice).toBe('any');
  });

  it('continues the remaining selected feature even when proposal history is unavailable', () => {
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
          tool: 'register_feature',
          output: { featureId: 'feat-signup-month' }
        }
      ],
      featureMethods: ['extract_month', 'frequency_encode']
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('CONTINUATION: ACTION REQUIRED:');
    expect(userMessage?.content).toContain(
      'The user enabled 2 features: "feat-signup-month", "feat-city-frequency". Start with "feat-city-frequency" by calling materialize_feature_code'
    );
    expect(userMessage?.content).toContain('Do NOT checkpoint until every selected feature is registered.');
  });

  it('moves to the next selected feature instead of checkpointing after the first feature is registered', () => {
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
            featureId: 'feat-city-frequency',
            featureName: 'city_frequency',
            method: 'frequency_encode'
          }
        },
        {
          tool: 'materialize_feature_code',
          output: { featureId: 'feat-signup-month' }
        },
        {
          tool: 'execute_feature',
          output: { featureId: 'feat-signup-month' }
        },
        {
          tool: 'validate_feature',
          output: { featureId: 'feat-signup-month' }
        },
        {
          tool: 'register_feature',
          output: { featureId: 'feat-signup-month' }
        }
      ],
      featureMethods: ['extract_month', 'frequency_encode']
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('CONTINUATION: ACTION REQUIRED:');
    expect(userMessage?.content).toContain(
      'The user enabled 2 proposed features:'
    );
    expect(userMessage?.content).toContain(
      'Start with "feat-city-frequency" by calling materialize_feature_code'
    );
    expect(userMessage?.content).toContain('Do NOT checkpoint until every selected feature is registered.');
  });

  it('checkpoints only after all selected features are registered', () => {
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
            featureId: 'feat-city-frequency',
            featureName: 'city_frequency',
            method: 'frequency_encode'
          }
        },
        { tool: 'register_feature', output: { featureId: 'feat-signup-month' } },
        { tool: 'register_feature', output: { featureId: 'feat-city-frequency' } }
      ],
      featureMethods: ['extract_month', 'frequency_encode']
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('CONTINUATION: ACTION REQUIRED:');
    expect(userMessage?.content).toContain(
      'All selected features are registered. Call checkpoint_feature_pipeline to finalize the pipeline.'
    );
  });

  it('does not treat rejected register_feature as completion for selected features', () => {
    const request = buildFeatureEngineeringRequest({
      dataset,
      prompt: [
        'Implement the enabled features in the notebook.',
        '',
        'Selected feature IDs to implement: feat-signup-month, feat-city-frequency',
        'Enabled features to implement: signup_month (extract_month on signup_date); city_frequency (frequency_encode on city)'
      ].join('\n'),
      toolResults: [
        { tool: 'register_feature', output: { featureId: 'feat-signup-month', status: 'ok' } },
        { tool: 'register_feature', output: { featureId: 'feat-city-frequency', status: 'rejected' } }
      ],
      featureMethods: ['extract_month', 'frequency_encode']
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('CONTINUATION: ACTION REQUIRED:');
    expect(userMessage?.content).toContain(
      'Selected feature "feat-city-frequency" was rejected at registration.'
    );
    expect(userMessage?.content).not.toContain(
      'All selected features are registered. Call checkpoint_feature_pipeline to finalize the pipeline.'
    );
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

  it('prepends an imperative ACTION REQUIRED prefix to every continuation directive', () => {
    // Regression: in long multi-feature runs the LLM would sometimes emit
    // text tokens ("I'll continue with feature 2...") but no tool call. The
    // text made hasActionableOutput() return true and the turn routed to
    // 'complete' without progress. The imperative prefix tells the model
    // explicitly to emit a tool call and not to reply with plain text.
    const request = buildFeatureEngineeringRequest({
      dataset,
      prompt: [
        'Implement the enabled features in the notebook.',
        '',
        'Selected feature IDs to implement: feat-a, feat-b',
        'Enabled features to implement: feat_a (log1p_transform); feat_b (frequency_encode)'
      ].join('\n'),
      toolResults: [
        { tool: 'register_feature', output: { featureId: 'feat-a', status: 'ok' } }
      ],
      featureMethods: ['log1p_transform', 'frequency_encode']
    });

    const userMessage = request.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toMatch(/CONTINUATION: ACTION REQUIRED: Emit a tool call on your next response/);
    expect(userMessage?.content).toMatch(/Do NOT reply with plain text/);
    expect(userMessage?.content).toMatch(/Do NOT ask for clarification/);
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

  it('treats the project plan as background context and prioritizes the current turn', () => {
    const request = buildFeatureEngineeringRequest({
      dataset,
      prompt: 'Use the post-clean summary and focus on missing department labels.',
      projectPlan: 'Forecast usage_count with generic frequency and log features.',
      toolResults: [],
      featureMethods: ['extract_month', 'frequency_encode', 'log1p_transform']
    });

    const systemMessage = request.messages.find((message) => message.role === 'system');
    const userMessage = request.messages.find((message) => message.role === 'user');

    expect(systemMessage?.content).toContain('Use this plan as background project context.');
    expect(systemMessage?.content).toContain('The current turn\'s explicit user request, selected dataset, and selected target are authoritative');
    expect(userMessage?.content).toContain('Current-turn priority: if the user provides a structured post-clean summary');
  });
});
