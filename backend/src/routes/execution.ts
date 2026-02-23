/**
 * Execution Routes
 * 
 * REST API endpoints for Python code execution.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
    executeCode,
    createSession,
    getSession,
    destroySession,
    installPackage,
    installPackageWithProgress,
    listPackages,
    getAvailableRuntimes,
    getHealth
} from '../services/executionService.js';
import { searchPackages } from '../services/packageIndex.js';

const router = Router();

// Request validation schemas
const executeSchema = z.object({
    projectId: z.string().min(1),
    code: z.string().min(1),
    sessionId: z.string().optional(),
    pythonVersion: z.enum(['3.10', '3.11']).optional(),
    timeout: z.number().min(1000).max(300000).optional()
});

const packageSchema = z.object({
    sessionId: z.string().min(1),
    packageName: z.string().min(1)
});

const sessionSchema = z.object({
    projectId: z.string().min(1),
    pythonVersion: z.enum(['3.10', '3.11']).optional()
});

/**
 * POST /api/execute
 * Execute Python code
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const parsed = executeSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: 'Invalid request',
                details: parsed.error.issues
            });
            return;
        }

        const result = await executeCode(parsed.data);

        res.json({
            success: true,
            result
        });
    } catch (error) {
        console.error('[execution] Execute error:', error);
        res.status(500).json({
            error: 'Execution failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * POST /api/execute/session
 * Create a new execution session
 */
router.post('/session', async (req: Request, res: Response) => {
    try {
        const parsed = sessionSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: 'Invalid request',
                details: parsed.error.issues
            });
            return;
        }

        const session = await createSession(
            parsed.data.projectId,
            parsed.data.pythonVersion,
            { requireDocker: true }
        );

        res.json({
            success: true,
            session: {
                id: session.id,
                projectId: session.projectId,
                pythonVersion: session.pythonVersion,
                installedPackages: session.installedPackages,
                createdAt: session.createdAt,
                lastUsedAt: session.lastUsedAt
            }
        });
    } catch (error) {
        console.error('[execution] Create session error:', error);
        res.status(500).json({
            error: 'Failed to create session',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/execute/session/:id
 * Get session details
 */
router.get('/session/:id', (req: Request, res: Response) => {
    const session = getSession(req.params.id);

    if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    res.json({
        session: {
            id: session.id,
            projectId: session.projectId,
            pythonVersion: session.pythonVersion,
            installedPackages: session.installedPackages,
            createdAt: session.createdAt,
            lastUsedAt: session.lastUsedAt
        }
    });
});

/**
 * DELETE /api/execute/session/:id
 * Destroy a session
 */
router.delete('/session/:id', async (req: Request, res: Response) => {
    try {
        await destroySession(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('[execution] Destroy session error:', error);
        res.status(500).json({
            error: 'Failed to destroy session',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * POST /api/execute/packages
 * Install a package
 */
router.post('/packages', async (req: Request, res: Response) => {
    try {
        const parsed = packageSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: 'Invalid request',
                details: parsed.error.issues
            });
            return;
        }

        const result = await installPackage(
            parsed.data.sessionId,
            parsed.data.packageName
        );

        res.json(result);
    } catch (error) {
        console.error('[execution] Install package error:', error);
        res.status(500).json({
            error: 'Failed to install package',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/execute/packages/suggest
 * Search for package suggestions
 */
router.get('/packages/suggest', async (req: Request, res: Response) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw ?? 8, 1), 20) : 8;

        const suggestions = await searchPackages(q, limit);
        res.json({ suggestions });
    } catch (error) {
        console.error('[execution] Package search error:', error);
        res.status(500).json({
            error: 'Failed to search packages',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * POST /api/execute/packages/stream
 * Install a package with streaming progress
 */
router.post('/packages/stream', async (req: Request, res: Response) => {
    try {
        const parsed = packageSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: 'Invalid request',
                details: parsed.error.issues
            });
            return;
        }

        res.status(200);
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const sendEvent = (payload: Record<string, unknown>) => {
            res.write(`${JSON.stringify(payload)}\n`);
        };

        const result = await installPackageWithProgress(
            parsed.data.sessionId,
            parsed.data.packageName,
            (event) => sendEvent(event)
        );

        sendEvent({
            type: 'done',
            success: result.success,
            message: result.message
        });
        res.end();
    } catch (error) {
        console.error('[execution] Stream install error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to install package',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
            return;
        }
        res.write(`${JSON.stringify({
            type: 'done',
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        })}\n`);
        res.end();
    }
});

/**
 * GET /api/execute/packages/:sessionId
 * List installed packages
 */
router.get('/packages/:sessionId', async (req: Request, res: Response) => {
    try {
        const packages = await listPackages(req.params.sessionId);
        res.json({ packages });
    } catch (error) {
        console.error('[execution] List packages error:', error);
        res.status(500).json({
            error: 'Failed to list packages',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/execute/runtimes
 * List available Python runtimes
 */
router.get('/runtimes', async (_req: Request, res: Response) => {
    try {
        const runtimes = await getAvailableRuntimes();
        res.json({ runtimes });
    } catch (error) {
        console.error('[execution] List runtimes error:', error);
        res.status(500).json({
            error: 'Failed to list runtimes',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/execute/health
 * Check execution service health
 */
router.get('/health', async (_req: Request, res: Response) => {
    try {
        const health = await getHealth();
        res.json(health);
    } catch (error) {
        console.error('[execution] Health check error:', error);
        res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
