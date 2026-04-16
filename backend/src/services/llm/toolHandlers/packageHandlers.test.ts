import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getOrEnsureContainerMock: vi.fn(),
  installPackageMock: vi.fn(),
  uninstallPackageMock: vi.fn(),
  listPackagesMock: vi.fn(),
  refreshKernelPythonPathMock: vi.fn(),
  verifyKernelImportsMock: vi.fn(),
  restartKernelMock: vi.fn(),
  shutdownKernelMock: vi.fn(),
  execDockerMock: vi.fn(),
}));

vi.mock('../../notebook/cellExecutionService.js', () => ({
  getOrEnsureContainer: hoisted.getOrEnsureContainerMock,
}));

vi.mock('../../packageManager.js', () => ({
  installPackage: hoisted.installPackageMock,
  uninstallPackage: hoisted.uninstallPackageMock,
  listPackages: hoisted.listPackagesMock,
}));

vi.mock('../../kernelManager.js', () => ({
  refreshKernelPythonPath: hoisted.refreshKernelPythonPathMock,
  verifyKernelImports: hoisted.verifyKernelImportsMock,
  restartKernel: hoisted.restartKernelMock,
  shutdownKernel: hoisted.shutdownKernelMock,
}));

vi.mock('../../dockerUtils.js', () => ({
  execDocker: hoisted.execDockerMock,
}));

import { handleInstallPackage } from './packageHandlers.js';

const {
  getOrEnsureContainerMock,
  installPackageMock,
  refreshKernelPythonPathMock,
  verifyKernelImportsMock,
  restartKernelMock,
  shutdownKernelMock,
  execDockerMock,
} = hoisted;

describe('packageHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrEnsureContainerMock.mockResolvedValue({ id: 'container-1', containerId: 'docker-1' });
    refreshKernelPythonPathMock.mockResolvedValue(undefined);
    verifyKernelImportsMock.mockResolvedValue(undefined);
    restartKernelMock.mockResolvedValue(undefined);
    shutdownKernelMock.mockResolvedValue(undefined);
    execDockerMock.mockResolvedValue({ stdout: 'ok', stderr: '' });
  });

  it('refreshes kernel import caches after a successful install', async () => {
    installPackageMock.mockResolvedValue({ success: true, message: 'ok' });

    const result = await handleInstallPackage('project-1', { packageName: 'pytorch-tabular' });

    expect(result).toEqual({ success: true, message: 'ok' });
    expect(refreshKernelPythonPathMock).toHaveBeenCalledWith({ id: 'container-1', containerId: 'docker-1' });
    expect(verifyKernelImportsMock).toHaveBeenCalledWith(
      { id: 'container-1', containerId: 'docker-1' },
      ['pytorch_tabular'],
      20_000,
    );
  });

  it('does not attempt kernel refresh after a failed install', async () => {
    installPackageMock.mockResolvedValue({ success: false, message: 'failed' });

    const result = await handleInstallPackage('project-1', { packageName: 'pytorch-tabular' });

    expect(result).toEqual({ success: false, message: 'failed' });
    expect(refreshKernelPythonPathMock).not.toHaveBeenCalled();
  });

  it('restarts the kernel when imports still fail after a refresh and then verifies again', async () => {
    installPackageMock.mockResolvedValue({ success: true, message: 'ok' });
    verifyKernelImportsMock
      .mockRejectedValueOnce(new Error('import failed'))
      .mockResolvedValueOnce(undefined);

    const result = await handleInstallPackage('project-1', { packageName: 'torch' });

    expect(result).toEqual({ success: true, message: 'ok' });
    expect(restartKernelMock).toHaveBeenCalledWith({ id: 'container-1', containerId: 'docker-1' });
    expect(verifyKernelImportsMock).toHaveBeenCalledTimes(2);
  });

  it('returns a failure when the live kernel still cannot import the installed package after restart', async () => {
    installPackageMock.mockResolvedValue({ success: true, message: 'ok' });
    verifyKernelImportsMock.mockRejectedValue(new Error('import failed'));
    execDockerMock.mockRejectedValue(new Error('container import failed'));

    const result = await handleInstallPackage('project-1', { packageName: 'torch' });

    expect(result).toEqual({
      success: false,
      message: 'Installed package could not be imported in the live kernel (torch).',
    });
    expect(restartKernelMock).toHaveBeenCalledWith({ id: 'container-1', containerId: 'docker-1' });
  });

  it('falls back to direct container import verification when live kernel verification keeps failing', async () => {
    installPackageMock.mockResolvedValue({ success: true, message: 'ok' });
    verifyKernelImportsMock.mockRejectedValue(new Error('kernel import failed'));
    execDockerMock.mockResolvedValue({ stdout: 'ok', stderr: '' });

    const result = await handleInstallPackage('project-1', { packageName: 'torch' });

    expect(result).toEqual({ success: true, message: 'ok' });
    expect(restartKernelMock).toHaveBeenCalledWith({ id: 'container-1', containerId: 'docker-1' });
    expect(execDockerMock).toHaveBeenCalled();
    expect(shutdownKernelMock).toHaveBeenCalledWith({ id: 'container-1', containerId: 'docker-1' });
  });
});
