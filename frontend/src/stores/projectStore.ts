import { createPersistedStore } from './utils/createPersistedStore';

import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  listProjects as apiListProjects,
  updateProject as apiUpdateProject
} from '@/lib/api/projects';
import type { ApiProject, ApiProjectMetadata, ApiProjectPayload } from '@/lib/api/projects';
import type { Phase } from '@/types/phase';
import { getNextPhase } from '@/types/phase';
import type { Project, ProjectFormData, ProjectColor } from '@/types/project';
import {
  DEFAULT_PHASE_STATE,
  buildPhaseState,
  isProjectColor,
  completePhaseForProject
} from './projectPhaseUtils';

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  error?: string;

  initialize: () => Promise<void>;
  createProject: (data: ProjectFormData) => Promise<Project>;
  updateProject: (id: string, data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<Project | undefined>;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;
  getActiveProject: () => Project | undefined;
  getProjectById: (id: string) => Project | undefined;

  setCurrentPhase: (projectId: string, phase: Phase) => void;
  unlockPhase: (projectId: string, phase: Phase) => void;
  completePhase: (projectId: string, phase: Phase) => void;
  isPhaseUnlocked: (projectId: string, phase: Phase) => boolean;
  isPhaseCompleted: (projectId: string, phase: Phase) => boolean;
}

function normalizeProject(apiProject: ApiProject): Project {
  const phaseState = buildPhaseState(apiProject.metadata);

  const customColor = apiProject.metadata?.customColor;

  return {
    id: apiProject.id,
    title: apiProject.name,
    description: apiProject.description,
    icon: apiProject.icon ?? 'Folder',
    color: isProjectColor(apiProject.color) ? apiProject.color : 'blue',
    ...(typeof customColor === 'string' && customColor ? { customColor } : {}),
    createdAt: new Date(apiProject.createdAt),
    updatedAt: new Date(apiProject.updatedAt),
    ...phaseState,
    metadata: apiProject.metadata ? { ...apiProject.metadata } : {}
  };
}

function toApiMetadata(project: Project): ApiProjectMetadata {
  const metadata: ApiProjectMetadata = {
    ...(project.metadata ?? {}),
    unlockedPhases: [...project.unlockedPhases],
    completedPhases: [...project.completedPhases],
    currentPhase: project.currentPhase
  };

  return metadata;
}

function mergeProjectUpdate(
  existing: Project,
  data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>
): Project {
  return {
    ...existing,
    ...data,
    metadata: data.metadata
      ? { ...(existing.metadata ?? {}), ...data.metadata }
      : existing.metadata
  };
}

function touchesPhaseState(
  data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>
): boolean {
  if (
    data.currentPhase !== undefined
    || data.unlockedPhases !== undefined
    || data.completedPhases !== undefined
  ) {
    return true;
  }

  if (!data.metadata || typeof data.metadata !== 'object') {
    return false;
  }

  return (
    Object.prototype.hasOwnProperty.call(data.metadata, 'currentPhase')
    || Object.prototype.hasOwnProperty.call(data.metadata, 'unlockedPhases')
    || Object.prototype.hasOwnProperty.call(data.metadata, 'completedPhases')
  );
}

function preservePhaseState(project: Project, phaseSource: Project): Project {
  return {
    ...project,
    currentPhase: phaseSource.currentPhase,
    unlockedPhases: [...phaseSource.unlockedPhases],
    completedPhases: [...phaseSource.completedPhases],
    metadata: {
      ...(project.metadata ?? {}),
      currentPhase: phaseSource.currentPhase,
      unlockedPhases: [...phaseSource.unlockedPhases],
      completedPhases: [...phaseSource.completedPhases]
    }
  };
}

function stripPhaseMetadata(metadata?: ApiProjectMetadata): ApiProjectMetadata | undefined {
  if (!metadata) return undefined;

  const next = { ...metadata };
  delete next.currentPhase;
  delete next.unlockedPhases;
  delete next.completedPhases;
  return next;
}

function toPhaseMetadata(project: Project): ApiProjectMetadata {
  return {
    ...(stripPhaseMetadata(project.metadata as ApiProjectMetadata | undefined) ?? {}),
    unlockedPhases: [...project.unlockedPhases],
    completedPhases: [...project.completedPhases],
    currentPhase: project.currentPhase
  };
}

function toCreatePayload(form: ProjectFormData): ApiProjectPayload {
  return {
    name: form.title,
    description: form.description,
    icon: form.icon,
    color: form.color,
    metadata: {
      ...DEFAULT_PHASE_STATE,
      ...(form.color === 'custom' && form.customColor ? { customColor: form.customColor } : {})
    }
  };
}

