import { Router, type Response } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireProjectOwnership, verifyProjectOwnership } from '../middleware/resourceOwnership.js';
import { validateUuidParams } from '../middleware/validateParams.js';
import { validateRequest } from '../middleware/validateRequest.js';
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
import { sendError, sendNotFound, sendForbidden } from '../utils/errors.js';

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

router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const models = await listModels(projectId);
  models.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ models });
}));

const seedSchema = z.object({
  projectId: z.string().min(1),
});

router.post('/seed', validateRequest(seedSchema, 'query'), requireProjectOwnership(projectRepository, 'query'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (env.nodeEnv === 'production') {
    sendForbidden(res, 'Seed endpoint is disabled in production');
    return;
  }
  const { projectId } = req.query as Record<string, string>;
  const models = await seedModels(projectId);
  res.json({ models });
}));

const seedOneSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  taskType: z.enum(['classification', 'regression', 'clustering']),
  algorithm: z.string().min(1),
});

router.post('/seed-one', validateRequest(seedOneSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (env.nodeEnv === 'production') {
    sendForbidden(res, 'Seed endpoint is disabled in production');
    return;
  }
  const data = req.body as z.infer<typeof seedOneSchema>;
  // Project ownership is verified by requireProjectAccess middleware
  const model = await seedOneModel(data.projectId, data);
  res.json({ model });
}));

router.delete('/:id', validateUuidParams('id'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const model = await getModelById(req.params.id);
  if (!model) {
    sendNotFound(res, 'Model');
    return;
  }
  if (req.user && model.projectId) {
    const project = await verifyProjectOwnership(model.projectId, req.user.user_id, projectRepository);
    if (!project) {
      sendNotFound(res, 'Model');
      return;
    }
  }
  await deleteModel(req.params.id);
  res.status(204).end();
}));

router.get('/:id', validateUuidParams('id'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const model = await getModelById(req.params.id);
  if (!model) {
    sendNotFound(res, 'Model');
    return;
  }
  if (req.user && model.projectId) {
    const project = await verifyProjectOwnership(model.projectId, req.user.user_id, projectRepository);
    if (!project) {
      sendNotFound(res, 'Model');
      return;
    }
  }
  res.json({ model });
}));

router.get('/:id/artifact', validateUuidParams('id'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const model = await getModelById(req.params.id);
  if (!model?.artifact?.path) {
    sendNotFound(res, 'Model artifact');
    return;
  }
  if (req.user && model.projectId) {
    const project = await verifyProjectOwnership(model.projectId, req.user.user_id, projectRepository);
    if (!project) {
      sendNotFound(res, 'Model artifact');
      return;
    }
  }
  res.download(model.artifact.path, model.artifact.filename);
}));

router.post('/train', validateRequest(trainSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const data = req.body as z.infer<typeof trainSchema>;
    const result = await trainModel(data);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const lower = message.toLowerCase();
    const status = lower.includes('not found')
      ? 404
      : lower.includes('unsupported') || lower.includes('required')
        ? 400
        : 500;

    sendError(res, status, 'Failed to train model', { message });
  }
}));

export default router;
