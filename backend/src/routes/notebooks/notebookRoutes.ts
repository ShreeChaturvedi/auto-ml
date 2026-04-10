import { Router, type Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../middleware/asyncHandler.js';
import { verifyProjectOwnership } from '../../middleware/resourceOwnership.js';
import { getProjectRepository } from '../../repositories/projectRepository.js';
import * as kernelManager from '../../services/kernelManager.js';
import { getOrEnsureContainer } from '../../services/notebook/cellExecutionService.js';
import * as notebookService from '../../services/notebook/notebookService.js';
import type { AuthRequest } from '../../types/auth.js';
import { NotebookKindSchema } from '../../types/notebook.js';

const createNotebookSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  kind: NotebookKindSchema.optional()
});

const updateNotebookSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const listNotebooksQuerySchema = z.object({
  kind: NotebookKindSchema.optional()
});

export function createNotebookRoutes(): Router {
  const router = Router();
  const projectRepository = getProjectRepository();

  // ============================================================
  // Notebook Endpoints
  // ============================================================

  /**
   * GET /api/projects/:projectId/notebooks
   * List notebooks for a project.
   */
  router.get('/projects/:projectId/notebooks', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    if (req.user) {
      const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
    }

    const parsedQuery = listNotebooksQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: parsedQuery.error.issues });
      return;
    }

    const notebooks = await notebookService.listProjectNotebooks(projectId, {
      kind: parsedQuery.data.kind
    });
    res.json(notebooks);
  }));

  /**
   * POST /api/projects/:projectId/notebooks
   * Create a notebook for a project.
   */
  router.post('/projects/:projectId/notebooks', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    if (req.user) {
      const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
    }

    const parsed = createNotebookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues
      });
      return;
    }

    const notebook = await notebookService.createProjectNotebook(projectId, {
      name: parsed.data.name,
      metadata: parsed.data.metadata,
      kind: parsed.data.kind
    });
    res.status(201).json(notebook);
  }));

  /**
   * PATCH /api/notebooks/:notebookId
   * Update a notebook (name and/or metadata).
   */
  router.patch('/notebooks/:notebookId', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { notebookId } = req.params;

    if (req.user) {
      const existingNotebook = await notebookService.getNotebook(notebookId);
      if (!existingNotebook) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const project = await verifyProjectOwnership(existingNotebook.projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    }

    const parsed = updateNotebookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues
      });
      return;
    }

    const notebook = await notebookService.updateProjectNotebook(notebookId, parsed.data);
    res.json(notebook);
  }));

  /**
   * DELETE /api/projects/:projectId/notebooks/:notebookId
   * Delete a notebook from a project.
   */
  router.delete('/projects/:projectId/notebooks/:notebookId', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId, notebookId } = req.params;

    if (req.user) {
      const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
    }

    const result = await notebookService.deleteProjectNotebook(projectId, notebookId);
    res.json(result);
  }));

  // ============================================================
  // Kernel Lifecycle Endpoints
  // ============================================================

  /**
   * POST /api/projects/:projectId/kernel/restart
   * Restart the Jupyter kernel for a project's container.
   */
  router.post('/projects/:projectId/kernel/restart', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    if (req.user) {
      const project = await verifyProjectOwnership(projectId, req.user.user_id, projectRepository);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
    }

    const container = await getOrEnsureContainer(projectId);
    await kernelManager.restartKernel(container);
    res.json({ success: true });
  }));

  return router;
}
