import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { hasDatabaseConfiguration } from '../db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getOrEnsureContainer } from '../services/notebook/cellExecutionService.js';
import { getCompletions } from '../services/pythonCompletions.js';

import { createCellRoutes } from './notebooks/cellRoutes.js';
import { createNotebookRoutes } from './notebooks/notebookRoutes.js';

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
router.post('/python/completions', asyncHandler(async (req: Request, res: Response) => {
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
  const container = await getOrEnsureContainer(projectId);
  const completions = await getCompletions(container, code, line, column);

  res.json({ completions });
}));

// ============================================================
// Middleware: Check database configuration
// ============================================================

function requireDatabase(_req: Request, res: Response, next: () => void) {
  if (!hasDatabaseConfiguration()) {
    res.status(503).json({
      error: 'Database configuration required',
      message: 'Notebook operations require a database connection. Please configure DATABASE_URL.'
    });
    return;
  }
  next();
}

router.use(requireDatabase);

// Mount notebook CRUD and cell routes (all require database)
router.use(createNotebookRoutes());
router.use(createCellRoutes());

export default router;
