import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../middleware/asyncHandler.js';
import * as kernelManager from '../../services/kernelManager.js';
import { getOrEnsureContainer } from '../../services/notebook/cellExecutionService.js';
import * as notebookService from '../../services/notebook/notebookService.js';

const createNotebookSchema = z.object({
  name: z.string().trim().min(1).max(120).optional()
});

const renameNotebookSchema = z.object({
  name: z.string().trim().min(1).max(120)
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

    const notebook = await notebookService.createProjectNotebook(projectId, parsed.data.name);
    res.status(201).json(notebook);
  }));

  /**
   * PATCH /api/notebooks/:notebookId
   * Rename a notebook.
   */
  router.patch('/notebooks/:notebookId', asyncHandler(async (req: Request, res: Response) => {
    const { notebookId } = req.params;
    const parsed = renameNotebookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues
      });
      return;
    }

    const notebook = await notebookService.renameProjectNotebook(notebookId, parsed.data.name);
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
