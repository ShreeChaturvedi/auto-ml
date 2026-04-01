import type { NextFunction, Response } from 'express';

import type { ProjectRepository } from '../repositories/project/types.js';
import type { AuthRequest } from '../types/auth.js';
import type { Project } from '../types/project.js';

export type ProjectOwnershipRepository = Pick<ProjectRepository, 'getById' | 'getByIdAndUser'>;

export interface ProjectAuthRequest extends AuthRequest {
  project?: Project;
}

/**
 * Verify that a project belongs to the specified user.
 * Returns the project if owned (or unowned), null if access denied or not found.
 * Uses getByIdAndUser when userId is available, falls back to getById for unowned check.
 */
export async function verifyProjectOwnership(
  projectId: string,
  userId: string | undefined,
  projectRepository: ProjectOwnershipRepository
): Promise<Project | null> {
  if (!userId) {
    // No user context — allow access if project exists (no-DB mode)
    return (await projectRepository.getById(projectId)) ?? null;
  }

  // Single query: returns project if user owns it OR project is unowned
  const project = await projectRepository.getByIdAndUser(projectId, userId);
  if (project) return project;

  // Check if project exists but is unowned (userId is null in DB)
  const unowned = await projectRepository.getById(projectId);
  if (unowned && !unowned.userId) return unowned;

  return null;
}

/**
 * Express middleware to verify project ownership before handler execution.
 * Extracts projectId from params or query, verifies ownership, and attaches
 * verified project to req.project. Returns 404 if verification fails.
 */
export function requireProjectOwnership(
  repository: ProjectRepository,
  source: 'params' | 'query' = 'params',
  paramName: string = 'projectId'
) {
  return async (req: ProjectAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const projectId = source === 'params'
      ? (req.params[paramName] as string | undefined)
      : (req.query[paramName] as string | undefined);

    if (!projectId) {
      res.status(400).json({ error: `Missing ${paramName}` });
      return;
    }

    const project = await verifyProjectOwnership(projectId, req.user?.user_id, repository);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    req.project = project;
    next();
  };
}
