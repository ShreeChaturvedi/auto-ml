import { describe, expect, it } from 'vitest';

import {
  coerceReasoningEffort,
  normalizeCatalogModelId,
  normalizeReasoningSelection,
  resolveCatalogModel
} from './modelCatalog.js';

describe('modelCatalog reasoning normalization', () => {
  it('uses low as the minimum GPT-5.4 reasoning effort', () => {
    expect(resolveCatalogModel('gpt-5.4').reasoningEfforts[0]).toBe('low');
  });

  it('keeps supported reasoning efforts unchanged', () => {
    expect(coerceReasoningEffort('gpt-5.4', 'low')).toBe('low');
    expect(coerceReasoningEffort('gpt-5.4-mini', 'medium')).toBe('medium');
    expect(coerceReasoningEffort('gpt-5.4-nano', 'xhigh')).toBe('xhigh');
  });

  it('falls back to the model default when the requested effort is unsupported', () => {
    expect(
      normalizeReasoningSelection({
        modelId: 'gpt-5.4',
        reasoningEffort: 'minimal'
      })
    ).toBe('high');
  });

  it('maps legacy GPT-5 mini and nano aliases to GPT-5.4 variants', () => {
    expect(normalizeCatalogModelId('gpt-5-mini')).toBe('gpt-5.4-mini');
    expect(normalizeCatalogModelId('gpt-5-nano')).toBe('gpt-5.4-nano');
    expect(resolveCatalogModel('gpt-5-mini').id).toBe('gpt-5.4-mini');
    expect(resolveCatalogModel('gpt-5-nano').id).toBe('gpt-5.4-nano');
  });
});
