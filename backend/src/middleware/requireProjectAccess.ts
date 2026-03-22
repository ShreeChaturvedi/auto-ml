import type { Response, NextFunction } from 'express';

import type { ProjectRepository } from '../repositories/project/types.js';
import type { AuthRequest } from '../types/auth.js';
import type { Project } from '../types/project.js';

export interface ProjectAuthRequest extends AuthRequest {
  project?: Project;
}

export function requireProjectAccess(repository: ProjectRepository) {
  return async (req: ProjectAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    // Extract projectId from query or body only (NOT params — empty at router-level middleware)
    const projectId = (req.query.projectId as string | undefined) || req.body?.projectId;

    if (!projectId) {
      // No projectId in query/body — handled per-route or not project-scoped
      next();
      return;
    }

    const project = await repository.getById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // If project has an owner and current user doesn't match, deny access
    // Use 404 (not 403) to avoid leaking project existence
    if (project.userId && req.user && project.userId !== req.user.user_id) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    req.project = project;
    next();
  };
}
