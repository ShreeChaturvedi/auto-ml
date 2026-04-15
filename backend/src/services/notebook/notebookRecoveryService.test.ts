import { beforeEach, describe, expect, it, vi } from 'vitest';

const workflowRepo = {
  listRuns: vi.fn(),
  getRun: vi.fn()
};

const notebookServiceMocks = {
  getNotebook: vi.fn(),
  listCells: vi.fn(),
  broadcast: vi.fn()
};

const notebookRepoMocks = {
  createCell: vi.fn(),
  updateCell: vi.fn(),
  getCellsByNotebook: vi.fn()
};

vi.mock('../workflows/repository/index.js', () => ({
  getWorkflowRepository: () => workflowRepo
}));

vi.mock('./notebookService.js', () => notebookServiceMocks);

vi.mock('../../repositories/notebookRepository.js', () => notebookRepoMocks);

describe('notebookRecoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recovers an empty training notebook from write_cell and run_cell workflow events', async () => {
    notebookServiceMocks.getNotebook
      .mockResolvedValueOnce({ notebookId: 'target-nb', projectId: 'project-1' })
      .mockResolvedValueOnce(null);
    notebookServiceMocks.listCells.mockResolvedValue([]);

    workflowRepo.listRuns.mockResolvedValue([
      {
        runId: 'run-1',
        phase: 'training',
        status: 'completed',
        activeNotebookId: 'missing-source-nb',
        updatedAt: '2026-04-11T08:00:00.000Z'
      }
    ]);

    workflowRepo.getRun.mockResolvedValue({
      run: {
        runId: 'run-1',
        phase: 'training',
        status: 'completed',
        activeNotebookId: 'missing-source-nb'
      },
      events: [
        {
          eventType: 'tool_executed',
          payload: {
            call: { tool: 'write_cell' },
            result: {
              output: {
                notebookId: 'missing-source-nb',
                cellId: 'old-cell-1',
                title: 'Imports',
                content: 'print("hello")',
                cellType: 'code',
                metadata: { phase: 'training' },
                position: 0
              }
            }
          }
        },
        {
          eventType: 'tool_executed',
          payload: {
            call: {
              tool: 'run_cell',
              args: { cellId: 'old-cell-1' }
            },
            result: {
              output: {
                status: 'success',
                executionMs: 42,
                executionOrder: 3,
                outputs: [
                  { type: 'text', content: 'hello' }
                ]
              }
            }
          }
        }
      ],
      artifacts: [],
      approvals: [],
      handoffs: [],
      notebookBindings: []
    });

    notebookRepoMocks.createCell.mockResolvedValue({
      cellId: 'new-cell-1',
      notebookId: 'target-nb'
    });
    notebookRepoMocks.updateCell.mockResolvedValue({});
    notebookRepoMocks.getCellsByNotebook.mockResolvedValue([
      { cellId: 'new-cell-1', notebookId: 'target-nb' }
    ]);

    const { recoverNotebookFromWorkflowHistory } = await import('./notebookRecoveryService.js');
    const result = await recoverNotebookFromWorkflowHistory('project-1', 'target-nb', 'training');

    expect(result.status).toBe('recovered');
    expect(result.candidate).toMatchObject({
      runId: 'run-1',
      sourceNotebookId: 'missing-source-nb',
      cellCount: 1
    });
    expect(notebookRepoMocks.createCell).toHaveBeenCalledWith('target-nb', expect.objectContaining({
      title: 'Imports',
      content: 'print("hello")',
      cellType: 'code',
      position: 0
    }));
    expect(notebookRepoMocks.updateCell).toHaveBeenCalledWith('new-cell-1', expect.objectContaining({
      executionStatus: 'success',
      executionCount: 1,
      executionOrder: 3,
      executionDurationMs: 42,
      output: [{ type: 'text', content: 'hello', data: undefined, mimeType: undefined }]
    }));
    expect(notebookServiceMocks.broadcast).toHaveBeenCalledWith('target-nb', 'notebook:cells_reset', expect.any(Object));
  });
});
