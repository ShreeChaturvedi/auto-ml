import express, { Router } from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';

import type { HealthReport } from '../services/healthService.js';
import { describeRouteSuite } from '../tests/describeRouteSuite.js';

import { registerHealthRoutes } from './health.js';

function createTestApp(healthReportFactory?: () => Promise<HealthReport>) {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerHealthRoutes(router, healthReportFactory);
  app.use('/api', router);
  return app;
}

describeRouteSuite('health routes', () => {
  describe('GET /api/health', () => {
    it('returns the expected health payload when all checks pass', async () => {
      const app = createTestApp(async () => ({
        status: 'ok',
        uptime: 42,
        timestamp: '2026-03-21T00:00:00.000Z',
        host: 'health-host',
        checks: {
          database: {
            status: 'ok',
            critical: true,
            configured: true,
            latencyMs: 12
          },
          docker: {
            status: 'ok',
            critical: false,
            enabled: true,
            reachable: true,
            latencyMs: 18
          },
          runtimeImage: {
            status: 'ok',
            critical: false,
            enabled: true,
            image: 'automl-python-runtime:3.11',
            available: true
          },
          memory: {
            status: 'ok',
            critical: false,
            rssBytes: 1,
            heapTotalBytes: 2,
            heapUsedBytes: 3,
            externalBytes: 4,
            arrayBuffersBytes: 5
          }
        }
      }));
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBe(42);
      expect(typeof response.body.host).toBe('string');
      expect(response.body.host.length).toBeGreaterThan(0);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body.checks).toMatchObject({
        database: {
          status: 'ok',
          critical: true
        },
        docker: {
          status: 'ok',
          reachable: true
        },
        runtimeImage: {
          status: 'ok',
          available: true
        },
        memory: {
          status: 'ok',
          heapUsedBytes: 3
        }
      });

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });

    it('returns 200 with degraded status when only non-critical checks fail', async () => {
      const app = createTestApp(async () => ({
        status: 'degraded',
        uptime: 10,
        timestamp: '2026-03-21T00:00:00.000Z',
        host: 'health-host',
        checks: {
          database: {
            status: 'ok',
            critical: true,
            configured: true,
            latencyMs: 4
          },
          docker: {
            status: 'degraded',
            critical: false,
            enabled: true,
            reachable: false,
            latencyMs: 100,
            message: 'Docker daemon check timed out.'
          },
          runtimeImage: {
            status: 'degraded',
            critical: false,
            enabled: true,
            image: 'automl-python-runtime:3.11',
            available: false,
            message: 'Runtime image could not be verified because Docker is unavailable.'
          },
          memory: {
            status: 'ok',
            critical: false,
            rssBytes: 1,
            heapTotalBytes: 2,
            heapUsedBytes: 3,
            externalBytes: 4,
            arrayBuffersBytes: 5
          }
        }
      }));

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
      expect(response.body.checks.docker.message).toContain('timed out');
    });

    it('returns 503 when a critical check fails', async () => {
      const app = createTestApp(async () => ({
        status: 'error',
        uptime: 10,
        timestamp: '2026-03-21T00:00:00.000Z',
        host: 'health-host',
        checks: {
          database: {
            status: 'error',
            critical: true,
            configured: true,
            latencyMs: 15,
            message: 'connect ECONNREFUSED'
          },
          docker: {
            status: 'ok',
            critical: false,
            enabled: true,
            reachable: true,
            latencyMs: 22
          },
          runtimeImage: {
            status: 'ok',
            critical: false,
            enabled: true,
            image: 'automl-python-runtime:3.11',
            available: true
          },
          memory: {
            status: 'ok',
            critical: false,
            rssBytes: 1,
            heapTotalBytes: 2,
            heapUsedBytes: 3,
            externalBytes: 4,
            arrayBuffersBytes: 5
          }
        }
      }));

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('error');
      expect(response.body.checks.database.message).toContain('ECONNREFUSED');
    });
  });
});
