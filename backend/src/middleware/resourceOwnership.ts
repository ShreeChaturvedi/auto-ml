import type { ProjectRepository } from '../repositories/project/types.js';
import type { Project } from '../types/project.js';

/**
 * Verify that a project belongs to the specified user.
 * Returns the project if owned (or unowned), null if access denied or not found.
 * Uses getByIdAndUser when userId is available, falls back to getById for unowned check.
 */
export async function verifyProjectOwnership(
  projectId: string,
  userId: string | undefined,
  projectRepository: ProjectRepository
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
