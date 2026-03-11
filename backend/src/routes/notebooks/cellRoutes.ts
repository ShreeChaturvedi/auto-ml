import { existsSync } from 'node:fs';

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../middleware/asyncHandler.js';
import * as kernelManager from '../../services/kernelManager.js';
import { executeCell, getOrEnsureContainer } from '../../services/notebook/cellExecutionService.js';
import * as notebookService from '../../services/notebook/notebookService.js';
import type { CellType } from '../../types/notebook.js';

const createCellSchema = z.object({
  content: z.string(),
  title: z.string().optional(),
  cellType: z.enum(['code', 'markdown']).optional(),
  position: z.number().int().min(0).optional()
});

const updateCellSchema = z.object({
  content: z.string().optional(),
  title: z.string().optional()
});

const runCellSchema = z.object({
  projectId: z.string().min(1)
});

const reorderCellsSchema = z.object({
  cellIds: z.array(z.string()).min(1)
});

export function createCellRoutes(): Router {
  const router = Router();

  // ============================================================
  // Cell List Endpoints
  // ============================================================

  /**
   * GET /api/notebooks/:notebookId/cells
   * List all cells in a notebook.
   */
  router.get('/notebooks/:notebookId/cells', asyncHandler(async (req: Request, res: Response) => {
    const { notebookId } = req.params;
    const cells = await notebookService.listCells(notebookId);
    res.json(cells);
  }));

  // ============================================================
  // Cell CRUD Endpoints
  // ============================================================

  /**
   * POST /api/notebooks/:notebookId/cells
   * Create a new cell in a notebook.
   */
  router.post('/notebooks/:notebookId/cells', asyncHandler(async (req: Request, res: Response) => {
    const { notebookId } = req.params;
    const parsed = createCellSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues
      });
      return;
    }

    const { content, title, cellType, position } = parsed.data;

    // If position is specified, use insertCell
    let cell;
    if (position !== undefined) {
      cell = await notebookService.insertCell(notebookId, {
        position,
        content,
        title,
        cellType: cellType as CellType
      });
    } else {
      cell = await notebookService.writeCell(notebookId, {
        content,
        title,
        cellType: cellType as CellType
      });
    }

    res.status(201).json(cell);
  }));

  /**
   * GET /api/cells/:cellId
   * Get a single cell by ID.
   */
  router.get('/cells/:cellId', asyncHandler(async (req: Request, res: Response) => {
    const { cellId } = req.params;
    const cell = await notebookService.readCell(cellId);
    res.json(cell);
  }));

  /**
   * PATCH /api/cells/:cellId
   * Update a cell's content or title.
   */
  router.patch('/cells/:cellId', asyncHandler(async (req: Request, res: Response) => {
    const { cellId } = req.params;
    const parsed = updateCellSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues
      });
      return;
    }

    const { content, title } = parsed.data;

    // Get existing cell to get notebookId
    const existing = await notebookService.readCell(cellId);

    const cell = await notebookService.writeCell(existing.notebookId, {
      cellId,
      content: content ?? existing.content,
      title: title ?? existing.title ?? undefined
    });

    res.json(cell);
  }));

  /**
   * DELETE /api/cells/:cellId
   * Delete a cell.
   */
  router.delete('/cells/:cellId', asyncHandler(async (req: Request, res: Response) => {
    const { cellId } = req.params;
    await notebookService.deleteCell(cellId);
    res.status(204).send();
  }));

  // ============================================================
  // Cell Execution Endpoints
  // ============================================================

  /**
   * POST /api/cells/:cellId/run
   * Execute a code cell.
   */
  router.post('/cells/:cellId/run', asyncHandler(async (req: Request, res: Response) => {
    const { cellId } = req.params;
    const parsed = runCellSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues
      });
      return;
    }

    const { projectId } = parsed.data;
    const result = await executeCell(cellId, projectId);
    res.json(result);
  }));

  /**
   * POST /api/cells/:cellId/interrupt
   * Interrupt a running cell's kernel execution.
   */
  router.post('/cells/:cellId/interrupt', asyncHandler(async (req: Request, res: Response) => {
    const parsed = runCellSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }

    const { projectId } = parsed.data;
    const container = await getOrEnsureContainer(projectId);
    await kernelManager.interruptKernel(container);
    res.json({ success: true });
  }));

  // ============================================================
  // Cell Reordering Endpoints
  // ============================================================

  /**
   * POST /api/notebooks/:notebookId/reorder
   * Reorder cells in a notebook.
   */
  router.post('/notebooks/:notebookId/reorder', asyncHandler(async (req: Request, res: Response) => {
    const { notebookId } = req.params;
    const parsed = reorderCellsSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues
      });
      return;
    }

    const { cellIds } = parsed.data;
    await notebookService.reorderCells(notebookId, cellIds);
    res.json({ success: true });
  }));

  // ============================================================
  // Cell Output Endpoints
  // ============================================================

  /**
   * GET /api/cells/:cellId/outputs/:filename
   * Serve a large output file.
   */
  router.get('/cells/:cellId/outputs/:filename', asyncHandler(async (req: Request, res: Response) => {
    const { cellId, filename } = req.params;

    // Validate path segments to prevent traversal attacks.
    const isSafeSegment = (value: string) => !value.includes('..') && !value.includes('/') && !value.includes('\\');

    if (!isSafeSegment(cellId)) {
      res.status(400).json({ error: 'Invalid cellId' });
      return;
    }

    if (!isSafeSegment(filename)) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }

    const filePath = notebookService.getOutputPath(cellId, filename);

    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'Output file not found' });
      return;
    }

    // Determine content type based on extension
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      html: 'text/html',
      json: 'application/json',
      txt: 'text/plain'
    };

    const contentType = contentTypes[ext ?? ''] ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // Frontend dev server enables COEP/COOP for SharedArrayBuffer (DuckDB). Under COEP=require-corp,
    // cross-origin subresources (like images served from the API port) must opt in. This header
    // allows notebook output images to render in the browser.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // `filePath` is absolute. Do not pass `root`, otherwise Express treats the path as relative and
    // the underlying `send` module will look up the wrong filesystem location.
    res.sendFile(filePath);
  }));

  // ============================================================
  // Cell Lock Endpoints
  // ============================================================

  /**
   * GET /api/cells/:cellId/lock
   * Check if a cell is locked.
   */
  router.get('/cells/:cellId/lock', asyncHandler(async (req: Request, res: Response) => {
    const { cellId } = req.params;
    const lock = await notebookService.isLocked(cellId);
    res.json(lock);
  }));

  return router;
}
