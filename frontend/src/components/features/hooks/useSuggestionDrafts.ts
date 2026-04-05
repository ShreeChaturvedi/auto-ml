import { useCallback, useMemo } from 'react';
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

// Last-resort category for suggestions whose method isn't in FEATURE_TEMPLATES
// and isn't in the fallback map. The backend's uiNormalization now filters
// suggestions with invalid/missing methods into a report item, but this guard
// handles any that slip through (e.g., a legacy cached draft from before
// the backend fix shipped). Without this, toggling Enable on such a card
// surfaces an "Unsupported feature method" error in the panel.
const LAST_RESORT_CATEGORY: FeatureCategory = 'numeric_transform';

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

  // Derive suggestionDrafts purely from featureById on every render.
  //
  // Previously this hook cached a snapshot of featureById in useState at mount
  // time, then re-synced via useEffect when featureById changed. That pattern
  // had a user-visible bug: on page reload or phase-tab switch, the component
  // remounts with an empty Zustand features array (while hydrateFromProject
  // is still async-in-flight from project metadata). useState initializes
  // with empty featureById, the cards render with "Enable" labels, then the
  // useEffect fires later and flips them to "Enabled" — a visible flicker
  // that made the user think their selections were lost.
  //
  // Deriving with useMemo makes the enabled state a pure function of the
  // Zustand store. The moment hydration populates featureStore.features,
  // featureById changes identity, useMemo recomputes, and cards re-render
  // with the correct label in the same React commit. Combined with the
  // features array now being in featureStore's `partialize`, hydration is
  // synchronous on the very first render after reload — no flicker at all.
  const suggestionDrafts = useMemo<Record<string, SuggestionDraft>>(() => {
    const drafts: Record<string, SuggestionDraft> = {};
    for (const [id, feature] of featureById) {
      if (feature.enabled) {
        drafts[id] = { enabled: true, params: feature.params ?? {} };
      }
    }
    return drafts;
  }, [featureById]);

  const syncSuggestionToFeatureStore = useCallback(
    (item: FeatureSuggestionItem, draft: SuggestionDraft) => {
      const method = item.feature.method as FeatureMethod;
      // Prefer the template map, fall back to the partial map, then the
      // last-resort category so unknown methods don't surface a blocking
      // error. The backend also validates methods at the apply-payload
      // boundary, so this is purely a defensive UI fallback.
      const category = methodCategoryMap.get(method)
        ?? fallbackMethodCategoryMap[method]
        ?? LAST_RESORT_CATEGORY;

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
      // No local state to update — the suggestionDrafts memo re-derives from
      // featureById on the next render, which updates synchronously via
      // Zustand once upsertFeature/removeFeature (inside syncSuggestionToFeatureStore)
      // mutates the store. Pure event-handler work; no setState-in-render
      // risk (see commit 440ea93 for the prior fix of that class of bug).
      const existing = featureById.get(item.id);
      const existingParams = existing?.params ?? buildSuggestionDefaults(item);
      const next: SuggestionDraft = { enabled, params: existingParams };
      syncSuggestionToFeatureStore(item, next);
    },
    [featureById, syncSuggestionToFeatureStore]
  );

  const updateSuggestionControl = useCallback(
    (item: FeatureSuggestionItem, key: string, value: unknown) => {
      // Read latest params from the store, merge the new key, and sync back.
      // Zustand updates are synchronous, so the next render's useMemo will
      // immediately reflect the merged params — no in-flight ref needed.
      const existing = featureById.get(item.id);
      const existingParams = existing?.params ?? buildSuggestionDefaults(item);
      const nextParams = { ...existingParams, [key]: value };
      const next: SuggestionDraft = {
        enabled: existing?.enabled ?? false,
        params: nextParams
      };
      // Only sync back to the store if the feature is enabled. Unenabled
      // features have no persisted entry to update; drafts for them are
      // ephemeral until the user clicks Enable.
      if (next.enabled) {
        syncSuggestionToFeatureStore(item, next);
      }
    },
    [featureById, syncSuggestionToFeatureStore]
  );

  return {
    suggestionDrafts,
    toggleSuggestion,
    updateSuggestionControl
  };
}
