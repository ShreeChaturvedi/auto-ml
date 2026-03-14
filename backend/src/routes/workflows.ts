import { Router } from 'express';
import { z } from 'zod';

import { getWorkflowRepository } from '../services/workflows/repository/index.js';
import { executeWorkflowTurn } from '../services/workflows/turnExecutor.js';

const workflowPhaseSchema = z.enum(['preprocessing', 'feature_engineering', 'training']);
const reasoningEffortSchema = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']);

const workflowTurnSchema = z.object({
  projectId: z.string().min(1),
  phase: workflowPhaseSchema,
  prompt: z.string().optional(),
  runId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  datasetId: z.string().min(1).optional(),
  notebookId: z.string().min(1).optional(),
  targetColumn: z.string().optional(),
  featureSummary: z.string().optional(),
  reasoningEffort: reasoningEffortSchema.optional(),
  model: z.string().optional()
});

const workflowListQuerySchema = z.object({
  projectId: z.string().min(1),
  phase: workflowPhaseSchema.optional()
});

const workflowParamsSchema = z.object({
  runId: z.string().min(1)
});

export function createWorkflowRouter(): Router {
  const router = Router();
  const repository = getWorkflowRepository();

  router.post('/workflows/turns/stream', async (req, res) => {
    const parsed = workflowTurnSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid workflow request', details: parsed.error.issues });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      await executeWorkflowTurn(res, parsed.data);
      res.write(`${JSON.stringify({ type: 'done' })}\n`);
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow execution failed';
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: 'workflow_error', message, retryable: true })}\n`);
        res.write(`${JSON.stringify({ type: 'done' })}\n`);
        res.end();
      }
    }

    return undefined;
  });

  router.get('/workflows', async (req, res) => {
    const parsed = workflowListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid workflow query', details: parsed.error.issues });
    }

    const runs = await repository.listRuns(parsed.data.projectId, parsed.data.phase);
    return res.json({
      projectId: parsed.data.projectId,
      phase: parsed.data.phase,
      runs
    });
  });

  router.get('/workflows/:runId', async (req, res) => {
    const parsed = workflowParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid workflow id', details: parsed.error.issues });
    }

    const run = await repository.getRun(parsed.data.runId);
    if (!run) {
      return res.status(404).json({ error: 'Workflow run not found' });
    }

    return res.json({ run });
  });

  return router;
}
