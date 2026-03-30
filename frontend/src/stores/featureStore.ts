import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FeatureSpec, PipelineVersion, ReadinessReport } from '@/types/feature';
import { useProjectStore } from './projectStore';
import {
  makeId,
  createDraftVersionRecord,
  removeVersionFromList,
  renameVersionInList,
  updateReadinessInList,
  approveVersionInList
} from './featureVersionSlice';

/** Lifecycle step tracked during a feature engineering workflow run. */
export interface FeatureLifecycleStep {
  stepId: string;
  name: string;
  method: string;
  status: string;
  error?: string;
  code?: string;
  metrics?: Record<string, unknown>;
}

interface FeatureState {
  features: FeatureSpec[];
  versions: Record<string, PipelineVersion[]>;
  currentVersionId: Record<string, string>;

  /** Lifecycle state: active feature steps keyed by stepId. */
  featureSteps: Record<string, FeatureLifecycleStep>;
  /** Current lifecycle stage name (e.g. 'propose_feature', 'execute_feature'). */
  currentStage: string | null;
  /** Active feature engineering workflow run ID. */
  featureRunId: string | null;

  addFeature: (feature: Omit<FeatureSpec, 'id' | 'createdAt' | 'enabled'> & { enabled?: boolean }) => FeatureSpec;
  upsertFeature: (feature: FeatureSpec) => FeatureSpec;
  updateFeature: (id: string, updates: Partial<FeatureSpec>) => void;
  toggleFeature: (id: string) => void;
  removeFeature: (id: string) => void;
  clearProjectFeatures: (projectId: string) => void;
  getFeaturesByProject: (projectId: string) => FeatureSpec[];
  hydrateFromProject: (projectId: string, options?: { force?: boolean }) => void;
  syncFeaturesToProject: (projectId: string) => Promise<void>;

  // Lifecycle actions
  setFeatureStep: (stepId: string, step: FeatureLifecycleStep) => void;
  setCurrentStage: (stage: string | null) => void;
  setFeatureRunId: (runId: string | null) => void;
  clearDraft: () => void;

  // FE v2 actions
  createDraftVersion: (projectId: string, name?: string) => PipelineVersion;
  removeVersion: (projectId: string, versionId: string) => void;
  renameVersion: (projectId: string, versionId: string, name: string) => void;
  updateReadinessReport: (projectId: string, versionId: string, report: Partial<ReadinessReport>) => void;
  approveVersion: (projectId: string, versionId: string) => void;
  setCurrentVersion: (projectId: string, versionId: string) => void;
  setVersionNotebookId: (projectId: string, versionId: string, notebookId: string) => void;
}

