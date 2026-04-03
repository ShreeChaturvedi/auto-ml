import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSuggestionDrafts } from '../useSuggestionDrafts';
import type { FeatureSuggestionItem } from '../../featureEngineeringUtils';

const upsertFeatureMock = vi.fn();
const removeFeatureMock = vi.fn();

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: (selector: (state: unknown) => unknown) =>
    selector({
      upsertFeature: upsertFeatureMock,
      removeFeature: removeFeatureMock
    })
}));

describe('useSuggestionDrafts', () => {
  beforeEach(() => {
    upsertFeatureMock.mockReset();
    removeFeatureMock.mockReset();
  });

  it('enables binary_encode feature suggestions without raising an unsupported-method error', () => {
    const setPanelError = vi.fn();
    const item: FeatureSuggestionItem = {
      type: 'feature_suggestion',
      id: 'feat-binary-1',
      feature: {
        sourceColumn: 'presentation_table',
        featureName: 'presentation_table_binary',
        method: 'binary_encode',
        params: {}
      },
      rationale: 'Binary encoding can compact a high-cardinality categorical field.',
      impact: 'high'
    };

    const { result } = renderHook(() => useSuggestionDrafts({
      projectId: 'project-1',
      featureById: new Map(),
      setPanelError
    }));

    act(() => {
      result.current.toggleSuggestion(item, true);
    });

    expect(setPanelError).toHaveBeenCalledWith(null);
    expect(upsertFeatureMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'feat-binary-1',
      projectId: 'project-1',
      sourceColumn: 'presentation_table',
      featureName: 'presentation_table_binary',
      method: 'binary_encode',
      category: 'encoding',
      enabled: true
    }));
  });
});
