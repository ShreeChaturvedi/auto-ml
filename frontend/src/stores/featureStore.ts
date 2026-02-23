import { create } from 'zustand';
import type { FeatureSpec } from '@/types/feature';
import { useProjectStore } from './projectStore';

interface FeatureState {
  features: FeatureSpec[];
  addFeature: (feature: Omit<FeatureSpec, 'id' | 'createdAt' | 'enabled'> & { enabled?: boolean }) => FeatureSpec;
  upsertFeature: (feature: FeatureSpec) => FeatureSpec;
  updateFeature: (id: string, updates: Partial<FeatureSpec>) => void;
  toggleFeature: (id: string) => void;
  removeFeature: (id: string) => void;
  getFeaturesByProject: (projectId: string) => FeatureSpec[];
  hydrateFromProject: (projectId: string, options?: { force?: boolean }) => void;
  syncFeaturesToProject: (projectId: string) => Promise<void>;
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `feature-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useFeatureStore = create<FeatureState>()((set, get) => ({
  features: [],

  hydrateFromProject(projectId, options) {
    const force = options?.force ?? false;
    const state = get();
    if (!force && state.features.some((feature) => feature.projectId === projectId)) {
      return;
    }

    const projectStore = useProjectStore.getState();
    const project = projectStore.getProjectById(projectId);
    const rawFeatures = Array.isArray(project?.metadata?.features)
      ? (project?.metadata?.features as FeatureSpec[])
      : [];

    const normalized = rawFeatures
      .filter((feature) => feature && typeof feature === 'object')
      .map((feature) => {
        const secondaryFromParams =
          typeof feature.params?.secondaryColumn === 'string'
            ? feature.params.secondaryColumn
            : undefined;

        return {
          ...feature,
          id: feature.id ?? makeId(),
          projectId: feature.projectId ?? projectId,
          secondaryColumn: feature.secondaryColumn ?? secondaryFromParams,
          featureName: feature.featureName || `${feature.sourceColumn}_${feature.method}`,
          enabled: feature.enabled ?? true,
          createdAt: feature.createdAt ?? new Date().toISOString()
        };
      });

    set((state) => ({
      features: [
        ...state.features.filter((feature) => feature.projectId !== projectId),
        ...normalized
      ]
    }));
  },

  addFeature(featureInput) {
    const feature: FeatureSpec = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      enabled: featureInput.enabled ?? true,
      ...featureInput
    };

    set((state) => ({
      features: [...state.features, feature]
    }));

    void get().syncFeaturesToProject(feature.projectId);
    return feature;
  },

  upsertFeature(featureInput) {
    let nextFeature = featureInput;
    const existing = get().features.find((feature) => feature.id === featureInput.id);
    if (existing) {
      nextFeature = {
        ...existing,
        ...featureInput,
        createdAt: existing.createdAt || featureInput.createdAt,
        enabled: featureInput.enabled ?? existing.enabled ?? true
      };
    } else {
      nextFeature = {
        ...featureInput,
        createdAt: featureInput.createdAt ?? new Date().toISOString(),
        enabled: featureInput.enabled ?? true
      };
    }

    set((state) => {
      const exists = state.features.some((feature) => feature.id === nextFeature.id);
      return {
        features: exists
          ? state.features.map((feature) => (feature.id === nextFeature.id ? nextFeature : feature))
          : [...state.features, nextFeature]
      };
    });

    void get().syncFeaturesToProject(nextFeature.projectId);
    return nextFeature;
  },

  updateFeature(id, updates) {
    set((state) => ({
      features: state.features.map((feature) =>
        feature.id === id ? { ...feature, ...updates } : feature
      )
    }));

    const feature = get().features.find((item) => item.id === id);
    if (feature) {
      void get().syncFeaturesToProject(feature.projectId);
    }
  },

  toggleFeature(id) {
    set((state) => ({
      features: state.features.map((feature) =>
        feature.id === id ? { ...feature, enabled: !feature.enabled } : feature
      )
    }));

    const feature = get().features.find((item) => item.id === id);
    if (feature) {
      void get().syncFeaturesToProject(feature.projectId);
    }
  },

  removeFeature(id) {
    const feature = get().features.find((item) => item.id === id);
    set((state) => ({
      features: state.features.filter((item) => item.id !== id)
    }));

    if (feature) {
      void get().syncFeaturesToProject(feature.projectId);
    }
  },

  getFeaturesByProject(projectId) {
    return get().features.filter((feature) => feature.projectId === projectId);
  },

  async syncFeaturesToProject(projectId: string) {
    const projectStore = useProjectStore.getState();
    const project = projectStore.getProjectById(projectId);
    if (!project) return;

    const features = get().features.filter((feature) => feature.projectId === projectId);

    const metadata = {
      ...(project.metadata ?? {}),
      features
    };

    try {
      await projectStore.updateProject(projectId, { metadata });
    } catch (error) {
      console.error('Failed to sync features to project metadata', error);
    }
  }
}));