export const useProjectStore = createPersistedStore<ProjectState>(
  'projects',
  (set, get) => {
    const updateRequestVersions = new Map<string, number>();
    const lastSyncedProjectMetadata = new Map<string, string>();

    const syncProjectMetadata = async (projectId: string) => {
      const project = get().projects.find((item) => item.id === projectId);
      if (!project) return;

      const serializedMetadata = JSON.stringify(toPhaseMetadata(project));
      if (lastSyncedProjectMetadata.get(projectId) === serializedMetadata) {
        return;
      }
      const requestVersion = (updateRequestVersions.get(projectId) ?? 0) + 1;
      updateRequestVersions.set(projectId, requestVersion);

      try {
        await apiUpdateProject(projectId, {
          metadata: JSON.parse(serializedMetadata) as ApiProjectMetadata
        });
        if ((updateRequestVersions.get(projectId) ?? 0) !== requestVersion) {
          return;
        }
        lastSyncedProjectMetadata.set(projectId, serializedMetadata);
      } catch (error) {
        console.error('Failed to sync project metadata', error);
        if ((updateRequestVersions.get(projectId) ?? 0) === requestVersion) {
          set({ error: 'Failed to sync project metadata' });
        }
      }
    };

    return {
      projects: [],
      activeProjectId: null,
      isInitialized: false,
      isLoading: false,
      error: undefined,

      async initialize() {
        const state = get();
        if (state.isLoading) {
          return;
        }

        if (state.isInitialized && !state.error) {
          return;
        }

        set({ isLoading: true, error: undefined });

        try {
          const { projects } = await apiListProjects();
          const normalized = projects.map(normalizeProject);
          normalized.forEach((project) => {
            lastSyncedProjectMetadata.set(project.id, JSON.stringify(toPhaseMetadata(project)));
          });
          const currentActive = get().activeProjectId;
          // Only auto-select the first project when not at root — prevents
          // the sidebar from briefly flashing a project's workflow tree on
          // the homepage before HomePage's useEffect can clear it.
          const autoSelect = window.location.pathname === '/'
            ? null
            : normalized[0]?.id ?? null;
          set({
            projects: normalized,
            activeProjectId: currentActive ?? autoSelect,
            isInitialized: true,
            isLoading: false,
            error: undefined
          });
        } catch (error) {
          console.error('Failed to load projects', error);

          // Check if we have locally persisted projects to fall back to
          const localProjects = get().projects;
          const isDev = import.meta.env.DEV || import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

          if (localProjects.length > 0 && isDev) {
            // In dev mode with local data, continue working offline
            console.warn('[projectStore] Backend unavailable, using local projects');
            set({
              isInitialized: true,
              isLoading: false,
              error: undefined // Clear error since we have local data
            });
          } else {
            set({
              isInitialized: true,
              isLoading: false,
              error: 'Unable to load projects from backend. Ensure the backend is running.'
            });
          }
        }
      },

      async createProject(data) {
        set({ error: undefined });

        try {
          const response = await apiCreateProject(toCreatePayload(data));
          const project = normalizeProject(response.project);
          lastSyncedProjectMetadata.set(project.id, JSON.stringify(toPhaseMetadata(project)));

          set((state) => ({
            projects: [...state.projects, project],
            activeProjectId: project.id
          }));

          return project;
        } catch (error) {
          console.error('Failed to create project', error);

          // In dev mode, allow local-only project creation when backend is unavailable
          const isDev = import.meta.env.DEV || import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
          if (isDev) {
            console.warn('[projectStore] Backend unavailable, creating local-only project');
            const localProject: Project = {
              id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              title: data.title,
              description: data.description,
              icon: data.icon ?? 'Folder',
              color: data.color ?? 'blue',
              createdAt: new Date(),
              updatedAt: new Date(),
              ...DEFAULT_PHASE_STATE,
              metadata: {}
            };

            set((state) => ({
              projects: [...state.projects, localProject],
              activeProjectId: localProject.id
            }));

            return localProject;
          }

          set({ error: 'Unable to create project' });
          throw error;
        }
      },

      async updateProject(id, data) {
        const existing = get().projects.find((project) => project.id === id);
        if (!existing) {
          return undefined;
        }

        set({ error: undefined });

        const phaseStateTouched = touchesPhaseState(data);
        const mergedColor = (data.color ?? existing.color) as ProjectColor;
        const mergedProject = mergeProjectUpdate(existing, data);
        const optimisticProject: Project = {
          ...mergedProject,
          updatedAt: new Date()
        };
        const apiMeta = phaseStateTouched
          ? toApiMetadata(mergedProject)
          : { ...(stripPhaseMetadata(data.metadata as ApiProjectMetadata | undefined) ?? {}) };
        const requestVersion = (updateRequestVersions.get(id) ?? 0) + 1;
        updateRequestVersions.set(id, requestVersion);

        set((state) => ({
          projects: state.projects.map((item) => (item.id === id ? optimisticProject : item))
        }));

        // Persist or clear customColor in metadata
        if (mergedColor === 'custom' && (data as Partial<Project>).customColor) {
          apiMeta.customColor = (data as Partial<Project>).customColor;
        } else if (mergedColor !== 'custom') {
          apiMeta.customColor = undefined;
        }

        const payload: Partial<ApiProjectPayload> = {
          name: data.title ?? existing.title,
          description: data.description ?? existing.description,
          icon: data.icon ?? existing.icon,
          color: mergedColor
        };

        if (Object.keys(apiMeta).length > 0) {
          payload.metadata = apiMeta;
        }

        try {
          const response = await apiUpdateProject(id, payload);
          if ((updateRequestVersions.get(id) ?? 0) !== requestVersion) {
            return get().projects.find((item) => item.id === id);
          }
          const project = normalizeProject(response.project);
          lastSyncedProjectMetadata.set(
            project.id,
            JSON.stringify(toPhaseMetadata(phaseStateTouched ? project : (get().projects.find((item) => item.id === id) ?? project)))
          );

          set((state) => ({
            projects: state.projects.map((item) => {
              if (item.id !== id) return item;
              return phaseStateTouched ? project : preservePhaseState(project, item);
            })
          }));

          return get().projects.find((item) => item.id === id);
        } catch (error) {
          console.error('Failed to update project', error);
          if ((updateRequestVersions.get(id) ?? 0) === requestVersion) {
            set({ error: 'Unable to update project' });
          }
          throw error;
        }
      },

      async deleteProject(id) {
        set({ error: undefined });

        try {
          await apiDeleteProject(id);
          set((state) => {
            const remaining = state.projects.filter((project) => project.id !== id);
            const nextActive = state.activeProjectId === id ? remaining[0]?.id ?? null : state.activeProjectId;
            return {
              projects: remaining,
              activeProjectId: nextActive
            };
          });
        } catch (error) {
          console.error('Failed to delete project', error);
          set({ error: 'Unable to delete project' });
          throw error;
        }
      },

      setActiveProject(id) {
        set({ activeProjectId: id });
      },

      getActiveProject() {
        const state = get();
        return state.projects.find((project) => project.id === state.activeProjectId);
      },

      getProjectById(id) {
        return get().projects.find((project) => project.id === id);
      },

      setCurrentPhase(projectId, phase) {
        const existing = get().projects.find((project) => project.id === projectId);
        if (!existing) {
          return;
        }

        const nextPhase = getNextPhase(phase);
        const needsUnlock = !!nextPhase && !existing.unlockedPhases.includes(nextPhase);
        if (existing.currentPhase === phase && !needsUnlock) {
          return;
        }

        set((state) => ({
          projects: state.projects.map((project) => {
            if (project.id !== projectId) return project;

            const unlockedPhases = needsUnlock
              ? [...project.unlockedPhases, nextPhase]
              : project.unlockedPhases;

            return { ...project, currentPhase: phase, unlockedPhases, updatedAt: new Date() };
          })
        }));

        void syncProjectMetadata(projectId);
      },

      unlockPhase(projectId, phase) {
        const existing = get().projects.find((project) => project.id === projectId);
        if (!existing || existing.unlockedPhases.includes(phase)) {
          return;
        }

        set((state) => ({
          projects: state.projects.map((project) => {
            if (project.id !== projectId) return project;

            return {
              ...project,
              unlockedPhases: [...project.unlockedPhases, phase],
              updatedAt: new Date()
            };
          })
        }));

        void syncProjectMetadata(projectId);
      },

      completePhase(projectId, phase) {
        const existing = get().projects.find((project) => project.id === projectId);
        if (!existing || existing.completedPhases.includes(phase)) {
          return;
        }

        set((state) => ({
          projects: state.projects.map((project) => {
            if (project.id !== projectId) return project;

            const { completedPhases, unlockedPhases } = completePhaseForProject(project, phase);

            return {
              ...project,
              completedPhases,
              unlockedPhases,
              updatedAt: new Date()
            };
          })
        }));

        void syncProjectMetadata(projectId);
      },

      isPhaseUnlocked(projectId, phase) {
        const project = get().projects.find((p) => p.id === projectId);
        return project ? project.unlockedPhases.includes(phase) : false;
      },

      isPhaseCompleted(projectId, phase) {
        const project = get().projects.find((p) => p.id === projectId);
        return project ? project.completedPhases.includes(phase) : false;
      }
    };
  },
  (state) => ({
    projects: state.projects,
    activeProjectId: state.activeProjectId
  }),
  {
    version: 3,
    migrate: (persistedState: unknown) => {
      const state = persistedState as ProjectState | undefined;
      if (!state) return { projects: [], activeProjectId: null, isInitialized: false, isLoading: false };
      return state;
    },
    merge: (persisted, current) => {
      const merged = { ...current, ...(persisted as Partial<ProjectState>) };
      // At root path, discard persisted activeProjectId to prevent the sidebar
      // from briefly flashing the last-opened project before HomePage clears it.
      if (window.location.pathname === '/') merged.activeProjectId = null;
      return merged;
    },
    fullName: 'automl-projects-storage'
  }
);
