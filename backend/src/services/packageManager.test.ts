import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  execDockerMock: vi.fn(),
  runPipInstallMock: vi.fn(),
  normalizePackageInputMock: vi.fn(),
}));

vi.mock('./dockerUtils.js', () => ({
  execDocker: hoisted.execDockerMock,
}));

vi.mock('./packageManager/pipHelpers.js', async () => {
  const actual = await vi.importActual<typeof import('./packageManager/pipHelpers.js')>('./packageManager/pipHelpers.js');
  return {
    ...actual,
    normalizePackageInput: hoisted.normalizePackageInputMock,
    runPipInstall: hoisted.runPipInstallMock,
  };
});

import { installPackage } from './packageManager.js';

const { execDockerMock, normalizePackageInputMock, runPipInstallMock } = hoisted;

describe('packageManager.installPackage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizePackageInputMock.mockReturnValue({
      requirements: ['pytorch-tabular'],
      aliasNotice: '',
    });
  });

  it('treats a successful pip run as installed only after the target directory is populated', async () => {
    runPipInstallMock.mockResolvedValue({
      success: true,
      message: 'Successfully installed pytorch-tabular',
      details: 'ok',
    });
    execDockerMock.mockResolvedValue({ stdout: 'Install target ready\n', stderr: '' });

    const result = await installPackage(
      { containerId: 'docker-1', id: 'container-1', projectId: 'project-1', pythonVersion: '3.11', workspacePath: '/tmp/ws', kernelGatewayPort: 0, createdAt: new Date(), lastUsedAt: new Date() },
      'pytorch-tabular',
    );

    expect(result).toEqual({
      success: true,
      message: 'Successfully installed pytorch-tabular',
    });
    expect(runPipInstallMock).toHaveBeenCalledWith(expect.arrayContaining([
      '--extra-index-url',
      'https://download.pytorch.org/whl/cpu',
      'pytorch-tabular',
    ]));
    expect(execDockerMock).toHaveBeenCalledWith(
      expect.arrayContaining(['exec', 'docker-1', 'python', '-c', expect.stringContaining('pip install completed without populating /workspace/.python')]),
      { timeout: 60_000 },
    );
  });

  it('fails the install when pip reports success but the target directory is still empty', async () => {
    runPipInstallMock.mockResolvedValue({
      success: true,
      message: 'Successfully installed pytorch-tabular',
      details: 'ok',
    });
    execDockerMock.mockRejectedValue(new Error('pip install completed without populating /workspace/.python'));

    const result = await installPackage(
      { containerId: 'docker-1', id: 'container-1', projectId: 'project-1', pythonVersion: '3.11', workspacePath: '/tmp/ws', kernelGatewayPort: 0, createdAt: new Date(), lastUsedAt: new Date() },
      'pytorch-tabular',
    );

    expect(result).toEqual({
      success: false,
      message: 'pip install completed without populating /workspace/.python',
    });
    expect(runPipInstallMock).toHaveBeenCalledWith(expect.arrayContaining([
      '--extra-index-url',
      'https://download.pytorch.org/whl/cpu',
      'pytorch-tabular',
    ]));
  });
});