export const useFeatureStore = create<FeatureState>()(persist((set, get) => ({
  features: [],
  versions: {},
  currentVersionId: {},
  featureSteps: {},
  currentStage: null,
  featureRunId: null,

  setFeatureStep(stepId, step) {
    set((state) => ({
      featureSteps: { ...state.featureSteps, [stepId]: step }
    }));
  },

  setCurrentStage(stage) {
    if (get().currentStage === stage) return;
    set({ currentStage: stage });
  },

  setFeatureRunId(runId) {
    if (get().featureRunId === runId) return;
    set({ featureRunId: runId });
  },

  clearDraft() {
    set({
      featureRunId: null,
      currentStage: null,
      featureSteps: {}
    });
  },

  hydrateFromProject(projectId, options) {
    const force = options?.force ?? false;
    const state = get();
    const hasProjectFeatures = state.features.some((feature) => feature.projectId === projectId);
    const hasHydratedVersions = Object.prototype.hasOwnProperty.call(state.versions, projectId);
    const hasHydratedCurrentVersion = Object.prototype.hasOwnProperty.call(state.currentVersionId, projectId);

    if (!force && hasProjectFeatures && hasHydratedVersions && hasHydratedCurrentVersion) {
      return;
    }

    const projectStore = useProjectStore.getState();
    const project = projectStore.getProjectById(projectId);
    const rawFeatures = Array.isArray(project?.metadata?.features)
      ? (project?.metadata?.features as FeatureSpec[])
      : [];

    const rawVersions = Array.isArray(project?.metadata?.pipelineVersions)
      ? (project?.metadata?.pipelineVersions as PipelineVersion[])
      : [];

    const currentVid = (project?.metadata?.currentPipelineVersionId as string) || '';

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
      ],
      versions: {
        ...state.versions,
        [projectId]: rawVersions
      },
      currentVersionId: {
        ...state.currentVersionId,
        [projectId]: currentVid
      }
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

  clearProjectFeatures(projectId) {
    set((state) => ({
      features: state.features.filter((feature) => feature.projectId !== projectId)
    }));
    void get().syncFeaturesToProject(projectId);
  },

  getFeaturesByProject(projectId) {
    return get().features.filter((feature) => feature.projectId === projectId);
  },

  createDraftVersion(projectId, name) {
    const projectVersions = get().versions[projectId] || [];
    const draftCount = projectVersions.filter((version) => version.status === 'draft').length;
    const newVersion = createDraftVersionRecord(projectId, draftCount, name);

    set((state) => {
      const existingVersions = state.versions[projectId] || [];
      return {
        versions: {
          ...state.versions,
          [projectId]: [...existingVersions, newVersion]
        },
        currentVersionId: {
          ...state.currentVersionId,
          [projectId]: newVersion.id
        }
      };
    });

    void get().syncFeaturesToProject(projectId);
    return newVersion;
  },

  removeVersion(projectId, versionId) {
    set((state) => {
      const existingVersions = state.versions[projectId] || [];
      const currentVid = state.currentVersionId[projectId] ?? '';
      const result = removeVersionFromList(existingVersions, versionId, currentVid);

      return {
        versions: {
          ...state.versions,
          [projectId]: result.versions
        },
        currentVersionId: {
          ...state.currentVersionId,
          [projectId]: result.nextCurrentVersionId
        }
      };
    });

    void get().syncFeaturesToProject(projectId);
  },

  renameVersion(projectId, versionId, name) {
    if (!name.trim()) return;

    set((state) => {
      const projectVersions = state.versions[projectId] || [];
      return {
        versions: {
          ...state.versions,
          [projectId]: renameVersionInList(projectVersions, versionId, name)
        }
      };
    });

    void get().syncFeaturesToProject(projectId);
  },

  updateReadinessReport(projectId, versionId, report) {
    set((state) => {
      const projectVersions = state.versions[projectId] || [];
      return {
        versions: {
          ...state.versions,
          [projectId]: updateReadinessInList(projectVersions, versionId, report)
        }
      };
    });
    void get().syncFeaturesToProject(projectId);
  },

  approveVersion(projectId, versionId) {
    set((state) => {
      const projectVersions = state.versions[projectId] || [];
      return {
        versions: {
          ...state.versions,
          [projectId]: approveVersionInList(projectVersions, versionId)
        },
        currentVersionId: {
          ...state.currentVersionId,
          [projectId]: versionId
        }
      };
    });
    void get().syncFeaturesToProject(projectId);
  },

  setCurrentVersion(projectId, versionId) {
    set((state) => ({
      currentVersionId: {
        ...state.currentVersionId,
        [projectId]: versionId
      }
    }));
    void get().syncFeaturesToProject(projectId);
  },

  setVersionNotebookId(projectId, versionId, notebookId) {
    set((state) => {
      const projectVersions = state.versions[projectId] || [];
      return {
        versions: {
          ...state.versions,
          [projectId]: projectVersions.map((version) =>
            version.id === versionId ? { ...version, notebookId } : version
          )
        }
      };
    });
    void get().syncFeaturesToProject(projectId);
  },

  async syncFeaturesToProject(projectId: string) {
    const projectStore = useProjectStore.getState();
    const project = projectStore.getProjectById(projectId);
    if (!project) return;

    const features = get().features.filter((feature) => feature.projectId === projectId);
    const pipelineVersions = get().versions[projectId] || [];
    const currentPipelineVersionId = get().currentVersionId[projectId];

    const metadata = {
      ...(project.metadata ?? {}),
      features,
      pipelineVersions,
      currentPipelineVersionId,
      feWorkflowVersion: pipelineVersions.length > 0
        ? 2
        : (project.metadata as Record<string, unknown> | undefined)?.feWorkflowVersion
    };

    try {
      await projectStore.updateProject(projectId, { metadata });
    } catch (error) {
      console.error('Failed to sync features to project metadata', error);
    }
  }
}), {
  name: 'automl-feature-lifecycle-v1',
  version: 1,
  partialize: (state) => ({
    featureRunId: state.featureRunId,
    currentStage: state.currentStage,
    featureSteps: state.featureSteps
  })
}));

export { buildEmptyReadinessReport } from './featureVersionSlice';
