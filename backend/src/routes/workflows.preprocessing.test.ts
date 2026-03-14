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
  executePreprocessingToolMock,
  resolvePreprocessingControllerTurnMock,
  syncPreprocessingLangGraphStateMock,
  workflowRepositoryMock
} = vi.hoisted(() => ({
  createLlmClientMock: vi.fn(),
  datasetGetByIdMock: vi.fn(),
  projectGetByIdMock: vi.fn(),
  llmCompleteMock: vi.fn(async () => ''),
  llmStreamMock: vi.fn(async () => ''),
  executePreprocessingToolMock: vi.fn(),
  resolvePreprocessingControllerTurnMock: vi.fn(),
  syncPreprocessingLangGraphStateMock: vi.fn(async (_projectId, _tool, _args, result) => result),
  workflowRepositoryMock: {
    createRun: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(async () => []),
    saveRun: vi.fn(),
    appendEvent: vi.fn(),
    upsertArtifact: vi.fn(),
    upsertApproval: vi.fn(),
    upsertHandoff: vi.fn(),
    upsertNotebookBinding: vi.fn()
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
  }))
}));

vi.mock('../services/mcp/mcpAdapter.js', () => ({
  listMcpToolsForLlm: vi.fn(async () => []),
  executeMcpTool: vi.fn(async () => ({ output: {} }))
}));

vi.mock('../services/llm/preprocessingGraph.js', () => ({
  isPreprocessingToolName: vi.fn((toolName: string) => toolName === 'propose_transformation_step'),
  executePreprocessingTool: executePreprocessingToolMock,
  syncPreprocessingLangGraphState: syncPreprocessingLangGraphStateMock
}));

vi.mock('../services/llm/preprocessing/controller.js', () => ({
  resolvePreprocessingControllerTurn: resolvePreprocessingControllerTurnMock
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

describeRouteSuite('workflow routes preprocessing turns', () => {
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
      columns: [{ name: 'subscriptions', dtype: 'integer' }],
      sample: [{ subscriptions: 1 }]
    });
    projectGetByIdMock.mockResolvedValue({
      projectId: 'project-1',
      metadata: {}
    });
    resolvePreprocessingControllerTurnMock.mockImplementation(async (args: { toolResults: Array<unknown> }) => {
      if (args.toolResults.length > 0) {
        return {
          request: {
            messages: [{ role: 'user', content: 'Summarize the planned preprocessing step.' }],
            tools: [],
            toolChoice: 'none'
          },
          summary: {
            threadId: 'workflow-thread-1',
            turnMode: 'answer_only',
            currentNode: 'summarize',
            allowedTools: [],
            allowTextResponse: true,
            requireToolCall: false,
            pendingApproval: false,
            updatedAt: '2026-03-13T00:00:00.000Z'
          }
        };
      }

      return {
        request: {
          messages: [{ role: 'user', content: 'Plan the missing-value imputation step.' }],
          tools: [{
            name: 'propose_transformation_step',
            description: 'Propose a preprocessing step.',
            parameters: { type: 'object', properties: { title: { type: 'string' } } }
          }],
          toolChoice: 'any'
        },
        summary: {
          threadId: 'workflow-thread-1',
          turnMode: 'action_required',
          currentNode: 'plan_step',
          allowedTools: ['propose_transformation_step'],
          allowTextResponse: false,
          requireToolCall: true,
          pendingApproval: false,
          updatedAt: '2026-03-13T00:00:00.000Z'
        }
      };
    });
  });

  it('streams backend-owned tool execution events for preprocessing action turns', async () => {
    llmCompleteMock.mockResolvedValueOnce(JSON.stringify({
      kind: 'tool_call',
      toolName: 'propose_transformation_step',
      toolArgs: {
        title: 'Impute missing subscriptions',
        intentType: 'impute_missing'
      }
    }));
    llmStreamMock.mockImplementationOnce(async (_request, handlers) => {
      handlers.onToken('Imputation step proposed.');
      return '';
    });
    executePreprocessingToolMock.mockResolvedValueOnce({
      output: {
        runId: 'prep-run-1',
        step: {
          stepId: 'step-1',
          status: 'pending'
        },
        status: 'pending'
      }
    });

    const response = await request(createTestApp())
      .post('/api/workflows/turns/stream')
      .send({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1',
        prompt: 'Profile missing values and propose an imputation step.'
      });

    expect(response.status).toBe(200);
    expect(executePreprocessingToolMock).toHaveBeenCalledWith(
      'project-1',
      'propose_transformation_step',
      expect.objectContaining({
        datasetId: 'dataset-1'
      })
    );

    const events = response.text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool_executed',
        call: expect.objectContaining({
          tool: 'propose_transformation_step'
        }),
        result: expect.objectContaining({
          output: expect.objectContaining({
            status: 'pending'
          })
        })
      }),
      expect.objectContaining({ type: 'done' })
    ]));
  });
});
