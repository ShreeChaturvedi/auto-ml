import type { Router } from 'express';
import { z } from 'zod';

import { appLogger } from '../logging/logger.js';
import type { ProjectRepository } from '../repositories/projectRepository.js';
import { PHASE_VALUES } from '../repositories/projectRepository.js';

const metadataSchema = z
  .object({
    unlockedPhases: z.array(z.enum(PHASE_VALUES)).optional(),
    completedPhases: z.array(z.enum(PHASE_VALUES)).optional(),
    currentPhase: z.enum(PHASE_VALUES).optional(),
    customInstructions: z.string().max(5000).optional(),
    projectPlan: z.string().max(50000).optional(),
    projectPlanName: z.string().max(200).optional()
  })
  .catchall(z.unknown())
  .optional();

// Be deliberately permissive on project creation/update so that
// frontend payload quirks never block the UI with 400s.
const projectInputSchema = z
  .object({
    name: z.string().min(1, 'name is required'),
    description: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    metadata: metadataSchema
  })
  .catchall(z.unknown());

export function registerProjectRoutes(router: Router, repository: ProjectRepository) {
  const isVitestRuntime = Boolean(process.env.VITEST);

  router.get('/projects', async (_req, res) => {
    const projects = await repository.list();
    res.json({ projects });
  });

  router.delete('/projects/reset', async (_req, res) => {
    await repository.clear();
    res.status(204).send();
  });

  router.get('/projects/:id', async (req, res) => {
    const project = await repository.getById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.json({ project });
  });

  router.post('/projects', async (req, res) => {
    const result = projectInputSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    const project = await repository.create(result.data);
    if (!isVitestRuntime) {
      appLogger.info(`[projects] created ${project.id} (${project.name})`);
    }
    return res.status(201).json({ project });
  });

  router.patch('/projects/:id', async (req, res) => {
    const result = projectInputSchema.partial().safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    const project = await repository.update(req.params.id, result.data);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isVitestRuntime) {
      appLogger.info(`[projects] updated ${project.id}`);
    }
    return res.json({ project });
  });

  router.delete('/projects/:id', async (req, res) => {
    const deleted = await repository.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isVitestRuntime) {
      appLogger.info(`[projects] deleted ${req.params.id}`);
    }
    return res.status(204).send();
  });
}
