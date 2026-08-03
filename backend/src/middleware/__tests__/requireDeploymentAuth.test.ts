import { describe, expect, it, vi, beforeEach } from 'vitest';

const getById = vi.fn();
const verifyApiKey = vi.fn();

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

import { requireDeploymentAuth } from '../requireDeploymentAuth.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireDeploymentAuth enumeration resistance', () => {
  beforeEach(() => {
    getById.mockReset();
    verifyApiKey.mockReset();
  });

  it('returns 404 Not found for missing deployment', async () => {
    getById.mockResolvedValue(null);
    const req: any = { params: { deploymentId: 'missing' }, headers: {} };
    const res = mockRes();
    const next = vi.fn();
    await requireDeploymentAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns the same 404 Not found for a bad API key', async () => {
    getById.mockResolvedValue({ deploymentId: 'dep-1', projectId: 'p1' });
    verifyApiKey.mockResolvedValue(null);
    const req: any = {
      params: { deploymentId: 'dep-1' },
      headers: { 'x-api-key': 'bad-key' },
    };
    const res = mockRes();
    const next = vi.fn();
    await requireDeploymentAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
    expect(next).not.toHaveBeenCalled();
  });
});
