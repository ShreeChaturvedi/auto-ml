import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canListen } from '../tests/canListen.js';

import { createLlmRouter } from './llm.js';

vi.mock('../services/llm/llmClient.js', () => {
  const client = {
    complete: vi.fn(async () => ''),
    stream: vi.fn(async () => '')
  };
  return {
    createLlmClient: vi.fn(() => client),
    createThinkingLlmClient: vi.fn(() => client)
  };
});

const canBind = await canListen();
const describeIf = canBind ? describe : describe.skip;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createLlmRouter());
  return app;
}

describeIf('llm routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/llm/onboarding/stream', () => {
    it('returns 400 when projectId is missing', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/onboarding/stream')
        .send({
          userIntent: 'Predict churn',
          round: 0
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('returns 400 when round is out of bounds', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/onboarding/stream')
        .send({
          projectId: 'project-1',
          round: 6
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });
  });
});
