import { describe, expect, it } from 'vitest';

import type { ModelRecord } from '../types/model.js';

import { buildInferenceServerScript } from './inferenceServerBuilder.js';

function makeModel(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    modelId: 'model-1',
    projectId: 'project-1',
    datasetId: 'dataset-1',
    name: 'logreg_churn_prediction',
    templateId: 'template-1',
    taskType: 'classification',
    library: 'scikit-learn',
    algorithm: 'logistic_regression',
    parameters: {},
    metrics: {},
    status: 'completed',
    createdAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
    featureColumns: ['age', 'plan_type_Plus'],
    featureTypes: {
      age: 'int',
      plan_type_Plus: 'int'
    },
    sampleRequest: {
      age: '29',
      plan_type_Plus: '1'
    },
    ...overrides
  };
}

describe('inferenceServerBuilder', () => {
  it('resolves the final estimator without assuming a named "model" pipeline step', () => {
    const script = buildInferenceServerScript(makeModel());

    expect(script).toContain('def resolve_model_step(pipeline):');
    expect(script).toContain('model_step = resolve_model_step(pipeline)');
    expect(script).toContain('def resolve_classes(pipeline, probas=None):');
    expect(script).toContain('classes = resolve_classes(pipeline, probas)');
    expect(script).toContain('classes = resolve_classes(pipeline, probas[0] if len(probas) > 0 else None)');
    expect(script).not.toContain('classes = pipeline.named_steps["model"].classes_');
  });
});
