import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { describeRouteSuite } from '../tests/describeRouteSuite.js';

import { createLlmRouter } from './llm/index.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createLlmRouter());
  return app;
}

describeRouteSuite('llm routes', () => {
  // Onboarding tests removed — endpoint migrated to /api/workflows/turns/stream (Phase 0)

  describe('GET /api/llm/models', () => {
    it('returns a GPT-5-only catalog with featured latest-per-kind entries', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/llm/models');

      expect(response.status).toBe(200);
      expect(response.body.defaultModel).toBe('gpt-5.4');
      expect(response.body.defaultReasoningEffort).toBe('high');
      expect(response.body.featuredModels.map((entry: { id: string }) => entry.id)).toEqual([
        'gpt-5.4',
        'gpt-5.3-codex',
        'gpt-5.4-mini',
        'gpt-5.4-nano'
      ]);
      expect(response.body.models.map((entry: { id: string }) => entry.id)).toEqual([
        'gpt-5.4',
        'gpt-5.3-codex',
        'gpt-5.4-mini',
        'gpt-5.4-nano'
      ]);
      expect(response.body.models.every((entry: { id: string }) => entry.id.startsWith('gpt-5'))).toBe(true);
      expect(
        response.body.models.every((entry: { reasoningEfforts: string[] }) => !entry.reasoningEfforts.includes('none'))
      ).toBe(true);
    });
  });

  // Preprocessing runs tests removed — endpoints migrated to /api/preprocessing/runs (Phase 6)
  // Preprocessing stream tests removed — endpoint replaced by workflow engine (Phase 6)
  // Training stream tests removed — endpoint migrated to /api/workflows/turns/stream (Phase 4)
});
