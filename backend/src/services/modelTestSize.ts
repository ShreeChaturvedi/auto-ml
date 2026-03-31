import type { ModelRecord } from '../types/model.js';

export const DEFAULT_MODEL_TEST_SIZE = 0.2;
const MIN_MODEL_TEST_SIZE = 0.1;
const MAX_MODEL_TEST_SIZE = 0.4;

export function normalizeModelTestSize(value: unknown): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_MODEL_TEST_SIZE;
  }

  return Math.max(MIN_MODEL_TEST_SIZE, Math.min(numericValue, MAX_MODEL_TEST_SIZE));
}

export function resolveModelTestSize(model: Pick<ModelRecord, 'metadata'>): number {
  const metadata = model.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return DEFAULT_MODEL_TEST_SIZE;
  }

  return normalizeModelTestSize((metadata as Record<string, unknown>).testSize);
}
