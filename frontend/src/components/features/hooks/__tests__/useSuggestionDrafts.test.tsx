import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureSpec } from '@/types/feature';

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
      description: 'Binary encoding can compact a high-cardinality categorical field.',
      method: 'binary_encode',
      category: 'encoding',
      enabled: true
    }));
  });

  it('replaces placeholder feature descriptions with the proposal rationale when enabling a suggestion', () => {
    const setPanelError = vi.fn();
    const item: FeatureSuggestionItem = {
      type: 'feature_suggestion',
      id: 'feat-missing-flag',
      feature: {
        sourceColumn: 'CF EE Division',
        featureName: 'CF_EE_Division_missing_flag',
        description: 'Feature proposed — awaiting user review',
        method: 'missing_indicator',
        params: {}
      },
      rationale: 'Flag rows where CF EE Division is blank so downstream models can learn missingness as signal.',
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

    expect(upsertFeatureMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'feat-missing-flag',
      description: 'Flag rows where CF EE Division is blank so downstream models can learn missingness as signal.'
    }));
  });

  describe('derived-drafts persistence regression', () => {
    // The user reported: "when i refresh the page or switch the tab and then
    // come back to the draft, the cards that i enabled goes back to the state
    // to enable them again". Root cause was that useSuggestionDrafts cached a
    // useState snapshot of featureById at mount time, so when hydration
    // populated the Zustand features array milliseconds later, cards had
    // already rendered with "Enable" labels. The fix derives drafts from
    // featureById via useMemo so they update synchronously on every render.

    function buildSpec(overrides: Partial<FeatureSpec>): FeatureSpec {
      return {
        id: 'feat-x',
        projectId: 'project-1',
        sourceColumn: 'salary',
        featureName: 'salary_log',
        description: '',
        method: 'log1p_transform',
        category: 'numeric_transform',
        params: {},
        enabled: true,
        createdAt: '2026-04-05T00:00:00.000Z',
        ...overrides
      };
    }

    it('derives suggestionDrafts from featureById on first render (no mount snapshot)', () => {
      const setPanelError = vi.fn();
      const feature = buildSpec({ id: 'feat-hydrated', enabled: true });
      const featureById = new Map<string, FeatureSpec>([[feature.id, feature]]);

      const { result } = renderHook(() => useSuggestionDrafts({
        projectId: 'project-1',
        featureById,
        setPanelError
      }));

      // Enabled features must show up immediately on the very first render.
      expect(result.current.suggestionDrafts['feat-hydrated']).toBeDefined();
      expect(result.current.suggestionDrafts['feat-hydrated'].enabled).toBe(true);
    });

    it('re-derives when featureById is populated after the first render (hydration race)', () => {
      const setPanelError = vi.fn();
      const emptyMap = new Map<string, FeatureSpec>();

      const { result, rerender } = renderHook(
        ({ featureById }) => useSuggestionDrafts({
          projectId: 'project-1',
          featureById,
          setPanelError
        }),
        { initialProps: { featureById: emptyMap } }
      );

      // Before hydration: no drafts.
      expect(Object.keys(result.current.suggestionDrafts)).toEqual([]);

      // Simulate hydration completing and featureById updating with a new
      // map identity (the same way useFeaturePipelineState rebuilds it).
      const hydrated = buildSpec({ id: 'feat-late', enabled: true });
      const hydratedMap = new Map<string, FeatureSpec>([[hydrated.id, hydrated]]);
      rerender({ featureById: hydratedMap });

      // After hydration: draft must be present on the very next render.
      expect(result.current.suggestionDrafts['feat-late']).toEqual({
        enabled: true,
        params: {}
      });
    });

    it('excludes disabled features from suggestionDrafts even if they are in featureById', () => {
      const setPanelError = vi.fn();
      const enabled = buildSpec({ id: 'feat-on', enabled: true });
      const disabled = buildSpec({ id: 'feat-off', enabled: false });
      const featureById = new Map<string, FeatureSpec>([
        [enabled.id, enabled],
        [disabled.id, disabled]
      ]);

      const { result } = renderHook(() => useSuggestionDrafts({
        projectId: 'project-1',
        featureById,
        setPanelError
      }));

      expect(result.current.suggestionDrafts['feat-on']).toBeDefined();
      expect(result.current.suggestionDrafts['feat-off']).toBeUndefined();
    });

    it('reads the latest featureById.params when re-deriving after a store mutation', () => {
      const setPanelError = vi.fn();
      const v1 = buildSpec({ id: 'feat-p', params: { window: 3 } });
      const { result, rerender } = renderHook(
        ({ featureById }) => useSuggestionDrafts({
          projectId: 'project-1',
          featureById,
          setPanelError
        }),
        { initialProps: { featureById: new Map([[v1.id, v1]]) } }
      );
      expect(result.current.suggestionDrafts['feat-p'].params).toEqual({ window: 3 });

      // Simulate a store update (e.g. updateSuggestionControl flushing a new
      // param value). featureById rebuilds; useMemo must re-derive from it.
      const v2 = buildSpec({ id: 'feat-p', params: { window: 7 } });
      rerender({ featureById: new Map([[v2.id, v2]]) });
      expect(result.current.suggestionDrafts['feat-p'].params).toEqual({ window: 7 });
    });

    it('does not return setSuggestionDrafts (drafts are derived, not stored)', () => {
      const setPanelError = vi.fn();
      const { result } = renderHook(() => useSuggestionDrafts({
        projectId: 'project-1',
        featureById: new Map(),
        setPanelError
      }));
      // Drafts are a derived memo — there is no setter to expose.
      expect((result.current as Record<string, unknown>).setSuggestionDrafts).toBeUndefined();
    });
  });
});
