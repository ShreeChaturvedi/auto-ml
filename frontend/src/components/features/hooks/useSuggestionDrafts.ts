import { useCallback, useEffect, useState } from 'react';
import {
  buildSuggestionDefaults,
  type FeatureSuggestionItem
} from '../featureEngineeringUtils';
import { useFeatureStore } from '@/stores/featureStore';
import type { FeatureCategory, FeatureMethod, FeatureSpec } from '@/types/feature';
import { FEATURE_TEMPLATES } from '@/lib/features/featureTemplates';

const methodCategoryMap = new Map<FeatureMethod, FeatureCategory>(
  FEATURE_TEMPLATES.map((template) => [template.method, template.category])
);

const fallbackMethodCategoryMap: Partial<Record<FeatureMethod, FeatureCategory>> = {
  square_transform: 'numeric_transform',
  reciprocal_transform: 'numeric_transform',
  max_abs_scale: 'scaling',
  binary_encode: 'encoding',
  extract_day: 'datetime'
};

export type SuggestionDraft = {
  enabled: boolean;
  params: Record<string, unknown>;
};

interface UseSuggestionDraftsOptions {
  projectId: string;
  featureById: Map<string, FeatureSpec>;
  setPanelError: (error: string | null) => void;
}

export function useSuggestionDrafts({ projectId, featureById, setPanelError }: UseSuggestionDraftsOptions) {
  const upsertFeature = useFeatureStore((state) => state.upsertFeature);
  const removeFeature = useFeatureStore((state) => state.removeFeature);

  // Hydrate drafts from the feature store so toggles persist across tab switches.
  const [suggestionDrafts, setSuggestionDrafts] = useState<Record<string, SuggestionDraft>>(() => {
    const initial: Record<string, SuggestionDraft> = {};
    for (const [id, feature] of featureById) {
      if (feature.enabled) {
        initial[id] = { enabled: true, params: feature.params ?? {} };
      }
    }
    return initial;
  });

  // Re-sync when featureById updates asynchronously (e.g. backend hydration)
  useEffect(() => {
    setSuggestionDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, feature] of featureById) {
        if (feature.enabled && !prev[id]) {
          next[id] = { enabled: true, params: feature.params ?? {} };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [featureById]);

  const syncSuggestionToFeatureStore = useCallback(
    (item: FeatureSuggestionItem, draft: SuggestionDraft) => {
      const method = item.feature.method as FeatureMethod;
      const category = methodCategoryMap.get(method) ?? fallbackMethodCategoryMap[method];
      if (!category) {
        setPanelError(`Unsupported feature method: ${item.feature.method}`);
        return;
      }

      setPanelError(null);

      if (!draft.enabled) {
        removeFeature(item.id);
        return;
      }

      const feature: FeatureSpec = {
        id: item.id,
        projectId,
        sourceColumn: item.feature.sourceColumn,
        secondaryColumn: item.feature.secondaryColumn,
        featureName: item.feature.featureName,
        description: item.feature.description ?? item.rationale,
        method,
        category,
        params: draft.params,
        enabled: true,
        createdAt: featureById.get(item.id)?.createdAt ?? new Date().toISOString()
      };

      upsertFeature(feature);
    },
    [featureById, projectId, removeFeature, upsertFeature, setPanelError]
  );

  const toggleSuggestion = useCallback(
    (item: FeatureSuggestionItem, enabled: boolean) => {
      setSuggestionDrafts((previous) => {
        const current = previous[item.id] ?? {
          enabled: featureById.get(item.id)?.enabled ?? false,
          params: featureById.get(item.id)?.params ?? buildSuggestionDefaults(item)
        };
        const next: SuggestionDraft = { ...current, enabled };
        syncSuggestionToFeatureStore(item, next);
        return { ...previous, [item.id]: next };
      });
    },
    [featureById, syncSuggestionToFeatureStore]
  );

  const updateSuggestionControl = useCallback(
    (item: FeatureSuggestionItem, key: string, value: unknown) => {
      setSuggestionDrafts((previous) => {
        const current = previous[item.id] ?? {
          enabled: featureById.get(item.id)?.enabled ?? false,
          params: featureById.get(item.id)?.params ?? buildSuggestionDefaults(item)
        };
        const next: SuggestionDraft = {
          ...current,
          params: { ...current.params, [key]: value }
        };

        if (next.enabled) {
          syncSuggestionToFeatureStore(item, next);
        }

        return { ...previous, [item.id]: next };
      });
    },
    [featureById, syncSuggestionToFeatureStore]
  );

  return {
    suggestionDrafts,
    setSuggestionDrafts,
    toggleSuggestion,
    updateSuggestionControl
  };
}
