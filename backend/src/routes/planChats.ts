import { Router, type Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { verifyProjectOwnership } from '../middleware/resourceOwnership.js';
import { validateUuidParams } from '../middleware/validateParams.js';
import {
  createPlanChat,
  getPlanChat,
  listPlanChatsByProject,
  updatePlanChatState,
  completePlanChat,
  deletePlanChat,
} from '../repositories/planChat/index.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import type { AuthenticatedRequest } from '../types/auth.js';

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

const stateSchema = z.object({
  messages: z.array(z.unknown()).max(500).optional(),
  answerHistory: z.array(z.unknown()).max(200).optional(),
  currentRound: z.number().int().min(0).optional(),
  name: z.string().trim().min(1).max(200).optional(),
}).refine(
  (data) => data.messages !== undefined || data.answerHistory !== undefined || data.currentRound !== undefined || data.name !== undefined,
  { message: 'At least one field (messages, answerHistory, currentRound, name) is required' }
);

const completeSchema = z.object({
  completedPlanId: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200),
});

const statusQuerySchema = z.object({
  status: z.enum(['in_progress', 'completed']).optional(),
});

export function createPlanChatRouter(): Router {
  const router = Router();
  const projectRepository = getProjectRepository();

  // GET /projects/:projectId/plan-chats
  router.get(
    '/projects/:projectId/plan-chats',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { projectId } = req.params;
      const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const query = statusQuerySchema.safeParse(req.query);
      const statusFilter = query.success ? query.data.status : undefined;

      const chats = await listPlanChatsByProject(projectId, req.user.user_id, statusFilter);
      res.json(chats);
    })
  );

  // POST /projects/:projectId/plan-chats
  router.post(
    '/projects/:projectId/plan-chats',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { projectId } = req.params;
      const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errors: parsed.error.flatten() });
        return;
      }

      const chat = await createPlanChat(projectId, req.user.user_id, parsed.data.name);
      res.status(201).json(chat);
    })
  );

  // GET /projects/:projectId/plan-chats/:chatId
  router.get(
    '/projects/:projectId/plan-chats/:chatId',
    validateUuidParams('chatId'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { projectId, chatId } = req.params;
      const chat = await getPlanChat(chatId, projectId, req.user.user_id);
      if (!chat) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(chat);
    })
  );

  // PUT /projects/:projectId/plan-chats/:chatId/state
  router.put(
    '/projects/:projectId/plan-chats/:chatId/state',
    validateUuidParams('chatId'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { projectId, chatId } = req.params;

      const parsed = stateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errors: parsed.error.flatten() });
        return;
      }

      const updated = await updatePlanChatState(chatId, projectId, req.user.user_id, parsed.data);
      if (!updated) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(updated);
    })
  );

  // POST /projects/:projectId/plan-chats/:chatId/complete
  router.post(
    '/projects/:projectId/plan-chats/:chatId/complete',
    validateUuidParams('chatId'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { projectId, chatId } = req.params;

      const parsed = completeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errors: parsed.error.flatten() });
        return;
      }

      const completed = await completePlanChat(chatId, projectId, req.user.user_id, parsed.data.completedPlanId, parsed.data.name);
      if (!completed) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(completed);
    })
  );

  // DELETE /projects/:projectId/plan-chats/:chatId
  router.delete(
    '/projects/:projectId/plan-chats/:chatId',
    validateUuidParams('chatId'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { projectId, chatId } = req.params;
      const deleted = await deletePlanChat(chatId, projectId, req.user.user_id);
      if (!deleted) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(204).end();
    })
  );

  return router;
}
