import { create } from 'zustand';
import type { FeatureSpec, PipelineVersion, ReadinessReport } from '@/types/feature';
import { useProjectStore } from './projectStore';

function buildEmptyReadinessReport(): ReadinessReport {
  return {
    dataSummary: {
      addedColumns: [],
      removedColumns: [],
      renamedColumns: [],
      typeChanges: [],
      nullDeltas: [],
      warnings: []
    },
    steps: []
  };
}

interface FeatureState {
  features: FeatureSpec[];
  versions: Record<string, PipelineVersion[]>;
  currentVersionId: Record<string, string>;

  addFeature: (feature: Omit<FeatureSpec, 'id' | 'createdAt' | 'enabled'> & { enabled?: boolean }) => FeatureSpec;
  upsertFeature: (feature: FeatureSpec) => FeatureSpec;
  updateFeature: (id: string, updates: Partial<FeatureSpec>) => void;
  toggleFeature: (id: string) => void;
  removeFeature: (id: string) => void;
  getFeaturesByProject: (projectId: string) => FeatureSpec[];
  hydrateFromProject: (projectId: string, options?: { force?: boolean }) => void;
  syncFeaturesToProject: (projectId: string) => Promise<void>;

  // FE v2 actions
  createDraftVersion: (projectId: string, name?: string) => PipelineVersion;
  updateReadinessReport: (projectId: string, versionId: string, report: Partial<ReadinessReport>) => void;
  approveVersion: (projectId: string, versionId: string) => void;
  setCurrentVersion: (projectId: string, versionId: string) => void;
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `feature-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useFeatureStore = create<FeatureState>()((set, get) => ({
  features: [],
  versions: {},
  currentVersionId: {},

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

  getFeaturesByProject(projectId) {
    return get().features.filter((feature) => feature.projectId === projectId);
  },

  createDraftVersion(projectId, name) {
    const projectVersions = get().versions[projectId] || [];
    const draftCount = projectVersions.filter((version) => version.status === 'draft').length;
    const generatedName = name?.trim() || `Draft Pipeline v${draftCount + 1}`;

    const newVersion: PipelineVersion = {
      id: makeId(),
      projectId,
      name: generatedName,
      status: 'draft',
      createdAt: new Date().toISOString(),
      readinessReport: buildEmptyReadinessReport()
    };

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

  updateReadinessReport(projectId, versionId, report) {
    set((state) => {
      const projectVersions = state.versions[projectId] || [];
      return {
        versions: {
          ...state.versions,
          [projectId]: projectVersions.map((version) => {
            if (version.id === versionId) {
              return {
                ...version,
                readinessReport: {
                  ...version.readinessReport,
                  ...report
                }
              };
            }
            return version;
          })
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
          [projectId]: projectVersions.map((version) => {
            if (version.id === versionId) {
              return { ...version, status: 'approved', approvedAt: new Date().toISOString() };
            }
            if (version.status === 'approved') {
              return { ...version, status: 'deprecated' };
            }
            return version;
          })
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
}));
