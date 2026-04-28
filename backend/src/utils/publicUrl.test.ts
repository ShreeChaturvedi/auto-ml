import { describe, expect, it } from 'vitest';

import type { DeploymentRecord } from '../types/deployment.js';

import { buildPublicDeploymentUrl, resolveRequestOrigin, toClientDeployment } from './publicUrl.js';

function makeReq(headers: Record<string, string | undefined>, protocol = 'http') {
  return {
    protocol,
    get(name: string) {
      return headers[name.toLowerCase()] ?? headers[name] ?? undefined;
    }
  };
}

function makeDeployment(overrides: Partial<DeploymentRecord> = {}): DeploymentRecord {
  return {
    deploymentId: 'deployment-1',
    modelId: 'model-1',
    projectId: 'project-1',
    name: 'deployment',
    status: 'healthy',
    endpointUrl: 'http://127.0.0.1:55001',
    config: {},
    createdAt: new Date('2026-04-22T12:00:00Z').toISOString(),
    updatedAt: new Date('2026-04-22T12:00:00Z').toISOString(),
    ...overrides,
  };
}

describe('resolveRequestOrigin', () => {
  it('prefers forwarded proto and host when present', () => {
    const req = makeReq({
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'beta.example.com',
      host: '127.0.0.1:4000',
    });

    expect(resolveRequestOrigin(req as never)).toBe('https://beta.example.com');
  });

  it('falls back to request protocol and host', () => {
    const req = makeReq({ host: 'localhost:4000' });

    expect(resolveRequestOrigin(req as never)).toBe('http://localhost:4000');
  });
});

describe('buildPublicDeploymentUrl', () => {
  it('builds the client-facing deployment proxy URL', () => {
    const req = makeReq({
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'beta.duckdns.org',
    });

    expect(buildPublicDeploymentUrl(req as never, 'deployment-1')).toBe(
      'https://beta.duckdns.org/api/deployments/deployment-1'
    );
  });
});

describe('toClientDeployment', () => {
  it('rewrites loopback endpoint URLs to the request origin', () => {
    const req = makeReq({
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'beta.duckdns.org',
    });

    expect(toClientDeployment(req as never, makeDeployment()).endpointUrl).toBe(
      'https://beta.duckdns.org/api/deployments/deployment-1'
    );
  });

  it('preserves the stored endpoint URL when no host can be resolved', () => {
    const req = makeReq({});

    expect(toClientDeployment(req as never, makeDeployment()).endpointUrl).toBe('http://127.0.0.1:55001');
  });
});
