import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../middleware/asyncHandler.js';
import * as savepointService from '../../services/notebook/savepointService.js';

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

  router.post('/notebooks/:notebookId/savepoints', asyncHandler(async (req: Request, res: Response) => {
    const notebookId = parseUuidParam(req.params.notebookId, 'notebookId', res);
    if (!notebookId) return;
    const body = parseBody(z.object({ turnIndex: z.number().int().min(0), turnMessageId: z.string().min(1) }), req.body, res);
    if (!body) return;
    const savepoint = await savepointService.createSavepoint(notebookId, body.turnIndex, body.turnMessageId);
    res.status(201).json(savepoint);
  }));

  router.get('/notebooks/:notebookId/savepoints', asyncHandler(async (req: Request, res: Response) => {
    const notebookId = parseUuidParam(req.params.notebookId, 'notebookId', res);
    if (!notebookId) return;
    const savepoints = await savepointService.listSavepoints(notebookId);
    res.json({ savepoints });
  }));

  router.get('/notebooks/:notebookId/savepoints/:savepointId/diff', asyncHandler(async (req: Request, res: Response) => {
    const savepointId = parseUuidParam(req.params.savepointId, 'savepointId', res);
    if (!savepointId) return;
    const diff = await savepointService.computeDiff(savepointId);
    res.json(diff);
  }));

  router.post('/notebooks/:notebookId/savepoints/:savepointId/restore', asyncHandler(async (req: Request, res: Response) => {
    const savepointId = parseUuidParam(req.params.savepointId, 'savepointId', res);
    if (!savepointId) return;
    const result = await savepointService.restoreSavepoint(savepointId);
    res.json(result);
  }));

  router.delete('/notebooks/:notebookId/savepoints', asyncHandler(async (req: Request, res: Response) => {
    const notebookId = parseUuidParam(req.params.notebookId, 'notebookId', res);
    if (!notebookId) return;
    const body = parseBody(z.object({ afterTurnIndex: z.number().int().min(0) }), req.body, res);
    if (!body) return;
    await savepointService.deleteSavepointsAfter(notebookId, body.afterTurnIndex);
    res.status(204).end();
  }));

  return router;
}
