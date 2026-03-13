import express from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';

import { describeRouteSuite } from '../tests/describeRouteSuite.js';

import { createLlmRouter } from './llm/index.js';

const {
  createLlmClientMock,
  datasetGetByIdMock,
  datasetListMock,
  projectGetByIdMock,
  llmCompleteMock,
  llmStreamMock
} = vi.hoisted(() => ({
  createLlmClientMock: vi.fn(),
  datasetGetByIdMock: vi.fn(),
  datasetListMock: vi.fn(),
  projectGetByIdMock: vi.fn(),
  llmCompleteMock: vi.fn(async () => ''),
  llmStreamMock: vi.fn(async () => '')
}));

vi.mock('../services/llm/llmClient.js', () => {
  createLlmClientMock.mockImplementation(() => ({
    complete: llmCompleteMock,
    stream: llmStreamMock
  }));
  return {
    createLlmClient: createLlmClientMock
  };
});

vi.mock('../repositories/datasetRepository.js', () => ({
  createDatasetRepository: vi.fn(() => ({
    getById: datasetGetByIdMock,
    list: datasetListMock,
    listByProjectId: vi.fn(async () => [])
  })),
  datasetRepository: {
    getById: datasetGetByIdMock,
    list: datasetListMock,
    listByProjectId: vi.fn(async () => [])
  }
}));

vi.mock('../repositories/projectRepository.js', () => ({
  createProjectRepository: vi.fn(() => ({
    getById: projectGetByIdMock
  })),
  projectRepository: {
    getById: projectGetByIdMock
  }
}));

