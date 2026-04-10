import { Router, type Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../middleware/asyncHandler.js';
import { verifyProjectOwnership } from '../../middleware/resourceOwnership.js';
import { getSavepoint } from '../../repositories/notebook/index.js';
import { getProjectRepository } from '../../repositories/projectRepository.js';
import * as notebookService from '../../services/notebook/notebookService.js';
import * as savepointService from '../../services/notebook/savepointService.js';
import type { AuthRequest } from '../../types/auth.js';

const uuidParam = z.string().uuid();

function parseBody<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid request body', details: result.error.issues });
    return null;
  }
  return result.data;
}

function parseUuidParam(value: string, name: string, res: Response): string | null {
  const result = uuidParam.safeParse(value);
  if (!result.success) {
    res.status(400).json({ error: `Invalid ${name}: must be a UUID` });
    return null;
  }
  return result.data;
}

export function createSavepointRoutes(): Router {
  const router = Router();
  const projectRepository = getProjectRepository();

  /** Verify the authenticated user owns the notebook's parent project. */
  async function verifyNotebookAccess(req: AuthRequest, res: Response, notebookId: string): Promise<boolean> {
    if (!req.user) return true;
    const notebook = await notebookService.getNotebook(notebookId);
    if (!notebook) { res.status(404).json({ error: 'Not found' }); return false; }
    const project = await verifyProjectOwnership(notebook.projectId, req.user.user_id, projectRepository);
    if (!project) { res.status(404).json({ error: 'Not found' }); return false; }
    return true;
  }

  /**
   * Ensure the savepoint belongs to the notebook in the URL. Prevents a
   * caller from using a savepointId from notebook A to operate inside a
   * URL that claims notebook B, which would otherwise bypass the notebook
   * access check.
   */
  async function verifySavepointBelongsToNotebook(
    res: Response,
    savepointId: string,
    notebookId: string
  ): Promise<boolean> {
    const savepoint = await getSavepoint(savepointId);
    if (!savepoint || savepoint.notebook_id !== notebookId) {
      res.status(404).json({ error: 'Not found' });
      return false;
    }
    return true;
  }

  router.post('/notebooks/:notebookId/savepoints', asyncHandler(async (req: AuthRequest, res: Response) => {
    const notebookId = parseUuidParam(req.params.notebookId, 'notebookId', res);
    if (!notebookId) return;
    if (!await verifyNotebookAccess(req, res, notebookId)) return;
    const body = parseBody(z.object({ turnIndex: z.number().int().min(0), turnMessageId: z.string().min(1) }), req.body, res);
    if (!body) return;
    const savepoint = await savepointService.createSavepoint(notebookId, body.turnIndex, body.turnMessageId);
    res.status(201).json(savepoint);
  }));

  router.get('/notebooks/:notebookId/savepoints', asyncHandler(async (req: AuthRequest, res: Response) => {
    const notebookId = parseUuidParam(req.params.notebookId, 'notebookId', res);
    if (!notebookId) return;
    if (!await verifyNotebookAccess(req, res, notebookId)) return;
    const savepoints = await savepointService.listSavepoints(notebookId);
    res.json({ savepoints });
  }));

  router.get('/notebooks/:notebookId/savepoints/:savepointId/diff', asyncHandler(async (req: AuthRequest, res: Response) => {
    const notebookId = parseUuidParam(req.params.notebookId, 'notebookId', res);
    if (!notebookId) return;
    if (!await verifyNotebookAccess(req, res, notebookId)) return;
    const savepointId = parseUuidParam(req.params.savepointId, 'savepointId', res);
    if (!savepointId) return;
    if (!await verifySavepointBelongsToNotebook(res, savepointId, notebookId)) return;
    const diff = await savepointService.computeDiff(savepointId);
    res.json(diff);
  }));

  router.post('/notebooks/:notebookId/savepoints/:savepointId/restore', asyncHandler(async (req: AuthRequest, res: Response) => {
    const notebookId = parseUuidParam(req.params.notebookId, 'notebookId', res);
    if (!notebookId) return;
    if (!await verifyNotebookAccess(req, res, notebookId)) return;
    const savepointId = parseUuidParam(req.params.savepointId, 'savepointId', res);
    if (!savepointId) return;
    if (!await verifySavepointBelongsToNotebook(res, savepointId, notebookId)) return;
    const result = await savepointService.restoreSavepoint(savepointId);
    res.json(result);
  }));

  router.delete('/notebooks/:notebookId/savepoints', asyncHandler(async (req: AuthRequest, res: Response) => {
    const notebookId = parseUuidParam(req.params.notebookId, 'notebookId', res);
    if (!notebookId) return;
    if (!await verifyNotebookAccess(req, res, notebookId)) return;
    const body = parseBody(z.object({ afterTurnIndex: z.number().int().min(0) }), req.body, res);
    if (!body) return;
    await savepointService.deleteSavepointsAfter(notebookId, body.afterTurnIndex);
    res.status(204).end();
  }));

  return router;
}
