import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { existsSync } from 'node:fs';

import * as notebookService from '../services/notebook/notebookService.js';
import { executeCell, getOrEnsureContainer } from '../services/notebook/cellExecutionService.js';
import { getCompletions } from '../services/containerManager.js';
import { hasDatabaseConfiguration } from '../db.js';
import type { CellType } from '../types/notebook.js';

const router = Router();

// ============================================================
// Python Completions Endpoint (no database required)
// ============================================================

const completionSchema = z.object({
  code: z.string(),
  line: z.number().int().min(1),
  column: z.number().int().min(0),
  projectId: z.string().min(1)
});

/**
 * POST /api/python/completions
 * Get Python code completions using Jedi (no database required)
 */
router.post('/python/completions', async (req: Request, res: Response) => {
  try {
    const parsed = completionSchema.safeParse(req.body);

    if (!parsed.success) {
      console.error('[notebooks] Completion validation failed:', parsed.error.issues);
      res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues
      });
      return;
    }

    const { code, line, column, projectId } = parsed.data;

    // Get container for this project
    const container = await getOrEnsureContainer(projectId);

    // Get completions
    const completions = await getCompletions(container, code, line, column);

    res.json({ completions });
  } catch (error) {
    console.error('[notebooks] Error getting completions:', error);
    res.status(500).json({
      error: 'Failed to get completions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================
// Middleware: Check database configuration
// ============================================================

function requireDatabase(req: Request, res: Response, next: () => void) {
  if (!hasDatabaseConfiguration()) {
    res.status(503).json({
      error: 'Database configuration required',
      message: 'Notebook operations require a database connection. Please configure DATABASE_URL.'
    });
    return;
  }
  next();
}

// Apply to remaining routes
router.use(requireDatabase);

// ============================================================
// Notebook Endpoints
// ============================================================

/**
 * GET /api/projects/:projectId/notebook
 * Get or create the notebook for a project.
 */
router.get('/projects/:projectId/notebook', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const notebook = await notebookService.ensureNotebook(projectId);
    res.json(notebook);
  } catch (error) {
    console.error('[notebooks] Error getting notebook:', error);
    res.status(500).json({
      error: 'Failed to get notebook',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================
// Cell List Endpoints
// ============================================================

/**
 * GET /api/notebooks/:notebookId/cells
 * List all cells in a notebook.
 */
router.get('/notebooks/:notebookId/cells', async (req: Request, res: Response) => {
  try {
    const { notebookId } = req.params;
    const cells = await notebookService.listCells(notebookId);
    res.json(cells);
  } catch (error) {
    console.error('[notebooks] Error listing cells:', error);
    res.status(500).json({
      error: 'Failed to list cells',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================
// Cell CRUD Endpoints
// ============================================================

const createCellSchema = z.object({
  content: z.string(),
  title: z.string().optional(),
  cellType: z.enum(['code', 'markdown']).optional(),
  position: z.number().int().min(0).optional()
});

/**
 * POST /api/notebooks/:notebookId/cells
 * Create a new cell in a notebook.
 */
router.post('/notebooks/:notebookId/cells', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('[notebooks] Error creating cell:', error);
    res.status(500).json({
      error: 'Failed to create cell',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/cells/:cellId
 * Get a single cell by ID.
 */
router.get('/cells/:cellId', async (req: Request, res: Response) => {
  try {
    const { cellId } = req.params;
    const cell = await notebookService.readCell(cellId);
    res.json(cell);
  } catch (error) {
    console.error('[notebooks] Error reading cell:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : 500;
    res.status(status).json({
      error: 'Failed to read cell',
      message
    });
  }
});

const updateCellSchema = z.object({
  content: z.string().optional(),
  title: z.string().optional()
});

/**
 * PATCH /api/cells/:cellId
 * Update a cell's content or title.
 */
router.patch('/cells/:cellId', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('[notebooks] Error updating cell:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : message.includes('locked') ? 423 : 500;
    res.status(status).json({
      error: 'Failed to update cell',
      message
    });
  }
});

/**
 * DELETE /api/cells/:cellId
 * Delete a cell.
 */
router.delete('/cells/:cellId', async (req: Request, res: Response) => {
  try {
    const { cellId } = req.params;
    await notebookService.deleteCell(cellId);
    res.status(204).send();
  } catch (error) {
    console.error('[notebooks] Error deleting cell:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : message.includes('locked') ? 423 : 500;
    res.status(status).json({
      error: 'Failed to delete cell',
      message
    });
  }
});

// ============================================================
// Cell Execution Endpoints
// ============================================================

const runCellSchema = z.object({
  projectId: z.string().min(1)
});

/**
 * POST /api/cells/:cellId/run
 * Execute a code cell.
 */
router.post('/cells/:cellId/run', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('[notebooks] Error running cell:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : message.includes('locked') ? 423 : 500;
    res.status(status).json({
      error: 'Failed to run cell',
      message
    });
  }
});

// ============================================================
// Cell Reordering Endpoints
// ============================================================

const reorderCellsSchema = z.object({
  cellIds: z.array(z.string()).min(1)
});

/**
 * POST /api/notebooks/:notebookId/reorder
 * Reorder cells in a notebook.
 */
router.post('/notebooks/:notebookId/reorder', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('[notebooks] Error reordering cells:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to reorder cells',
      message
    });
  }
});

// ============================================================
// Cell Output Endpoints
// ============================================================

/**
 * GET /api/cells/:cellId/outputs/:filename
 * Serve a large output file.
 */
router.get('/cells/:cellId/outputs/:filename', async (req: Request, res: Response) => {
  try {
    const { cellId, filename } = req.params;

    // Validate filename to prevent path traversal
    if (filename.includes('..') || filename.includes('/')) {
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
    res.sendFile(filePath, { root: process.cwd() });
  } catch (error) {
    console.error('[notebooks] Error serving output:', error);
    res.status(500).json({
      error: 'Failed to serve output',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================
// Cell Lock Endpoints
// ============================================================

/**
 * GET /api/cells/:cellId/lock
 * Check if a cell is locked.
 */
router.get('/cells/:cellId/lock', async (req: Request, res: Response) => {
  try {
    const { cellId } = req.params;
    const lock = await notebookService.isLocked(cellId);
    res.json(lock);
  } catch (error) {
    console.error('[notebooks] Error checking lock:', error);
    res.status(500).json({
      error: 'Failed to check lock',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
