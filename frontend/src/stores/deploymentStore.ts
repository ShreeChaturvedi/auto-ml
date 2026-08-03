import { create } from 'zustand';
import type { DeploymentRecord, DeploymentStatus } from '@/types/deployment';
import * as api from '@/lib/api/deployments';

interface DeploymentState {
  // Core state
  deployments: DeploymentRecord[];
  selectedDeploymentId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  refreshDeployments: (projectId: string) => Promise<void>;
  selectDeployment: (id: string | null) => void;
  deploy: (modelId: string, projectId: string, name: string) => Promise<DeploymentRecord>;
  stop: (deploymentId: string) => Promise<void>;
  start: (deploymentId: string) => Promise<void>;
  restart: (deploymentId: string) => Promise<void>;
  remove: (deploymentId: string) => Promise<void>;
  updateDeploymentStatus: (id: string, status: DeploymentStatus, errorMessage?: string) => void;
}

export const useDeploymentStore = create<DeploymentState>((set, get) => ({
  deployments: [],
  selectedDeploymentId: null,
  isLoading: false,
  error: null,

  refreshDeployments: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { deployments } = await api.listDeployments(projectId);
      set({ deployments, isLoading: false });
      // Auto-select first if nothing selected
      if (!get().selectedDeploymentId && deployments.length > 0) {
        set({ selectedDeploymentId: deployments[0].deploymentId });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load deployments', isLoading: false });
    }
  },

  selectDeployment: (id) => set({ selectedDeploymentId: id }),

  deploy: async (modelId, projectId, name) => {
    set({ isLoading: true, error: null });
    try {
      const { deployment } = await api.createDeployment(modelId, projectId, name);
      set(state => ({
        deployments: [...state.deployments, deployment],
        selectedDeploymentId: deployment.deploymentId,
        isLoading: false,
      }));
      return deployment;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Deploy failed';
      // Optimistically surface a failed deployment in the sidebar so the user
      // sees it without a full page refresh (matches success-path list update).
      const failedId = `failed-${Date.now()}`;
      const failedDeployment = {
        deploymentId: failedId,
        projectId,
        modelId,
        name,
        status: 'failed' as const,
        errorMessage: error,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as DeploymentRecord;
      set(state => ({
        deployments: [...state.deployments, failedDeployment],
        selectedDeploymentId: failedId,
        error,
        isLoading: false,
      }));
      // Best-effort reconcile: if the server persisted a failed row, prefer it.
      // Do not call refreshDeployments here — it clears `error` and would wipe
      // the optimistic row when create never persisted.
      void api
        .listDeployments(projectId)
        .then(({ deployments: serverDeployments }) => {
          if (serverDeployments.length === 0) return;
          set(state => {
            const serverIds = new Set(serverDeployments.map(d => d.deploymentId));
            // Drop optimistic rows that the server has already persisted (same model + name).
            const keepOptimistic = state.deployments.filter(d => {
              if (!d.deploymentId.startsWith('failed-') || serverIds.has(d.deploymentId)) {
                return false;
              }
              return !serverDeployments.some(
                s => s.modelId === d.modelId && s.name === d.name,
              );
            });
            const deployments = [...serverDeployments, ...keepOptimistic];
            const selectedStillPresent = deployments.some(
              d => d.deploymentId === state.selectedDeploymentId,
            );
            return {
              deployments,
              selectedDeploymentId: selectedStillPresent
                ? state.selectedDeploymentId
                : (serverDeployments[0]?.deploymentId ?? state.selectedDeploymentId),
            };
          });
        })
        .catch(() => undefined);
      throw err;
    }
  },

  stop: async (deploymentId) => {
    set({ error: null });
    try {
      const { deployment } = await api.stopDeployment(deploymentId);
      set(state => ({
        deployments: state.deployments.map(d => d.deploymentId === deploymentId ? deployment : d),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stop failed';
      set({ error: msg });
      throw err;
    }
  },

  start: async (deploymentId) => {
    set({ error: null });
    try {
      const { deployment } = await api.startDeployment(deploymentId);
      set(state => ({
        deployments: state.deployments.map(d => d.deploymentId === deploymentId ? deployment : d),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Start failed';
      set({ error: msg });
      throw err;
    }
  },

  restart: async (deploymentId) => {
    set({ error: null });
    try {
      await api.stopDeployment(deploymentId);
      const { deployment } = await api.startDeployment(deploymentId);
      set(state => ({
        deployments: state.deployments.map(d => d.deploymentId === deploymentId ? deployment : d),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restart failed';
      set({ error: msg });
      throw err;
    }
  },

  remove: async (deploymentId) => {
    set({ error: null });
    try {
      await api.deleteDeployment(deploymentId);
      set(state => {
        const remaining = state.deployments.filter(d => d.deploymentId !== deploymentId);
        return {
          deployments: remaining,
          selectedDeploymentId: state.selectedDeploymentId === deploymentId
            ? (remaining[0]?.deploymentId ?? null)
            : state.selectedDeploymentId,
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      set({ error: msg });
      throw err;
    }
  },

  updateDeploymentStatus: (id, status, errorMessage) => {
    const current = get().deployments.find(d => d.deploymentId === id);
    // Skip no-op updates to avoid spurious re-renders from new object refs
    if (current && current.status === status && current.errorMessage === errorMessage) return;
    set(state => ({
      deployments: state.deployments.map(d =>
        d.deploymentId === id ? { ...d, status, errorMessage } : d
      ),
    }));
  },
}));
