import express, { Router } from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';

import { describeRouteSuite } from '../tests/describeRouteSuite.js';

import { registerHealthRoutes } from './health.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerHealthRoutes(router);
  app.use('/api', router);
  return app;
}

describeRouteSuite('health routes', () => {
  describe('GET /api/health', () => {
    it('returns the expected health payload', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof response.body.host).toBe('string');
      expect(response.body.host.length).toBeGreaterThan(0);
      expect(response.headers['content-type']).toMatch(/application\/json/);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });
  });
});
