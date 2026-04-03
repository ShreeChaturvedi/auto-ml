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
      set({ error: err instanceof Error ? err.message : 'Deploy failed', isLoading: false });
      throw err;
    }
  },

  stop: async (deploymentId) => {
    try {
      const { deployment } = await api.stopDeployment(deploymentId);
      set(state => ({
        deployments: state.deployments.map(d => d.deploymentId === deploymentId ? deployment : d),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Stop failed' });
    }
  },

  start: async (deploymentId) => {
    try {
      const { deployment } = await api.startDeployment(deploymentId);
      set(state => ({
        deployments: state.deployments.map(d => d.deploymentId === deploymentId ? deployment : d),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Start failed' });
    }
  },

  remove: async (deploymentId) => {
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
      set({ error: err instanceof Error ? err.message : 'Delete failed' });
    }
  },

  updateDeploymentStatus: (id, status, errorMessage) => {
    set(state => ({
      deployments: state.deployments.map(d =>
        d.deploymentId === id ? { ...d, status, errorMessage } : d
      ),
    }));
  },
}));
