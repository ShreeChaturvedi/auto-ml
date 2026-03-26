import { describe, expect, it } from 'vitest';

import { getHealthReport } from './healthService.js';

const baseDeps = {
  getTimestamp: () => '2026-03-21T00:00:00.000Z',
  getUptime: () => 100,
  getHost: () => 'health-host',
  getMemoryUsage: () => ({
    rss: 100,
    heapTotal: 200,
    heapUsed: 150,
    external: 10,
    arrayBuffers: 5
  }),
  hasDatabaseConfiguration: () => true,
  queryDatabase: async () => undefined,
  dockerEnabled: true,
  pingDocker: async () => undefined,
  runtimePythonVersion: '3.11' as const,
  checkRuntimeImage: async () => true
};

describe('getHealthReport', () => {
  it('returns ok when all checks pass', async () => {
    const report = await getHealthReport(baseDeps);

    expect(report.status).toBe('ok');
    expect(report.checks.database).toMatchObject({
      status: 'ok',
      configured: true
    });
    expect(report.checks.docker).toMatchObject({
      status: 'ok',
      reachable: true
    });
    expect(report.checks.runtimeImage).toMatchObject({
      status: 'ok',
      available: true
    });
    expect(report.checks.memory.heapUsedBytes).toBe(150);
  });

  it('returns degraded when only Docker-related checks fail', async () => {
    const report = await getHealthReport({
      ...baseDeps,
      pingDocker: async () => {
        throw new Error('docker unavailable');
      }
    });

    expect(report.status).toBe('degraded');
    expect(report.checks.database.status).toBe('ok');
    expect(report.checks.docker).toMatchObject({
      status: 'degraded',
      reachable: false
    });
    expect(report.checks.runtimeImage.status).toBe('degraded');
  });

  it('returns error when the database is not configured', async () => {
    const report = await getHealthReport({
      ...baseDeps,
      hasDatabaseConfiguration: () => false
    });

    expect(report.status).toBe('error');
    expect(report.checks.database).toMatchObject({
      status: 'error',
      configured: false
    });
  });
});
