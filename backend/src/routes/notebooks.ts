import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { hasDatabaseConfiguration } from '../db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getOrEnsureContainer } from '../services/notebook/cellExecutionService.js';
import { getCompletions } from '../services/pythonCompletions.js';
import {
  pythonIntelligence,
  type HoverResult,
  type SignatureResult,
  type DiagnosticResult,
} from '../services/pythonIntelligence.js';

import { createCellRoutes } from './notebooks/cellRoutes.js';
import { createNotebookRoutes } from './notebooks/notebookRoutes.js';
import { createSavepointRoutes } from './notebooks/savepointRoutes.js';

const router = Router();

// ============================================================
// Shared schemas and helpers
// ============================================================

const cellContextSchema = z.object({
  cellId: z.string(),
  content: z.string(),
  position: z.number(),
});

const intelligenceSchema = z.object({
  code: z.string(),
  line: z.number().int().min(1),
  column: z.number().int().min(0),
  projectId: z.string().min(1),
  cells: z.array(cellContextSchema).optional(),
  currentCellId: z.string().optional(),
});

/**
 * Build a concatenated notebook context from individual cells.
 *
 * When cells are provided the helper sorts them by position, joins their
 * contents with newlines, and computes the line offset where the current
 * cell starts so that line numbers in the request can be adjusted.
 */
function buildNotebookContext(
  cells: { cellId: string; content: string; position: number }[] | undefined,
  currentCellId: string | undefined,
  code: string,
  line: number
): { concatenatedCode: string; adjustedLine: number; currentCellOffset: number } {
  if (!cells || cells.length === 0) {
    return { concatenatedCode: code, adjustedLine: line, currentCellOffset: 0 };
  }

  const sorted = [...cells].sort((a, b) => a.position - b.position);

  let currentCellOffset = 0;
  const parts: string[] = [];

  for (const cell of sorted) {
    if (cell.cellId === currentCellId) {
      currentCellOffset = parts.reduce(
        (sum, part) => sum + part.split('\n').length,
        0
      );
      // Use the live editor content instead of the (potentially stale) store snapshot
      parts.push(code);
    } else {
      parts.push(cell.content);
    }
  }

  const concatenatedCode = parts.join('\n');
  const adjustedLine = line + currentCellOffset;

  return { concatenatedCode, adjustedLine, currentCellOffset };
}

// ============================================================
// Python Intelligence Endpoints (no database required)
// ============================================================

/**
 * POST /api/python/completions
 * Get Python code completions using Jedi
 */
router.post('/python/completions', asyncHandler(async (req: Request, res: Response) => {
  const parsed = intelligenceSchema.safeParse(req.body);

  if (!parsed.success) {
    console.error('[notebooks] Completion validation failed:', parsed.error.issues);
    res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.issues,
    });
    return;
  }

  const { code, line, column, projectId, cells, currentCellId } = parsed.data;

  let container;
  try {
    container = await getOrEnsureContainer(projectId);
  } catch (err) {
    console.error('[notebooks] Container unavailable for completions:', err);
    res.status(503).json({ error: 'Container unavailable' });
    return;
  }

  const ctx = buildNotebookContext(cells, currentCellId, code, line);
  const completions = await getCompletions(container, ctx.concatenatedCode, ctx.adjustedLine, column);

  res.json({ completions });
}));

/**
 * POST /api/python/hover
 * Get hover/type information for the symbol under the cursor
 */
router.post('/python/hover', asyncHandler(async (req: Request, res: Response) => {
  const parsed = intelligenceSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    return;
  }

  const { code, line, column, projectId, cells, currentCellId } = parsed.data;

  let container;
  try {
    container = await getOrEnsureContainer(projectId);
  } catch (err) {
    console.error('[notebooks] Container unavailable for hover:', err);
    res.status(503).json({ error: 'Container unavailable' });
    return;
  }

  const ctx = buildNotebookContext(cells, currentCellId, code, line);
  const result = await pythonIntelligence(container, {
    operation: 'hover',
    code: ctx.concatenatedCode,
    line: ctx.adjustedLine,
    column,
    currentCellOffset: ctx.currentCellOffset,
  });

  res.json({ hover: (result.hover ?? null) as HoverResult | null });
}));

/**
 * POST /api/python/signatures
 * Get call-signature help for the function at the cursor
 */
router.post('/python/signatures', asyncHandler(async (req: Request, res: Response) => {
  const parsed = intelligenceSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    return;
  }

  const { code, line, column, projectId, cells, currentCellId } = parsed.data;

  let container;
  try {
    container = await getOrEnsureContainer(projectId);
  } catch (err) {
    console.error('[notebooks] Container unavailable for signatures:', err);
    res.status(503).json({ error: 'Container unavailable' });
    return;
  }

  const ctx = buildNotebookContext(cells, currentCellId, code, line);
  const result = await pythonIntelligence(container, {
    operation: 'signatures',
    code: ctx.concatenatedCode,
    line: ctx.adjustedLine,
    column,
    currentCellOffset: ctx.currentCellOffset,
  });

  res.json({ signatures: (result.signatures ?? []) as SignatureResult[] });
}));

/**
 * POST /api/python/diagnostics
 * Get syntax diagnostics for the current cell
 */
router.post('/python/diagnostics', asyncHandler(async (req: Request, res: Response) => {
  const parsed = intelligenceSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    return;
  }

  const { code, line, column, projectId, cells, currentCellId } = parsed.data;

  let container;
  try {
    container = await getOrEnsureContainer(projectId);
  } catch (err) {
    console.error('[notebooks] Container unavailable for diagnostics:', err);
    res.status(503).json({ error: 'Container unavailable' });
    return;
  }

  const ctx = buildNotebookContext(cells, currentCellId, code, line);
  const result = await pythonIntelligence(container, {
    operation: 'diagnostics',
    code: ctx.concatenatedCode,
    line: ctx.adjustedLine,
    column,
    currentCellOffset: ctx.currentCellOffset,
  });

  res.json({ diagnostics: (result.diagnostics ?? []) as DiagnosticResult[] });
}));

// ============================================================
// Middleware: Check database configuration
// ============================================================

function requireDatabase(_req: Request, res: Response, next: () => void) {
  if (!hasDatabaseConfiguration()) {
    res.status(503).json({
      error: 'Database configuration required',
      message: 'Notebook operations require a database connection. Please configure DATABASE_URL.',
    });
    return;
  }
  next();
}

router.use(requireDatabase);

// Mount notebook CRUD and cell routes (all require database)
router.use(createNotebookRoutes());
router.use(createCellRoutes());
router.use(createSavepointRoutes());

export default router;
