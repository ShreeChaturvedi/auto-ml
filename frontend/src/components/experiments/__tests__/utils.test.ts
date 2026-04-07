import { describe, expect, it } from 'vitest';
import type { ModelRecord } from '@/types/model';
import type { FilterPredicate } from '@/types/experiments';
import { applyPredicate, filterByPredicates, formatMetricDisplayName } from '../utils';

const makeModel = (overrides: Partial<ModelRecord> = {}): ModelRecord => ({
  modelId: 'model-1',
  projectId: 'proj-1',
  datasetId: 'ds-1',
  name: 'Test Model',
  templateId: 'tpl-1',
  taskType: 'classification',
  library: 'sklearn',
  algorithm: 'RandomForestClassifier',
  parameters: {},
  metrics: { accuracy: 0.92, f1: 0.88, precision: 0.90 },
  status: 'completed',
  createdAt: '2026-03-20T00:00:00Z',
  updatedAt: '2026-03-20T00:00:00Z',
  ...overrides,
});

describe('applyPredicate', () => {
  const model = makeModel();

  it('gt: passes when metric exceeds threshold', () => {
    expect(applyPredicate(model, { field: 'accuracy', operator: 'gt', value: 0.9 })).toBe(true);
    expect(applyPredicate(model, { field: 'accuracy', operator: 'gt', value: 0.95 })).toBe(false);
  });

  it('lt: passes when metric is below threshold', () => {
    expect(applyPredicate(model, { field: 'f1', operator: 'lt', value: 0.9 })).toBe(true);
    expect(applyPredicate(model, { field: 'f1', operator: 'lt', value: 0.5 })).toBe(false);
  });

  it('eq: passes on exact match', () => {
    expect(applyPredicate(model, { field: 'accuracy', operator: 'eq', value: 0.92 })).toBe(true);
    expect(applyPredicate(model, { field: 'accuracy', operator: 'eq', value: 0.91 })).toBe(false);
  });

  it('gte/lte: boundary conditions', () => {
    expect(applyPredicate(model, { field: 'accuracy', operator: 'gte', value: 0.92 })).toBe(true);
    expect(applyPredicate(model, { field: 'accuracy', operator: 'lte', value: 0.92 })).toBe(true);
  });

  it('contains: case-insensitive substring match on top-level fields', () => {
    expect(applyPredicate(model, { field: 'algorithm', operator: 'contains', value: 'random' })).toBe(true);
    expect(applyPredicate(model, { field: 'algorithm', operator: 'contains', value: 'XGBoost' })).toBe(false);
  });

  it('returns false for missing fields', () => {
    expect(applyPredicate(model, { field: 'nonexistent', operator: 'gt', value: 0 })).toBe(false);
  });

  it('falls back to string equality for non-numeric eq comparisons', () => {
    expect(applyPredicate(model, { field: 'taskType', operator: 'eq', value: 'classification' })).toBe(true);
    expect(applyPredicate(model, { field: 'taskType', operator: 'eq', value: 'regression' })).toBe(false);
  });
});

describe('filterByPredicates', () => {
  const models = [
    makeModel({ modelId: 'a', metrics: { accuracy: 0.95 }, algorithm: 'RandomForestClassifier' }),
    makeModel({ modelId: 'b', metrics: { accuracy: 0.80 }, algorithm: 'LogisticRegression' }),
    makeModel({ modelId: 'c', metrics: { accuracy: 0.60 }, algorithm: 'SVC' }),
  ];

  it('returns all models when predicates are empty', () => {
    expect(filterByPredicates(models, [])).toHaveLength(3);
  });

  it('applies AND logic across multiple predicates', () => {
    const predicates: FilterPredicate[] = [
      { field: 'accuracy', operator: 'gt', value: 0.7 },
      { field: 'algorithm', operator: 'contains', value: 'Forest' },
    ];
    const result = filterByPredicates(models, predicates);
    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBe('a');
  });
});

describe('formatMetricDisplayName', () => {
  it('maps known metric keys to display labels', () => {
    expect(formatMetricDisplayName('accuracy')).toBe('Accuracy');
    expect(formatMetricDisplayName('rmse')).toBe('RMSE');
    expect(formatMetricDisplayName('r2')).toBe('R\u00B2');
  });

  it('title-cases unknown keys', () => {
    expect(formatMetricDisplayName('custom_loss')).toBe('Custom Loss');
  });
});
