import { describe, expect, it } from 'vitest';

import {
  coerceReasoningEffort,
  normalizeReasoningSelection,
  resolveCatalogModel
} from './modelCatalog.js';

describe('modelCatalog reasoning normalization', () => {
  it('uses low as the minimum GPT-5.4 reasoning effort', () => {
    expect(resolveCatalogModel('gpt-5.4').reasoningEfforts[0]).toBe('low');
  });

  it('keeps supported reasoning efforts unchanged', () => {
    expect(coerceReasoningEffort('gpt-5.4', 'low')).toBe('low');
    expect(coerceReasoningEffort('gpt-5-mini', 'medium')).toBe('medium');
  });

  it('falls back to the model default when the requested effort is unsupported', () => {
    expect(
      normalizeReasoningSelection({
        modelId: 'gpt-5.4',
        reasoningEffort: 'minimal'
      })
    ).toBe('high');
  });
});
