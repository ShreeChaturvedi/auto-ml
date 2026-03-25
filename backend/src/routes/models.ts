import { Router, type Response } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { verifyProjectOwnership } from '../middleware/resourceOwnership.js';
import { validateUuidParams } from '../middleware/validateParams.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import { seedModels, seedOneModel } from '../services/modelSeedService.js';
import {
  deleteModel,
  getModelById,
  getModelTemplates,
  listModels,
  trainModel
} from '../services/modelTraining.js';
import type { AuthRequest } from '../types/auth.js';

const router = Router();
const projectRepository = getProjectRepository();

const trainSchema = z.object({
  projectId: z.string().min(1),
  datasetId: z.string().min(1),
  templateId: z.string().min(1),
  targetColumn: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  testSize: z.number().min(0.05).max(0.5).optional(),
  name: z.string().optional()
});


router.get('/templates', (_req: AuthRequest, res: Response) => {
  res.json({ templates: getModelTemplates() });
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const models = await listModels(projectId);
  models.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ models });
});

const seedSchema = z.object({
  projectId: z.string().min(1),
});

router.post('/seed', async (req: AuthRequest, res: Response) => {
  if (env.nodeEnv === 'production') {
    res.status(403).json({ error: 'Seed endpoint is disabled in production' });
    return;
  }
  const parsed = seedSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'projectId query parameter is required' });
    return;
  }
  const { projectId } = parsed.data;
  if (req.user) {
    const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
  }
  const models = await seedModels(projectId);
  res.json({ models });
});

const seedOneSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  taskType: z.enum(['classification', 'regression', 'clustering']),
  algorithm: z.string().min(1),
});

router.post('/seed-one', async (req: AuthRequest, res: Response) => {
  if (env.nodeEnv === 'production') {
    res.status(403).json({ error: 'Seed endpoint is disabled in production' });
    return;
  }
  const parsed = seedOneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }
  if (req.user) {
    const project = await verifyProjectOwnership(parsed.data.projectId, req.user.user_id, projectRepository);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
  }
  const model = await seedOneModel(parsed.data.projectId, parsed.data);
  res.json({ model });
});

router.delete('/:id', validateUuidParams('id'), async (req: AuthRequest, res: Response) => {
  const model = await getModelById(req.params.id);
  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }
  if (req.user && model.projectId) {
    const project = await verifyProjectOwnership(model.projectId, req.user.user_id, projectRepository);
    if (!project) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }
  }
  await deleteModel(req.params.id);
  res.status(204).end();
});

router.get('/:id', validateUuidParams('id'), async (req: AuthRequest, res: Response) => {
  const model = await getModelById(req.params.id);
  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }
  if (req.user && model.projectId) {
    const project = await verifyProjectOwnership(model.projectId, req.user.user_id, projectRepository);
    if (!project) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }
  }
  res.json({ model });
});

router.get('/:id/artifact', validateUuidParams('id'), async (req: AuthRequest, res: Response) => {
  const model = await getModelById(req.params.id);
  if (!model?.artifact?.path) {
    res.status(404).json({ error: 'Model artifact not found' });
    return;
  }
  if (req.user && model.projectId) {
    const project = await verifyProjectOwnership(model.projectId, req.user.user_id, projectRepository);
    if (!project) {
      res.status(404).json({ error: 'Model artifact not found' });
      return;
    }
  }
  res.download(model.artifact.path, model.artifact.filename);
});

router.post('/train', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = trainSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.issues
      });
      return;
    }

    const result = await trainModel(parsed.data);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const lower = message.toLowerCase();
    const status = lower.includes('not found')
      ? 404
      : lower.includes('unsupported') || lower.includes('required')
        ? 400
        : 500;

    res.status(status).json({
      error: 'Failed to train model',
      message
    });
  }
});

export default router;
