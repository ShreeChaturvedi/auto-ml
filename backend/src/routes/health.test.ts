import express, { Router } from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';

import { canListen } from '../tests/canListen.js';

import { registerHealthRoutes } from './health.js';

const canBind = await canListen();
const describeIf = canBind ? describe : describe.skip;

function createTestApp() {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerHealthRoutes(router);
  app.use('/api', router);
  return app;
}

describeIf('health routes', () => {
  describe('GET /api/health', () => {
    it('returns 200 status', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
    });

    it('returns status ok', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/health');
      expect(response.body.status).toBe('ok');
    });

    it('includes uptime', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/health');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('includes timestamp', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/health');
      expect(response.body.timestamp).toBeDefined();
      // Verify it's a valid ISO date string
      const date = new Date(response.body.timestamp);
      expect(date.toISOString()).toBe(response.body.timestamp);
    });

    it('includes host', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/health');
      expect(typeof response.body.host).toBe('string');
      expect(response.body.host.length).toBeGreaterThan(0);
    });

    it('returns JSON content type', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/health');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