vi.mock('../services/mcp/mcpAdapter.js', () => ({
  listMcpToolsForLlm: vi.fn(async () => []),
  executeMcpTool: vi.fn(async () => ({ output: {} }))
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
  app.use('/api', createLlmRouter());
  return app;
}

function parseEvents(responseText: string) {
  return responseText
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function findEnvelope(events: Record<string, unknown>[]) {
  return events.find((event) => event.type === 'envelope') as {
    envelope?: {
      message?: string;
      tool_calls?: Array<{
        id: string;
        tool: string;
        args?: Record<string, unknown>;
      }>;
      controller?: {
        currentNode?: string;
        turnMode?: string;
      };
    };
  } | undefined;
}

function extractUserContent(requestPayload: unknown): string {
  const request = requestPayload as { messages?: Array<{ role?: string; content?: string }> };
  return request.messages?.find((message) => message.role === 'user')?.content ?? '';
}

function extractControllerNode(requestPayload: unknown): string | undefined {
  const userContent = extractUserContent(requestPayload);
  const match = /Current controller node:\s*([a-z_]+)/i.exec(userContent);
  return match?.[1];
}

describeRouteSuite('preprocessing workflow manual QA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    llmCompleteMock.mockResolvedValue('');
    llmStreamMock.mockResolvedValue('');
    createLlmClientMock.mockImplementation(() => ({
      complete: llmCompleteMock,
      stream: llmStreamMock
    }));
    datasetGetByIdMock.mockResolvedValue({
      datasetId: 'ds-1',
      projectId: 'project-1',
      filename: 'train.csv',
      fileType: 'csv',
      size: 1024,
      nRows: 10,
      nCols: 2,
      columns: [
        { name: 'age', dtype: 'integer', nullCount: 0 },
        { name: 'churn', dtype: 'integer', nullCount: 0 }
      ],
      sample: [{ age: 21, churn: 0 }],
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z'
    });
    datasetListMock.mockResolvedValue([
      {
        datasetId: 'ds-1',
        projectId: 'project-1',
        filename: 'train.csv',
        fileType: 'csv',
        size: 1024,
        nRows: 10,
        nCols: 2,
        columns: [
          { name: 'age', dtype: 'integer', nullCount: 0 },
          { name: 'churn', dtype: 'integer', nullCount: 0 }
        ],
        sample: [{ age: 21, churn: 0 }],
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z'
      }
    ]);
    projectGetByIdMock.mockResolvedValue({
      projectId: 'project-1',
      metadata: {}
    });
  });

  it('drives a full happy-path preprocessing workflow from user prompt to summary', async () => {
    llmCompleteMock.mockResolvedValueOnce(JSON.stringify({
      turnMode: 'action_required',
      rationale: 'The user asked for a preprocessing change.'
    }));

    let runId = '';
    let stepId = '';
    llmStreamMock.mockImplementation(async (...args: unknown[]) => {
      const requestPayload = args[0];
      const handlers = args[1] as {
        onToken: (token: string) => void;
        onToolCall?: (call: { name: string; args: Record<string, unknown> }) => void;
      };
      const currentNode = extractControllerNode(requestPayload);

      switch (currentNode) {
        case 'plan_step':
          handlers.onToken('I will propose a scaling step.');
          handlers.onToolCall?.({
            name: 'propose_transformation_step',
            args: {
              title: 'Scale age',
              intentType: 'scale_numeric'
            }
          });
          break;
        case 'generate_code':
          handlers.onToken('I generated the code for that step.');
          handlers.onToolCall?.({
            name: 'materialize_step_code',
            args: {
              runId,
              stepId,
              code: 'df["age"] = (df["age"] - df["age"].mean()) / df["age"].std()'
            }
          });
          break;
        case 'write_code':
          handlers.onToken('I will run the prepared notebook cell.');
          handlers.onToolCall?.({
            name: 'run_cell',
            args: {
              cellId: 'cell-1'
            }
          });
          break;
        case 'record_execution':
          handlers.onToken('Recording the successful execution.');
          handlers.onToolCall?.({
            name: 'execute_transformation_step',
            args: {
              runId,
              stepId,
              succeeded: true,
              cellId: 'cell-1'
            }
          });
          break;
        case 'validate':
          handlers.onToken('Validating the step outcome.');
          handlers.onToolCall?.({
            name: 'validate_step_result',
            args: {
              runId,
              stepId,
              requiresApproval: false
            }
          });
          break;
        case 'commit':
          handlers.onToken('Committing the validated step.');
          handlers.onToolCall?.({
            name: 'commit_transformation_step',
            args: {
              runId,
              stepId,
              approved: true
            }
          });
          break;
        case 'summarize':
          handlers.onToken('Scaling is committed and the workflow is summarized.');
          break;
        default:
          throw new Error(`Unhandled happy-path controller node: ${currentNode ?? 'unknown'}`);
      }
      return '';
    });

    const app = createTestApp();
    const toolCallsHistory: Array<{ id: string; tool: string; args?: Record<string, unknown> }> = [];
    const toolResultsHistory: Array<Record<string, unknown>> = [];

    const firstResponse = await request(app)
      .post('/api/llm/preprocessing/stream')
      .send({
        projectId: 'project-1',
        datasetId: 'ds-1',
        prompt: 'Scale the age column.'
      });
    const firstEnvelope = findEnvelope(parseEvents(firstResponse.text));
    expect(firstEnvelope?.envelope?.tool_calls?.[0]?.tool).toBe('propose_transformation_step');
    toolCallsHistory.push(...(firstEnvelope?.envelope?.tool_calls ?? []));

    const proposeExec = await request(app)
      .post('/api/llm/tools/execute')
      .send({
        projectId: 'project-1',
        datasetId: 'ds-1',
        toolCalls: [toolCallsHistory.at(-1)]
      });
    const proposeResult = proposeExec.body.results?.[0] as {
      output?: { runId?: string; step?: { stepId?: string } };
      tool: string;
      id: string;
    };
    runId = proposeResult.output?.runId ?? '';
    stepId = proposeResult.output?.step?.stepId ?? '';
    expect(runId).toBeTruthy();
    expect(stepId).toBeTruthy();
    toolResultsHistory.push(proposeExec.body.results[0] as Record<string, unknown>);

    const expectedNodes = [
      ['generate_code', 'materialize_step_code'],
      ['write_code', 'run_cell'],
      ['record_execution', 'execute_transformation_step'],
      ['validate', 'validate_step_result'],
      ['commit', 'commit_transformation_step']
    ] as const;

    for (const [expectedNode, expectedTool] of expectedNodes) {
      const streamResponse = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: 'Continue preprocessing.',
          continuation: true,
          toolCalls: toolCallsHistory,
          toolResults: toolResultsHistory
        });
      const events = parseEvents(streamResponse.text);
      const envelope = findEnvelope(events);
      expect(envelope?.envelope?.controller?.currentNode).toBe(expectedNode);
      expect(envelope?.envelope?.tool_calls?.[0]?.tool).toBe(expectedTool);

      const nextCall = envelope?.envelope?.tool_calls?.[0];
      expect(nextCall).toBeTruthy();
      toolCallsHistory.push(nextCall!);

      const executeResponse = await request(app)
        .post('/api/llm/tools/execute')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          toolCalls: [nextCall]
        });
      expect(executeResponse.status).toBe(200);
      if (expectedTool === 'commit_transformation_step') {
        expect(executeResponse.body.results[0]).toMatchObject({
          output: {
            status: 'applied'
          }
        });
      }
      toolResultsHistory.push(executeResponse.body.results[0] as Record<string, unknown>);
    }

    const summaryResponse = await request(app)
      .post('/api/llm/preprocessing/stream')
      .send({
        projectId: 'project-1',
        datasetId: 'ds-1',
        prompt: 'Continue preprocessing.',
        continuation: true,
        toolCalls: toolCallsHistory,
        toolResults: toolResultsHistory
      });
    const summaryEvents = parseEvents(summaryResponse.text);
    const summaryEnvelope = findEnvelope(summaryEvents);

    expect(summaryEnvelope?.envelope?.controller?.currentNode).toBe('summarize');
    expect(summaryEnvelope?.envelope?.message).toContain('workflow is summarized');
    expect(summaryEnvelope?.envelope?.tool_calls).toBeUndefined();
    expect(llmCompleteMock).toHaveBeenCalledTimes(1);

    const snapshotResponse = await request(app).get(`/api/llm/preprocessing/runs/${runId}`);
    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.body.run.steps[0]).toMatchObject({
      stepId,
      status: 'applied',
      code: 'df["age"] = (df["age"] - df["age"].mean()) / df["age"].std()'
    });
  });

  it('handles a pending-approval conversation where the user asks a question and then approves', async () => {
    llmCompleteMock.mockResolvedValueOnce(JSON.stringify({
      turnMode: 'action_required',
      rationale: 'The user asked for a risky preprocessing change.'
    }));

    let runId = '';
    let stepId = '';
    llmStreamMock.mockImplementation(async (...args: unknown[]) => {
      const requestPayload = args[0];
      const handlers = args[1] as {
        onToken: (token: string) => void;
        onToolCall?: (call: { name: string; args: Record<string, unknown> }) => void;
      };
      const currentNode = extractControllerNode(requestPayload);
      const userContent = extractUserContent(requestPayload).toLowerCase();

      switch (currentNode) {
        case 'plan_step':
          handlers.onToken('I will propose dropping outliers.');
          handlers.onToolCall?.({
            name: 'propose_transformation_step',
            args: {
              title: 'Drop outliers',
              intentType: 'drop_rows'
            }
          });
          break;
        case 'generate_code':
          handlers.onToken('Generating code for the risky step.');
          handlers.onToolCall?.({
            name: 'materialize_step_code',
            args: {
              runId,
              stepId,
              code: 'df = df[df["age"] < 100]'
            }
          });
          break;
        case 'write_code':
          handlers.onToken('Running the notebook cell.');
          handlers.onToolCall?.({
            name: 'run_cell',
            args: {
              cellId: 'cell-2'
            }
          });
          break;
        case 'record_execution':
          handlers.onToken('Recording execution before validation.');
          handlers.onToolCall?.({
            name: 'execute_transformation_step',
            args: {
              runId,
              stepId,
              succeeded: true,
              cellId: 'cell-2'
            }
          });
          break;
        case 'validate':
          handlers.onToken('This change is risky, so I am sending it for approval.');
          handlers.onToolCall?.({
            name: 'validate_step_result',
            args: {
              runId,
              stepId,
              requiresApproval: true
            }
          });
          break;
        case 'await_approval':
          handlers.onToken('Approval is required because dropping rows can permanently change the dataset.');
          break;
        case 'commit':
          handlers.onToken('Approving and committing the pending step.');
          handlers.onToolCall?.({
            name: 'commit_transformation_step',
            args: {
              runId,
              stepId,
              approved: !userContent.includes('reject')
            }
          });
          break;
        case 'summarize':
          handlers.onToken('The approved step is now committed.');
          break;
        default:
          throw new Error(`Unhandled approval-path controller node: ${currentNode ?? 'unknown'}`);
      }
      return '';
    });

    const app = createTestApp();
    const toolCallsHistory: Array<{ id: string; tool: string; args?: Record<string, unknown> }> = [];
    const toolResultsHistory: Array<Record<string, unknown>> = [];

    const prompts = [
      'Drop outliers aggressively.',
      'Continue preprocessing.',
      'Continue preprocessing.',
      'Continue preprocessing.',
      'Continue preprocessing.'
    ];

    for (let index = 0; index < prompts.length; index += 1) {
      const response = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: prompts[index],
          continuation: index > 0,
          toolCalls: toolCallsHistory,
          toolResults: toolResultsHistory
        });
      const envelope = findEnvelope(parseEvents(response.text));
      const toolCall = envelope?.envelope?.tool_calls?.[0];
      expect(toolCall).toBeTruthy();
      toolCallsHistory.push(toolCall!);

      const executeResponse = await request(app)
        .post('/api/llm/tools/execute')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          toolCalls: [toolCall]
        });
      const result = executeResponse.body.results[0] as {
        output?: { runId?: string; step?: { stepId?: string } };
      };
      runId ||= result.output?.runId ?? '';
      stepId ||= result.output?.step?.stepId ?? '';
      toolResultsHistory.push(executeResponse.body.results[0] as Record<string, unknown>);
    }

    const questionResponse = await request(app)
      .post('/api/llm/preprocessing/stream')
      .send({
        projectId: 'project-1',
        datasetId: 'ds-1',
        prompt: 'Why does this need approval?',
        continuation: false,
        toolCalls: toolCallsHistory,
        toolResults: toolResultsHistory
      });
    const questionEnvelope = findEnvelope(parseEvents(questionResponse.text));
    expect(questionEnvelope?.envelope?.controller?.currentNode).toBe('await_approval');
    expect(questionEnvelope?.envelope?.message).toContain('Approval is required');
    expect(questionEnvelope?.envelope?.tool_calls).toBeUndefined();

    const approvalResponse = await request(app)
      .post('/api/llm/preprocessing/stream')
      .send({
        projectId: 'project-1',
        datasetId: 'ds-1',
        prompt: 'Approve it.',
        continuation: false,
        toolCalls: toolCallsHistory,
        toolResults: toolResultsHistory
      });
    const approvalEnvelope = findEnvelope(parseEvents(approvalResponse.text));
    expect(approvalEnvelope?.envelope?.controller?.currentNode).toBe('commit');
    expect(approvalEnvelope?.envelope?.tool_calls?.[0]?.tool).toBe('commit_transformation_step');

    const approvalCall = approvalEnvelope?.envelope?.tool_calls?.[0];
    expect(approvalCall).toBeTruthy();
    toolCallsHistory.push(approvalCall!);
    const commitExecute = await request(app)
      .post('/api/llm/tools/execute')
      .send({
        projectId: 'project-1',
        datasetId: 'ds-1',
        executionMode: 'user_approval',
        toolCalls: [approvalCall]
      });
    expect(commitExecute.body.results[0]).toMatchObject({
      output: {
        status: 'applied'
      }
    });
    toolResultsHistory.push(commitExecute.body.results[0] as Record<string, unknown>);

    const summaryResponse = await request(app)
      .post('/api/llm/preprocessing/stream')
      .send({
        projectId: 'project-1',
        datasetId: 'ds-1',
        prompt: 'Continue preprocessing.',
        continuation: true,
        toolCalls: toolCallsHistory,
        toolResults: toolResultsHistory
      });
    const summaryEvents = parseEvents(summaryResponse.text);
    const summaryEnvelope = findEnvelope(summaryEvents);
    expect(summaryEnvelope?.envelope?.controller?.currentNode).toBe('summarize');
    expect(summaryEnvelope?.envelope?.message).toContain('committed');
    expect(llmCompleteMock).toHaveBeenCalledTimes(1);

    const snapshotResponse = await request(app).get(`/api/llm/preprocessing/runs/${runId}`);
    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.body.run.steps[0]).toMatchObject({
      stepId,
      status: 'applied',
      requiresApproval: true,
      code: 'df = df[df["age"] < 100]'
    });
  });

  it('handles a pending-approval conversation where the user rejects the step with a reason', async () => {
    llmCompleteMock.mockResolvedValueOnce(JSON.stringify({
      turnMode: 'action_required',
      rationale: 'The user asked for a risky preprocessing change.'
    }));

    let runId = '';
    let stepId = '';
    llmStreamMock.mockImplementation(async (...args: unknown[]) => {
      const requestPayload = args[0];
      const handlers = args[1] as {
        onToken: (token: string) => void;
        onToolCall?: (call: { name: string; args: Record<string, unknown> }) => void;
      };
      const currentNode = extractControllerNode(requestPayload);
      const userContent = extractUserContent(requestPayload).toLowerCase();

      switch (currentNode) {
        case 'plan_step':
          handlers.onToken('I will propose dropping outliers.');
          handlers.onToolCall?.({
            name: 'propose_transformation_step',
            args: { title: 'Drop outliers', intentType: 'drop_rows' }
          });
          break;
        case 'generate_code':
          handlers.onToken('Generating code for the risky step.');
          handlers.onToolCall?.({
            name: 'materialize_step_code',
            args: { runId, stepId, code: 'df = df[df["age"] < 100]' }
          });
          break;
        case 'write_code':
          handlers.onToken('Running the notebook cell.');
          handlers.onToolCall?.({
            name: 'run_cell',
            args: { cellId: 'cell-3' }
          });
          break;
        case 'record_execution':
          handlers.onToken('Recording execution before validation.');
          handlers.onToolCall?.({
            name: 'execute_transformation_step',
            args: { runId, stepId, succeeded: true, cellId: 'cell-3' }
          });
          break;
        case 'validate':
          handlers.onToken('This change is risky, so I am sending it for approval.');
          handlers.onToolCall?.({
            name: 'validate_step_result',
            args: { runId, stepId, requiresApproval: true }
          });
          break;
        case 'await_approval':
          handlers.onToken('Approval is required because this drops rows.');
          break;
        case 'commit':
          handlers.onToken('Rejecting the pending step and recording the reason.');
          handlers.onToolCall?.({
            name: 'commit_transformation_step',
            args: {
              runId,
              stepId,
              approved: false,
              rejectionReason: userContent.includes('critical')
                ? 'This would remove critical records.'
                : 'Rejected by user.'
            }
          });
          break;
        case 'summarize':
          handlers.onToken('The step was rejected and no dataset mutation was committed.');
          break;
        default:
          throw new Error(`Unhandled rejection-path controller node: ${currentNode ?? 'unknown'}`);
      }
      return '';
    });

    const app = createTestApp();
    const toolCallsHistory: Array<{ id: string; tool: string; args?: Record<string, unknown> }> = [];
    const toolResultsHistory: Array<Record<string, unknown>> = [];

    for (const [index, prompt] of [
      'Drop outliers aggressively.',
      'Continue preprocessing.',
      'Continue preprocessing.',
      'Continue preprocessing.',
      'Continue preprocessing.'
    ].entries()) {
      const response = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt,
          continuation: index > 0,
          toolCalls: toolCallsHistory,
          toolResults: toolResultsHistory
        });
      const envelope = findEnvelope(parseEvents(response.text));
      const toolCall = envelope?.envelope?.tool_calls?.[0];
      expect(toolCall).toBeTruthy();
      toolCallsHistory.push(toolCall!);

      const executeResponse = await request(app)
        .post('/api/llm/tools/execute')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          toolCalls: [toolCall]
        });
      const result = executeResponse.body.results[0] as {
        output?: { runId?: string; step?: { stepId?: string } };
      };
      runId ||= result.output?.runId ?? '';
      stepId ||= result.output?.step?.stepId ?? '';
      toolResultsHistory.push(executeResponse.body.results[0] as Record<string, unknown>);
    }

    const rejectResponse = await request(app)
      .post('/api/llm/preprocessing/stream')
      .send({
        projectId: 'project-1',
        datasetId: 'ds-1',
        prompt: 'Reject it. This removes critical records.',
        continuation: false,
        toolCalls: toolCallsHistory,
        toolResults: toolResultsHistory
      });
    const rejectEnvelope = findEnvelope(parseEvents(rejectResponse.text));
    expect(rejectEnvelope?.envelope?.controller?.currentNode).toBe('commit');
    expect(rejectEnvelope?.envelope?.tool_calls?.[0]?.tool).toBe('commit_transformation_step');

    const rejectCall = rejectEnvelope?.envelope?.tool_calls?.[0];
    expect(rejectCall).toBeTruthy();
    toolCallsHistory.push(rejectCall!);

    const rejectExecute = await request(app)
      .post('/api/llm/tools/execute')
      .send({
        projectId: 'project-1',
        datasetId: 'ds-1',
        executionMode: 'user_approval',
        toolCalls: [rejectCall]
      });
    expect(rejectExecute.body.results[0]).toMatchObject({
      output: {
        status: 'failed',
        step: {
          approvalDecision: 'rejected',
          decisionReason: 'This would remove critical records.'
        }
      }
    });
    toolResultsHistory.push(rejectExecute.body.results[0] as Record<string, unknown>);

    const summaryResponse = await request(app)
      .post('/api/llm/preprocessing/stream')
      .send({
        projectId: 'project-1',
        datasetId: 'ds-1',
        prompt: 'Continue preprocessing.',
        continuation: true,
        toolCalls: toolCallsHistory,
        toolResults: toolResultsHistory
      });
    const summaryEnvelope = findEnvelope(parseEvents(summaryResponse.text));
    expect(summaryEnvelope?.envelope?.controller?.currentNode).toBe('summarize');
    expect(summaryEnvelope?.envelope?.message).toContain('rejected');

    const snapshotResponse = await request(app).get(`/api/llm/preprocessing/runs/${runId}`);
    expect(snapshotResponse.body.run.steps[0]).toMatchObject({
      stepId,
      status: 'failed',
      approvalDecision: 'rejected',
      decisionReason: 'This would remove critical records.',
      code: 'df = df[df["age"] < 100]'
    });
  });

  it('routes failed execution back into code-repair workflow on the next continue turn', async () => {
    llmCompleteMock.mockResolvedValueOnce(JSON.stringify({
      turnMode: 'action_required',
      rationale: 'The user asked for a preprocessing change.'
    }));

    let runId = '';
    let stepId = '';
    llmStreamMock.mockImplementation(async (...args: unknown[]) => {
      const requestPayload = args[0];
      const handlers = args[1] as {
        onToken: (token: string) => void;
        onToolCall?: (call: { name: string; args: Record<string, unknown> }) => void;
      };
      const currentNode = extractControllerNode(requestPayload);

      switch (currentNode) {
        case 'plan_step':
          handlers.onToken('I will propose a scaling step.');
          handlers.onToolCall?.({
            name: 'propose_transformation_step',
            args: { title: 'Scale age', intentType: 'scale_numeric' }
          });
          break;
        case 'generate_code':
          handlers.onToken('I generated code for the step.');
          handlers.onToolCall?.({
            name: 'materialize_step_code',
            args: { runId, stepId, code: 'df["age"] = df["age"] / 0' }
          });
          break;
        case 'write_code':
          handlers.onToken('I will rerun the corrected notebook cell.');
          handlers.onToolCall?.({
            name: 'run_cell',
            args: { cellId: 'cell-4' }
          });
          break;
        case 'record_execution':
          handlers.onToken('Recording the failed execution.');
          handlers.onToolCall?.({
            name: 'execute_transformation_step',
            args: { runId, stepId, succeeded: false, cellId: 'cell-4', stderr: 'ZeroDivisionError' }
          });
          break;
        default:
          throw new Error(`Unhandled recovery controller node: ${currentNode ?? 'unknown'}`);
      }
      return '';
    });

    const app = createTestApp();
    const toolCallsHistory: Array<{ id: string; tool: string; args?: Record<string, unknown> }> = [];
    const toolResultsHistory: Array<Record<string, unknown>> = [];

    for (const [index, prompt] of [
      'Scale the age column.',
      'Continue preprocessing.',
      'Continue preprocessing.',
      'Continue preprocessing.'
    ].entries()) {
      const response = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt,
          continuation: index > 0,
          toolCalls: toolCallsHistory,
          toolResults: toolResultsHistory
        });
      const envelope = findEnvelope(parseEvents(response.text));
      const toolCall = envelope?.envelope?.tool_calls?.[0];
      expect(toolCall).toBeTruthy();
      toolCallsHistory.push(toolCall!);

      const executeResponse = await request(app)
        .post('/api/llm/tools/execute')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          toolCalls: [toolCall]
        });
      const result = executeResponse.body.results[0] as {
        output?: { runId?: string; step?: { stepId?: string } };
      };
      runId ||= result.output?.runId ?? '';
      stepId ||= result.output?.step?.stepId ?? '';
      toolResultsHistory.push(executeResponse.body.results[0] as Record<string, unknown>);
    }

    const recoveryResponse = await request(app)
      .post('/api/llm/preprocessing/stream')
      .send({
        projectId: 'project-1',
        datasetId: 'ds-1',
        prompt: 'Continue preprocessing.',
        continuation: true,
        toolCalls: toolCallsHistory,
        toolResults: toolResultsHistory
      });
    const recoveryEnvelope = findEnvelope(parseEvents(recoveryResponse.text));
    expect(recoveryEnvelope?.envelope?.controller?.currentNode).toBe('write_code');
    expect(recoveryEnvelope?.envelope?.tool_calls?.[0]?.tool).toBe('run_cell');
    expect(recoveryEnvelope?.envelope?.message).toContain('rerun');
  });
});
