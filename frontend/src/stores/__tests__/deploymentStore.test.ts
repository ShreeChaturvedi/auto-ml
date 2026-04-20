import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDeployment, listDeployments } from '../../lib/api/deployments';
import type { DeploymentRecord } from '../../types/deployment';
import { useDeploymentStore } from '../deploymentStore';

vi.mock('../../lib/api/deployments', () => ({
  createDeployment: vi.fn(),
  listDeployments: vi.fn(),
  stopDeployment: vi.fn(),
  startDeployment: vi.fn(),
  deleteDeployment: vi.fn(),
}));

const createDeploymentMock = vi.mocked(createDeployment);
const listDeploymentsMock = vi.mocked(listDeployments);

function resetDeploymentStore() {
  useDeploymentStore.setState({
    deployments: [],
    selectedDeploymentId: null,
    isLoading: false,
    error: null,
  });
}

function buildDeployment(overrides: Partial<DeploymentRecord> = {}): DeploymentRecord {
  return {
    deploymentId: 'dep-1',
    modelId: 'model-1',
    projectId: 'project-1',
    name: 'Endpoint 1',
    status: 'healthy',
    config: {},
    createdAt: '2026-04-16T16:55:22.118Z',
    updatedAt: '2026-04-16T16:55:24.610Z',
    ...overrides,
  };
}

describe('deploymentStore.deploy', () => {
  beforeEach(() => {
    resetDeploymentStore();
    vi.clearAllMocks();
  });

  it('hydrates persisted failed deployments after createDeployment rejects', async () => {
    const failedDeployment = buildDeployment({
      deploymentId: 'dep-failed',
      status: 'failed',
      errorMessage: 'Inference container exited with code 3',
    });

    createDeploymentMock.mockRejectedValueOnce(new Error('Inference container exited with code 3'));
    listDeploymentsMock.mockResolvedValueOnce({ deployments: [failedDeployment] });

    await expect(
      useDeploymentStore.getState().deploy('model-1', 'project-1', 'Endpoint 1'),
    ).rejects.toThrow('Inference container exited with code 3');

    expect(listDeploymentsMock).toHaveBeenCalledWith('project-1');
    expect(useDeploymentStore.getState().deployments).toEqual([failedDeployment]);
    expect(useDeploymentStore.getState().selectedDeploymentId).toBe('dep-failed');
    expect(useDeploymentStore.getState().error).toBe('Inference container exited with code 3');
    expect(useDeploymentStore.getState().isLoading).toBe(false);
  });

  it('stores successful deployments without an extra refresh', async () => {
    const healthyDeployment = buildDeployment();

    createDeploymentMock.mockResolvedValueOnce({ deployment: healthyDeployment });

    await expect(
      useDeploymentStore.getState().deploy('model-1', 'project-1', 'Endpoint 1'),
    ).resolves.toEqual(healthyDeployment);

    expect(listDeploymentsMock).not.toHaveBeenCalled();
    expect(useDeploymentStore.getState().deployments).toEqual([healthyDeployment]);
    expect(useDeploymentStore.getState().selectedDeploymentId).toBe('dep-1');
    expect(useDeploymentStore.getState().error).toBeNull();
    expect(useDeploymentStore.getState().isLoading).toBe(false);
  });
});
