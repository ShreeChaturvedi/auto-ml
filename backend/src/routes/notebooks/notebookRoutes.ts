import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../middleware/asyncHandler.js';
import * as kernelManager from '../../services/kernelManager.js';
import { getOrEnsureContainer } from '../../services/notebook/cellExecutionService.js';
import * as notebookService from '../../services/notebook/notebookService.js';

const createNotebookSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const updateNotebookSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export function createNotebookRoutes(): Router {
  const router = Router();

  // ============================================================
  // Notebook Endpoints
  // ============================================================

  /**
   * GET /api/projects/:projectId/notebooks
   * List notebooks for a project.
   */
  router.get('/projects/:projectId/notebooks', asyncHandler(async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const notebooks = await notebookService.listProjectNotebooks(projectId);
    res.json(notebooks);
  }));

  /**
   * POST /api/projects/:projectId/notebooks
   * Create a notebook for a project.
   */
  router.post('/projects/:projectId/notebooks', asyncHandler(async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const parsed = createNotebookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues
      });
      return;
    }

    const notebook = await notebookService.createProjectNotebook(projectId, parsed.data.name, parsed.data.metadata);
    res.status(201).json(notebook);
  }));

  /**
   * PATCH /api/notebooks/:notebookId
   * Update a notebook (name and/or metadata).
   */
  router.patch('/notebooks/:notebookId', asyncHandler(async (req: Request, res: Response) => {
    const { notebookId } = req.params;
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
  router.delete('/projects/:projectId/notebooks/:notebookId', asyncHandler(async (req: Request, res: Response) => {
    const { projectId, notebookId } = req.params;
    const result = await notebookService.deleteProjectNotebook(projectId, notebookId);
    res.json(result);
  }));

  /**
   * GET /api/projects/:projectId/notebook
   * Get or create the notebook for a project.
   */
  router.get('/projects/:projectId/notebook', asyncHandler(async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const notebook = await notebookService.ensureNotebook(projectId);
    res.json(notebook);
  }));

  // ============================================================
  // Kernel Lifecycle Endpoints
  // ============================================================

  /**
   * POST /api/projects/:projectId/kernel/restart
   * Restart the Jupyter kernel for a project's container.
   */
  router.post('/projects/:projectId/kernel/restart', asyncHandler(async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const container = await getOrEnsureContainer(projectId);
    await kernelManager.restartKernel(container);
    res.json({ success: true });
  }));

  return router;
}
