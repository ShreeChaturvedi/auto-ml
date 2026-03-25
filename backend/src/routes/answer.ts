import { Router } from 'express';
import { z } from 'zod';

import { hasDatabaseConfiguration } from '../db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { generateAnswer } from '../services/answerService.js';

const answerSchema = z.object({
  projectId: z.string().uuid().optional(),
  question: z.string().min(3, 'question must be at least 3 characters'),
  topK: z.number().min(1).max(10).optional()
});

export function createAnswerRouter() {
  const router = Router();

  router.post('/answer', asyncHandler(async (req, res) => {
    const parse = answerSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ errors: parse.error.flatten() });
    }

    if (!hasDatabaseConfiguration()) {
      return res.status(503).json({ error: 'Database is not configured for answering' });
    }

    const response = await generateAnswer(parse.data);
    return res.json({ answer: response });
  }));

  return router;
}
