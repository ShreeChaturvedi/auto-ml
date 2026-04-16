import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockCopyFile: vi.fn(),
  mockMkdir: vi.fn(),
  mockReadFile: vi.fn(),
  mockGetOrCreateContainer: vi.fn(),
  mockSyncWorkspaceDatasets: vi.fn(),
  mockExecute: vi.fn(),
  mockHasKernel: vi.fn(),
  mockRestartKernel: vi.fn(),
  mockConnectKernel: vi.fn(),
  mockListPackages: vi.fn(),
  mockInstallPackage: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  copyFile: hoisted.mockCopyFile,
  mkdir: hoisted.mockMkdir,
  readFile: hoisted.mockReadFile,
}));

vi.mock('../services/containerManager.js', () => ({
  getOrCreateContainer: hoisted.mockGetOrCreateContainer,
}));

vi.mock('../services/executionWorkspace.js', () => ({
  syncWorkspaceDatasets: hoisted.mockSyncWorkspaceDatasets,
}));

vi.mock('../services/kernelManager.js', () => ({
  execute: hoisted.mockExecute,
  hasKernel: hoisted.mockHasKernel,
  restartKernel: hoisted.mockRestartKernel,
  connectKernel: hoisted.mockConnectKernel,
}));

vi.mock('../services/packageManager.js', () => ({
  installPackage: hoisted.mockInstallPackage,
  listPackages: hoisted.mockListPackages,
}));

import { orchestrateContainerExecution } from './containerOrchestrator.js';

const {
  mockCopyFile,
  mockMkdir,
  mockGetOrCreateContainer,
  mockSyncWorkspaceDatasets,
  mockExecute,
  mockHasKernel,
  mockRestartKernel,
  mockConnectKernel,
  mockListPackages,
  mockInstallPackage,
} = hoisted;

describe('orchestrateContainerExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockGetOrCreateContainer.mockResolvedValue({
      workspacePath: '/tmp/workspace/project-1/model-runtime',
      containerId: 'docker-123',
      id: 'container-1',
    });
    mockSyncWorkspaceDatasets.mockResolvedValue(undefined);
    mockHasKernel.mockReturnValue(true);
    mockRestartKernel.mockResolvedValue(undefined);
    mockConnectKernel.mockResolvedValue(undefined);
    mockListPackages.mockResolvedValue([]);
    mockInstallPackage.mockResolvedValue({ success: true, message: 'ok' });
  });

  it('retries once after a transient websocket-close execution failure', async () => {
    mockExecute
      .mockResolvedValueOnce({
        status: 'error',
        error: 'WebSocket closed unexpectedly during execution',
        stderr: '',
        executionMs: 1000,
      })
      .mockResolvedValueOnce({
        status: 'success',
        stderr: '',
        executionMs: 500,
      });

    const result = await orchestrateContainerExecution({
      projectId: 'project-1',
      pythonVersion: '3.11',
      scriptBuilder: () => 'print("hello")',
      filesToCopy: [
        {
          permanentPath: '/tmp/model.joblib',
          workspacePath: 'models/model-1/model.joblib',
        },
      ],
      timeoutMs: 30_000,
      containerOutputDir: '/workspace/eval/model-1',
    });

    expect(mockRestartKernel).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(result.executionResult.status).toBe('success');
  });

  it('does not retry non-transient execution failures', async () => {
    mockExecute.mockResolvedValue({
      status: 'error',
      error: 'Execution failed',
      stderr: 'ValueError: bad input',
      executionMs: 1000,
    });

    const result = await orchestrateContainerExecution({
      projectId: 'project-1',
      pythonVersion: '3.11',
      scriptBuilder: () => 'print("hello")',
      filesToCopy: [],
      timeoutMs: 30_000,
      containerOutputDir: '/workspace/eval/model-1',
    });

    expect(mockRestartKernel).not.toHaveBeenCalled();
    expect(mockConnectKernel).not.toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(result.executionResult.error).toBe('Execution failed');
  });
});
