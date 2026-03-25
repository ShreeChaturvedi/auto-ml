import express from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';

import { describeRouteSuite } from '../tests/describeRouteSuite.js';

import { createWorkflowRouter } from './workflows.js';

const {
  createLlmClientMock,
  datasetGetByIdMock,
  projectGetByIdMock,
  llmCompleteMock,
  llmStreamMock,
  workflowRepositoryMock
} = vi.hoisted(() => ({
  createLlmClientMock: vi.fn(),
  datasetGetByIdMock: vi.fn(),
  projectGetByIdMock: vi.fn(),
  llmCompleteMock: vi.fn(async () => ''),
  llmStreamMock: vi.fn(async () => ''),
  workflowRepositoryMock: {
    createRun: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(async () => []),
    saveRun: vi.fn(),
    appendEvent: vi.fn(),
    upsertArtifact: vi.fn(),
    upsertApproval: vi.fn(),
    upsertHandoff: vi.fn(),
    upsertNotebookBinding: vi.fn(),
    findActiveRun: vi.fn(async () => undefined)
  }
}));

vi.mock('../services/llm/llmClient.js', () => ({
  createLlmClient: createLlmClientMock
}));

vi.mock('../repositories/datasetRepository.js', () => ({
  createDatasetRepository: vi.fn(() => ({
    getById: datasetGetByIdMock
  }))
}));

vi.mock('../repositories/projectRepository.js', () => ({
  createProjectRepository: vi.fn(() => ({
    getById: projectGetByIdMock
  })),
  getProjectRepository: vi.fn(() => ({
    getById: projectGetByIdMock
  }))
}));

vi.mock('../services/mcp/mcpAdapter.js', () => ({
  listMcpToolsForLlm: vi.fn(async () => []),
  executeMcpTool: vi.fn(async () => ({ output: {} }))
}));

vi.mock('../services/workflows/repository/index.js', () => ({
  getWorkflowRepository: vi.fn(() => workflowRepositoryMock)
}));

vi.mock('../services/rag/searchService.js', () => ({
  searchDocuments: vi.fn(async () => [])
}));

vi.mock('../services/documentSearchService.js', () => ({
  searchDocuments: vi.fn(async () => [])
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createWorkflowRouter());
  return app;
}

describeRouteSuite('workflow routes answer turns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLlmClientMock.mockReturnValue({
      complete: llmCompleteMock,
      stream: llmStreamMock
    });
    workflowRepositoryMock.getRun.mockResolvedValue(undefined);
    workflowRepositoryMock.createRun.mockImplementation(async (input: Record<string, unknown>) => ({
      ...input,
      revision: 1,
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z'
    }));
    workflowRepositoryMock.saveRun.mockImplementation(async (run: Record<string, unknown>) => ({
      ...run,
      revision: Number(run.revision ?? 1) + 1,
      updatedAt: '2026-03-13T00:00:01.000Z'
    }));
    workflowRepositoryMock.appendEvent.mockResolvedValue({
      eventId: 'event-1',
      runId: 'run-1',
      sequence: 1,
      eventType: 'test',
      payload: {},
      createdAt: '2026-03-13T00:00:00.000Z'
    });
    workflowRepositoryMock.upsertArtifact.mockImplementation(async (artifact: Record<string, unknown>) => ({
      ...artifact,
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z'
    }));
    datasetGetByIdMock.mockResolvedValue({
      datasetId: 'dataset-1',
      projectId: 'project-1',
      filename: 'subscriptions.csv',
      nRows: 100,
      nCols: 4,
      columns: [
        { name: 'subscriptions', dtype: 'integer' },
        { name: 'status', dtype: 'string' }
      ],
      sample: [{ subscriptions: 1, status: 'active' }]
    });
    projectGetByIdMock.mockResolvedValue({
      projectId: 'project-1',
      metadata: {}
    });
  });

  it('streams shared workflow events for a feature-engineering answer turn', async () => {
    (llmStreamMock as ReturnType<typeof vi.fn>).mockImplementationOnce(async (_req: unknown, h: Record<string, (...a: unknown[]) => void>) => {
      h.onToken('Start with null-drift, leakage, and schema validation before engineering new features.');
    });

    const response = await request(createTestApp())
      .post('/api/workflows/turns/stream')
      .send({
        projectId: 'project-1',
        phase: 'feature_engineering',
        datasetId: 'dataset-1',
        prompt: 'What should I validate before creating features?'
      });

    expect(response.status).toBe(200);
    expect(llmStreamMock).toHaveBeenCalled();

    const events = response.text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'workflow_state' }),
      expect.objectContaining({
        type: 'artifact_updated',
        artifact: expect.objectContaining({
          kind: 'summary',
          payload: expect.objectContaining({
            message: expect.stringContaining('null-drift')
          })
        })
      }),
      expect.objectContaining({ type: 'done' })
    ]));
  });
});
