/**
 * Frame-deterministic replacement for `frontend/src/stores/projectStore.ts`.
 *
 * Scenes we render today (HomePage, auth forms) only read:
 *   projects / activeProjectId / setActiveProject / isInitialized /
 *   isLoading / error.
 *
 * We still expose the full public API surface (as no-ops) so real internal
 * components that do `useProjectStore(selector)` with other fields won't
 * crash the render. Beats 3+ will flesh out the handful that actually need
 * fixture data.
 */

import { create } from "zustand";
import type { Phase, Project, ProjectFormData } from "./types";

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  error?: string;

  initialize: () => Promise<void>;
  createProject: (data: ProjectFormData) => Promise<Project>;
  updateProject: (
    id: string,
    data: Partial<Omit<Project, "id" | "createdAt" | "updatedAt">>,
  ) => Promise<Project | undefined>;
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

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  isInitialized: true,
  isLoading: false,
  error: undefined,

  initialize: async () => undefined,
  createProject: async () => {
    throw new Error("mockProjectStore.createProject not implemented");
  },
  updateProject: async () => undefined,
  deleteProject: async () => undefined,
  setActiveProject: (activeProjectId) => set({ activeProjectId }),
  getActiveProject: () => {
    const s = get();
    return s.projects.find((p) => p.id === s.activeProjectId);
  },
  getProjectById: (id) => get().projects.find((p) => p.id === id),

  setCurrentPhase: () => undefined,
  unlockPhase: () => undefined,
  completePhase: () => undefined,
  isPhaseUnlocked: () => false,
  isPhaseCompleted: () => false,
}));

/**
 * Scene-side helper: seed the project store with fixture data. Scenes that
 * mount project-dependent components (e.g. the sidebar) will call this on a
 * specific frame.
 */
export function setProjectsFixture(
  projects: Project[],
  activeProjectId: string | null = null,
): void {
  useProjectStore.setState({
    projects,
    activeProjectId,
    isInitialized: true,
    isLoading: false,
    error: undefined,
  });
}
