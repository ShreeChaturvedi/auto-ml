import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCellMock,
  lockCellMock,
  updateCellMock,
  markCellExecutedMock,
  unlockCellMock,
  getDatasetPathsMock,
  copyDatasetsToWorkspaceMock,
  resolveDatasetSyncModeMock,
  getOrCreateContainerMock,
  kernelExecuteMock,
  interruptKernelMock,
  restartKernelMock
} = vi.hoisted(() => ({
  getCellMock: vi.fn(),
  lockCellMock: vi.fn(),
  updateCellMock: vi.fn(),
  markCellExecutedMock: vi.fn(),
  unlockCellMock: vi.fn(),
  getDatasetPathsMock: vi.fn(),
  copyDatasetsToWorkspaceMock: vi.fn(),
  resolveDatasetSyncModeMock: vi.fn(),
  getOrCreateContainerMock: vi.fn(),
  kernelExecuteMock: vi.fn(),
  interruptKernelMock: vi.fn(),
  restartKernelMock: vi.fn()
}));

vi.mock('../../repositories/notebookRepository.js', () => ({
  getCell: getCellMock,
  lockCell: lockCellMock,
  updateCell: updateCellMock,
  markCellExecuted: markCellExecutedMock,
  unlockCell: unlockCellMock,
  getCellLock: vi.fn()
}));

vi.mock('./datasetWorkspace.js', () => ({
  getDatasetPaths: getDatasetPathsMock,
  copyDatasetsToWorkspace: copyDatasetsToWorkspaceMock
}));

vi.mock('./datasetSyncMode.js', () => ({
  resolveDatasetSyncMode: resolveDatasetSyncModeMock
}));

vi.mock('../containerManager.js', () => ({
  getOrCreateContainer: getOrCreateContainerMock
}));

vi.mock('../kernelManager.js', () => ({
  execute: kernelExecuteMock,
  interruptKernel: interruptKernelMock,
  restartKernel: restartKernelMock
}));

import { executeCell } from './cellExecutionService.js';

describe('executeCell', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getCellMock.mockResolvedValue({
      cellId: 'cell-1',
      notebookId: 'notebook-1',
      cellType: 'code',
      content: 'import pandas as pd',
      metadata: {}
    });
    lockCellMock.mockResolvedValue(true);
    updateCellMock.mockResolvedValue(undefined);
    unlockCellMock.mockResolvedValue(undefined);
    getDatasetPathsMock.mockResolvedValue([]);
    copyDatasetsToWorkspaceMock.mockResolvedValue(undefined);
    resolveDatasetSyncModeMock.mockReturnValue('continue');
    getOrCreateContainerMock.mockResolvedValue({
      id: 'container-1'
    });
    markCellExecutedMock.mockImplementation(async (_cellId: string, update: Record<string, unknown>) => ({
      cellId: 'cell-1',
      notebookId: 'notebook-1',
      executionOrder: update.executionOrder ?? null,
      ...update
    }));
  });

  it('interrupts the kernel after a timeout so the next execution is not poisoned', async () => {
    kernelExecuteMock.mockResolvedValue({
      status: 'timeout',
      stdout: '',
      stderr: '',
      outputs: [],
      executionMs: 30000,
      error: 'Execution timed out after 30000ms',
      executionOrder: null
    });
    interruptKernelMock.mockResolvedValue(undefined);

    const result = await executeCell('cell-1', 'project-1');

    expect(result.status).toBe('timeout');
    expect(interruptKernelMock).toHaveBeenCalledWith({ id: 'container-1' });
    expect(restartKernelMock).not.toHaveBeenCalled();
    expect(markCellExecutedMock).toHaveBeenCalledWith(
      'cell-1',
      expect.objectContaining({
        executionStatus: 'error',
        output: []
      })
    );
  });

  it('restarts the kernel if interrupt fails after a timeout', async () => {
    kernelExecuteMock.mockResolvedValue({
      status: 'timeout',
      stdout: '',
      stderr: '',
      outputs: [],
      executionMs: 30000,
      error: 'Execution timed out after 30000ms',
      executionOrder: null
    });
    interruptKernelMock.mockRejectedValue(new Error('interrupt failed'));
    restartKernelMock.mockResolvedValue(undefined);

    await executeCell('cell-1', 'project-1');

    expect(interruptKernelMock).toHaveBeenCalledWith({ id: 'container-1' });
    expect(restartKernelMock).toHaveBeenCalledWith({ id: 'container-1' });
  });
});
