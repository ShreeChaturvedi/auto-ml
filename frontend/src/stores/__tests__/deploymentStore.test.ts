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

  it('inserts an optimistic failed deployment when createDeployment rejects', async () => {
    createDeploymentMock.mockRejectedValueOnce(new Error('Inference container exited with code 3'));
    // Create never persisted — server list empty; optimistic row must remain.
    listDeploymentsMock.mockResolvedValueOnce({ deployments: [] });

    await expect(
      useDeploymentStore.getState().deploy('model-1', 'project-1', 'Endpoint 1'),
    ).rejects.toThrow('Inference container exited with code 3');

    // Allow the fire-and-forget reconcile microtask to finish.
    await Promise.resolve();
    await Promise.resolve();

    expect(listDeploymentsMock).toHaveBeenCalledWith('project-1');

    const state = useDeploymentStore.getState();
    expect(state.deployments).toHaveLength(1);
    const failed = state.deployments[0];
    expect(failed.status).toBe('failed');
    expect(failed.modelId).toBe('model-1');
    expect(failed.projectId).toBe('project-1');
    expect(failed.name).toBe('Endpoint 1');
    expect(failed.errorMessage).toBe('Inference container exited with code 3');
    expect(failed.deploymentId).toMatch(/^failed-\d+$/);
    expect(state.selectedDeploymentId).toBe(failed.deploymentId);
    expect(state.error).toBe('Inference container exited with code 3');
    expect(state.isLoading).toBe(false);
  });

  it('prefers a server-persisted failed deployment over the optimistic row', async () => {
    const persisted = buildDeployment({
      deploymentId: 'dep-failed',
      status: 'failed',
      errorMessage: 'Inference container exited with code 3',
    });

    createDeploymentMock.mockRejectedValueOnce(new Error('Inference container exited with code 3'));
    listDeploymentsMock.mockResolvedValueOnce({ deployments: [persisted] });

    await expect(
      useDeploymentStore.getState().deploy('model-1', 'project-1', 'Endpoint 1'),
    ).rejects.toThrow('Inference container exited with code 3');

    await Promise.resolve();
    await Promise.resolve();

    const state = useDeploymentStore.getState();
    expect(state.deployments).toEqual([persisted]);
    expect(state.selectedDeploymentId).toBe('dep-failed');
    expect(state.error).toBe('Inference container exited with code 3');
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
