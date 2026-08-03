import type { NextFunction, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getById, verifyApiKey } = vi.hoisted(() => ({
  getById: vi.fn(),
  verifyApiKey: vi.fn(),
}));

vi.mock('../../repositories/deploymentRepository.js', () => ({
  createDeploymentRepository: () => ({ getById }),
  verifyApiKey: (...args: unknown[]) => verifyApiKey(...args),
}));

vi.mock('../../repositories/projectRepository.js', () => ({
  getProjectRepository: () => ({}),
}));

vi.mock('../../services/authService.js', () => ({
  authService: { verifyAccessToken: vi.fn() },
}));

vi.mock('../resourceOwnership.js', () => ({
  verifyProjectOwnership: vi.fn(),
}));

import type { PredictRequest } from '../requireDeploymentAuth.js';
import { requireDeploymentAuth } from '../requireDeploymentAuth.js';

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

function mockReq(params: Record<string, string>, headers: Record<string, string> = {}): PredictRequest {
  return { params, headers } as unknown as PredictRequest;
}

describe('requireDeploymentAuth enumeration resistance', () => {
  beforeEach(() => {
    getById.mockReset();
    verifyApiKey.mockReset();
  });

  it('returns 404 Not found for missing deployment', async () => {
    getById.mockResolvedValue(null);
    const req = mockReq({ deploymentId: 'missing' });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await requireDeploymentAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns the same 404 Not found for a bad API key', async () => {
    getById.mockResolvedValue({ deploymentId: 'dep-1', projectId: 'p1' });
    verifyApiKey.mockResolvedValue(null);
    const req = mockReq({ deploymentId: 'dep-1' }, { 'x-api-key': 'bad-key' });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    await requireDeploymentAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
    expect(next).not.toHaveBeenCalled();
  });
});
