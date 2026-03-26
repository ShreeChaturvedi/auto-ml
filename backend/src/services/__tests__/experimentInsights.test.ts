import { describe, expect, it } from 'vitest';

import { buildModelSummaries, computeModelHash } from '../experimentInsights.js';

// ── Fixtures ──

const rawModels: Array<{
  modelId: string;
  name: string;
  algorithm: string;
  taskType: string;
  status: string;
  metrics: Record<string, number>;
}> = [
  {
    modelId: 'z-model',
    name: 'SVM',
    algorithm: 'SVM',
    taskType: 'classification',
    status: 'completed',
    metrics: { accuracy: 0.88 },
  },
  {
    modelId: 'a-model',
    name: 'Random Forest',
    algorithm: 'RandomForest',
    taskType: 'classification',
    status: 'completed',
    metrics: { accuracy: 0.92 },
  },
  {
    modelId: 'm-model',
    name: 'Gradient Boosting',
    algorithm: 'GradientBoosting',
    taskType: 'regression',
    status: 'training',
    metrics: { rmse: 1.5 },
  },
];

describe('buildModelSummaries', () => {
  it('returns all models with correct fields', () => {
    const summaries = buildModelSummaries(rawModels);
    expect(summaries).toHaveLength(3);
    for (const s of summaries) {
      expect(s).toHaveProperty('modelId');
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('algorithm');
      expect(s).toHaveProperty('taskType');
      expect(s).toHaveProperty('status');
      expect(s).toHaveProperty('metrics');
    }
  });

  it('sorts models by modelId alphabetically', () => {
    const summaries = buildModelSummaries(rawModels);
    expect(summaries[0].modelId).toBe('a-model');
    expect(summaries[1].modelId).toBe('m-model');
    expect(summaries[2].modelId).toBe('z-model');
  });

  it('preserves original metrics', () => {
    const summaries = buildModelSummaries(rawModels);
    const rf = summaries.find((s) => s.modelId === 'a-model')!;
    expect(rf.metrics).toEqual({ accuracy: 0.92 });
  });

  it('returns empty array for empty input', () => {
    expect(buildModelSummaries([])).toEqual([]);
  });

  it('does not include extra properties from input', () => {
    const extended = [{ ...rawModels[0], extraProp: 'should be excluded' }];
    const summaries = buildModelSummaries(extended);
    expect(Object.keys(summaries[0]).sort()).toEqual(
      ['algorithm', 'metrics', 'modelId', 'name', 'status', 'taskType'].sort(),
    );
  });
});

describe('computeModelHash', () => {
  it('returns a hex string', () => {
    const summaries = buildModelSummaries(rawModels);
    const hash = computeModelHash('proj-1', summaries);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns same hash for same input', () => {
    const summaries = buildModelSummaries(rawModels);
    const h1 = computeModelHash('proj-1', summaries);
    const h2 = computeModelHash('proj-1', summaries);
    expect(h1).toBe(h2);
  });

  it('returns different hash for different projectId', () => {
    const summaries = buildModelSummaries(rawModels);
    const h1 = computeModelHash('proj-1', summaries);
    const h2 = computeModelHash('proj-2', summaries);
    expect(h1).not.toBe(h2);
  });

  it('returns different hash for different model data', () => {
    const s1 = buildModelSummaries(rawModels);
    const s2 = buildModelSummaries([rawModels[0]]);
    const h1 = computeModelHash('proj-1', s1);
    const h2 = computeModelHash('proj-1', s2);
    expect(h1).not.toBe(h2);
  });

  it('returns different hash when metrics change', () => {
    const s1 = buildModelSummaries(rawModels);
    const modified: typeof rawModels = rawModels.map((m) =>
      m.modelId === 'a-model' ? { ...m, metrics: { accuracy: 0.99 } as Record<string, number> } : m,
    );
    const s2 = buildModelSummaries(modified);
    const h1 = computeModelHash('proj-1', s1);
    const h2 = computeModelHash('proj-1', s2);
    expect(h1).not.toBe(h2);
  });

  it('produces consistent hash regardless of input order (sorted internally)', () => {
    const reversed: typeof rawModels = [...rawModels].reverse();
    const s1 = buildModelSummaries(rawModels);
    const s2 = buildModelSummaries(reversed);
    const h1 = computeModelHash('proj-1', s1);
    const h2 = computeModelHash('proj-1', s2);
    expect(h1).toBe(h2);
  });
});
