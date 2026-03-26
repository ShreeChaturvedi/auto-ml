import { describe, expect, it } from 'vitest';

import type { ComparisonResult } from '../../types/experiments.js';
import { compareModels, findBestModel, rankModelsByMetric, type ModelForComparison } from '../modelComparison.js';

// ── Fixtures ──

const modelA: ModelForComparison = {
  modelId: 'model-a',
  name: 'Random Forest',
  metrics: { accuracy: 0.92, f1: 0.89 },
};

const modelB: ModelForComparison = {
  modelId: 'model-b',
  name: 'Gradient Boosting',
  metrics: { accuracy: 0.95, f1: 0.93 },
};

const modelC: ModelForComparison = {
  modelId: 'model-c',
  name: 'SVM',
  metrics: { accuracy: 0.88, f1: 0.85, precision: 0.90 },
};

describe('compareModels', () => {
  it('returns correct models array in result', () => {
    const result = compareModels([modelA, modelB], new Map());
    expect(result.models).toHaveLength(2);
    expect(result.models[0].modelId).toBe('model-a');
    expect(result.models[1].modelId).toBe('model-b');
  });

  it('computes deltas for each shared metric', () => {
    const result = compareModels([modelA, modelB], new Map());
    const accDelta = result.deltas.find((d) => d.metric === 'accuracy');
    expect(accDelta).toBeDefined();
    expect(accDelta!.delta).toBeCloseTo(0.03, 5); // 0.95 - 0.92
    expect(accDelta!.values).toEqual([0.92, 0.95]);
  });

  it('handles models with different metric sets (union of keys)', () => {
    const result = compareModels([modelA, modelC], new Map());
    const metrics = result.deltas.map((d) => d.metric).sort();
    expect(metrics).toContain('accuracy');
    expect(metrics).toContain('f1');
    expect(metrics).toContain('precision');
  });

  it('uses NaN for missing metrics in values array', () => {
    const result = compareModels([modelA, modelC], new Map());
    const precisionDelta = result.deltas.find((d) => d.metric === 'precision');
    expect(precisionDelta).toBeDefined();
    // modelA doesn't have precision → NaN
    expect(precisionDelta!.values[0]).toBeNaN();
    expect(precisionDelta!.values[1]).toBe(0.90);
  });

  it('throws when fewer than 2 models', () => {
    expect(() => compareModels([modelA], new Map())).toThrow('At least 2 models');
    expect(() => compareModels([], new Map())).toThrow('At least 2 models');
  });

  it('works with 3+ models (no p-value computed)', () => {
    const result = compareModels([modelA, modelB, modelC], new Map());
    expect(result.models).toHaveLength(3);
    // p-values only for 2-model comparisons
    for (const d of result.deltas) {
      expect(d.pValue).toBeUndefined();
      expect(d.significant).toBeUndefined();
    }
  });

  it('computes p-value with CV scores for 2-model comparison', () => {
    const evaluations = new Map<string, unknown>();
    evaluations.set('model-a', {
      cross_validation: { scores: [0.90, 0.91, 0.93, 0.92, 0.94] },
    });
    evaluations.set('model-b', {
      cross_validation: { scores: [0.95, 0.96, 0.94, 0.97, 0.95] },
    });

    const result = compareModels([modelA, modelB], evaluations);
    const accDelta = result.deltas.find((d) => d.metric === 'accuracy');
    expect(accDelta!.pValue).toBeDefined();
    expect(typeof accDelta!.pValue).toBe('number');
    expect(accDelta!.pValue).toBeGreaterThanOrEqual(0);
    expect(accDelta!.pValue).toBeLessThanOrEqual(1);
    // These scores are quite different, so p should be significant
    expect(accDelta!.significant).toBe(true);
  });

  it('skips p-value when CV scores are missing', () => {
    const evaluations = new Map<string, unknown>();
    evaluations.set('model-a', { cross_validation: { scores: [0.90, 0.91, 0.93] } });
    // model-b has no evaluation data

    const result = compareModels([modelA, modelB], evaluations);
    const accDelta = result.deltas.find((d) => d.metric === 'accuracy');
    expect(accDelta!.pValue).toBeUndefined();
  });

  it('skips p-value when CV scores have fewer than 2 samples', () => {
    const evaluations = new Map<string, unknown>();
    evaluations.set('model-a', { cross_validation: { scores: [0.90] } });
    evaluations.set('model-b', { cross_validation: { scores: [0.95] } });

    const result = compareModels([modelA, modelB], evaluations);
    const accDelta = result.deltas.find((d) => d.metric === 'accuracy');
    expect(accDelta!.pValue).toBeUndefined();
  });

  it('handles identical CV scores (p-value = 1)', () => {
    const evaluations = new Map<string, unknown>();
    evaluations.set('model-a', { cross_validation: { scores: [0.90, 0.90, 0.90] } });
    evaluations.set('model-b', { cross_validation: { scores: [0.90, 0.90, 0.90] } });

    const result = compareModels([modelA, modelB], evaluations);
    const accDelta = result.deltas.find((d) => d.metric === 'accuracy');
    // When all values are identical, se=0 → p-value=1
    expect(accDelta!.pValue).toBe(1);
    expect(accDelta!.significant).toBe(false);
  });

  it('result conforms to ComparisonResult type shape', () => {
    const result: ComparisonResult = compareModels([modelA, modelB], new Map());
    expect(result).toHaveProperty('models');
    expect(result).toHaveProperty('deltas');
    expect(Array.isArray(result.models)).toBe(true);
    expect(Array.isArray(result.deltas)).toBe(true);
    for (const m of result.models) {
      expect(m).toHaveProperty('modelId');
      expect(m).toHaveProperty('name');
      expect(m).toHaveProperty('metrics');
    }
    for (const d of result.deltas) {
      expect(d).toHaveProperty('metric');
      expect(d).toHaveProperty('values');
      expect(d).toHaveProperty('delta');
    }
  });
});

describe('rankModelsByMetric', () => {
  it('sorts models descending by default', () => {
    const ranked = rankModelsByMetric([modelA, modelB, modelC], 'accuracy');
    expect(ranked[0].modelId).toBe('model-b'); // 0.95
    expect(ranked[1].modelId).toBe('model-a'); // 0.92
    expect(ranked[2].modelId).toBe('model-c'); // 0.88
  });

  it('sorts models ascending when specified', () => {
    const ranked = rankModelsByMetric([modelA, modelB, modelC], 'accuracy', false);
    expect(ranked[0].modelId).toBe('model-c'); // 0.88
    expect(ranked[2].modelId).toBe('model-b'); // 0.95
  });

  it('treats missing metric as 0', () => {
    const ranked = rankModelsByMetric([modelA, modelC], 'precision');
    // modelA has no precision (treated as 0), modelC has 0.90
    expect(ranked[0].modelId).toBe('model-c');
    expect(ranked[1].modelId).toBe('model-a');
  });

  it('does not mutate original array', () => {
    const original = [modelA, modelB, modelC];
    const copy = [...original];
    rankModelsByMetric(original, 'accuracy');
    expect(original).toEqual(copy);
  });
});

describe('findBestModel', () => {
  it('returns the model with highest metric value', () => {
    const best = findBestModel([modelA, modelB, modelC], 'accuracy');
    expect(best?.modelId).toBe('model-b');
  });

  it('returns the model with lowest metric value when ascending', () => {
    const best = findBestModel([modelA, modelB, modelC], 'accuracy', false);
    expect(best?.modelId).toBe('model-c');
  });

  it('returns undefined for empty array', () => {
    expect(findBestModel([], 'accuracy')).toBeUndefined();
  });
});
