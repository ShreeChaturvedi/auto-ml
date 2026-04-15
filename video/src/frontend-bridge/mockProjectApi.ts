/**
 * Frame-deterministic replacement for `frontend/src/lib/api/projects.ts`.
 *
 * Phase 0 scaffolding — Beats 3+ will extend with per-scene fixture data.
 * Every call resolves to an empty success payload.
 */

import type { Phase } from "./types";

export interface ApiProjectMetadata {
  unlockedPhases?: Phase[];
  completedPhases?: Phase[];
  currentPhase?: Phase;
  customInstructions?: string;
  [key: string]: unknown;
}

export interface ApiProject {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: ApiProjectMetadata;
}

export interface ApiProjectPayload {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  metadata?: ApiProjectMetadata;
}

export async function listProjects(): Promise<{ projects: ApiProject[] }> {
  return Promise.resolve({ projects: [] });
}

const stubProject = (payload: Partial<ApiProjectPayload> = {}): ApiProject => ({
  id: "stub-project",
  name: payload.name ?? "Stub Project",
  description: payload.description,
  icon: payload.icon,
  color: payload.color,
  createdAt: "2026-04-15T19:30:00.000Z",
  updatedAt: "2026-04-15T19:30:00.000Z",
  metadata: payload.metadata,
});

export async function createProject(
  payload: ApiProjectPayload,
): Promise<{ project: ApiProject }> {
  return Promise.resolve({ project: stubProject(payload) });
}

export async function updateProject(
  _id: string,
  payload: Partial<ApiProjectPayload>,
): Promise<{ project: ApiProject }> {
  void _id;
  return Promise.resolve({ project: stubProject(payload) });
}

export async function deleteProject(_id: string): Promise<void> {
  void _id;
  return Promise.resolve();
}
