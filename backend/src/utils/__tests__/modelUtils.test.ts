import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ModelRepository } from '../../repositories/modelRepository.js';
import {
  inferTargetColumn,
  resolveTargetColumn,
  resolveAndHealTargetColumn,
} from '../modelUtils.js';

vi.mock('../../logging/logger.js', () => ({
  appLogger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------- inferTargetColumn ----------

describe('inferTargetColumn', () => {
  it('returns "target" when columns array is empty', () => {
    expect(inferTargetColumn([])).toBe('target');
  });

  it('returns the column named "target" (case-insensitive)', () => {
    const cols = [{ name: 'age' }, { name: 'Target' }, { name: 'income' }];
    expect(inferTargetColumn(cols)).toBe('Target');
  });

  it('returns the column named "TARGET" (all-caps)', () => {
    const cols = [{ name: 'age' }, { name: 'TARGET' }];
    expect(inferTargetColumn(cols)).toBe('TARGET');
  });

  it('returns the last column when no "target" column exists', () => {
    const cols = [{ name: 'age' }, { name: 'income' }, { name: 'label' }];
    expect(inferTargetColumn(cols)).toBe('label');
  });

  it('returns the only column when there is exactly one', () => {
    expect(inferTargetColumn([{ name: 'price' }])).toBe('price');
  });
});

// ---------- resolveTargetColumn ----------

describe('resolveTargetColumn', () => {
  const datasetColumns = [{ name: 'age' }, { name: 'income' }, { name: 'label' }];

  it('returns the stored targetColumn when it exists in the dataset', () => {
    const model = { targetColumn: 'income' };
    expect(resolveTargetColumn(model, datasetColumns)).toBe('income');
  });

  it('falls back to inference when the stored column is stale', () => {
    const model = { targetColumn: 'deleted_col' };
    // No "target" column in dataset, so inference picks the last one
    expect(resolveTargetColumn(model, datasetColumns)).toBe('label');
  });

  it('falls back to inference when targetColumn is undefined', () => {
    const model = { targetColumn: undefined };
    expect(resolveTargetColumn(model, datasetColumns)).toBe('label');
  });

  it('falls back to inference when targetColumn is an empty string', () => {
    const model = { targetColumn: '' };
    expect(resolveTargetColumn(model, datasetColumns)).toBe('label');
  });

  it('uses the "target" column from the dataset when falling back', () => {
    const cols = [{ name: 'age' }, { name: 'target' }, { name: 'income' }];
    const model = { targetColumn: 'missing' };
    expect(resolveTargetColumn(model, cols)).toBe('target');
  });
});

// ---------- resolveAndHealTargetColumn ----------

describe('resolveAndHealTargetColumn', () => {
  let mockRepo: Pick<ModelRepository, 'update'>;

  beforeEach(() => {
    mockRepo = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    vi.clearAllMocks();
  });

  it('returns the stored column and does not call repo.update when it is valid', async () => {
    const model = { modelId: 'm1', targetColumn: 'income' };
    const cols = [{ name: 'age' }, { name: 'income' }];

    const result = await resolveAndHealTargetColumn(model, cols, mockRepo);

    expect(result).toBe('income');
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('heals and persists when the stored column is stale', async () => {
    const model = { modelId: 'm2', targetColumn: 'deleted_col' };
    const cols = [{ name: 'age' }, { name: 'income' }];

    const result = await resolveAndHealTargetColumn(model, cols, mockRepo);

    expect(result).toBe('income'); // last column (no "target" in dataset)
    expect(mockRepo.update).toHaveBeenCalledOnce();
    expect(mockRepo.update).toHaveBeenCalledWith('m2', expect.any(Function));

    // Verify the updater function sets the corrected targetColumn
    const updater = (mockRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const healed = updater({ modelId: 'm2', targetColumn: 'deleted_col' });
    expect(healed.targetColumn).toBe('income');
  });

  it('heals and persists when targetColumn is undefined', async () => {
    const model = { modelId: 'm3', targetColumn: undefined };
    const cols = [{ name: 'target' }, { name: 'value' }];

    const result = await resolveAndHealTargetColumn(model, cols, mockRepo);

    expect(result).toBe('target'); // explicit "target" column found
    expect(mockRepo.update).toHaveBeenCalledOnce();
    expect(mockRepo.update).toHaveBeenCalledWith('m3', expect.any(Function));
  });

  it('logs a warning when healing occurs', async () => {
    const { appLogger } = await import('../../logging/logger.js');
    const model = { modelId: 'm4', targetColumn: 'old_col' };
    const cols = [{ name: 'new_col' }];

    await resolveAndHealTargetColumn(model, cols, mockRepo);

    expect(appLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Healing stale targetColumn'),
    );
  });
});
