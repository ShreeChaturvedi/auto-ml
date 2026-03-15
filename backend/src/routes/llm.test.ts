import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../config.js';
import { describeRouteSuite } from '../tests/describeRouteSuite.js';

import { createLlmRouter } from './llm/index.js';

const {
  createLlmClientMock,
  datasetGetByIdMock,
  projectGetByIdMock,
  llmCompleteMock,
  llmStreamMock
} = vi.hoisted(() => ({
  createLlmClientMock: vi.fn(),
  datasetGetByIdMock: vi.fn(),
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
    listByProjectId: vi.fn(async () => [])
  })),
  datasetRepository: {
    getById: datasetGetByIdMock,
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

describeRouteSuite('llm routes', () => {
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
    projectGetByIdMock.mockResolvedValue({
      projectId: 'project-1',
      metadata: {}
    });
  });

  // Onboarding tests removed — endpoint migrated to /api/workflows/turns/stream (Phase 0)

  describe('GET /api/llm/models', () => {
    it('returns a GPT-5-only catalog with featured latest-per-kind entries', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/llm/models');

      expect(response.status).toBe(200);
      expect(response.body.defaultModel).toBe('gpt-5.4');
      expect(response.body.defaultReasoningEffort).toBe('high');
      expect(response.body.featuredModels.map((entry: { id: string }) => entry.id)).toEqual([
        'gpt-5.4',
        'gpt-5.3-codex',
        'gpt-5-mini',
        'gpt-5-nano'
      ]);
      expect(response.body.models.map((entry: { id: string }) => entry.id)).toEqual([
        'gpt-5.4',
        'gpt-5.3-codex',
        'gpt-5-mini',
        'gpt-5-nano'
      ]);
      expect(response.body.models.every((entry: { id: string }) => entry.id.startsWith('gpt-5'))).toBe(true);
      expect(
        response.body.models.every((entry: { reasoningEfforts: string[] }) => !entry.reasoningEfforts.includes('none'))
      ).toBe(true);
    });
  });

  // Training stream tests removed — endpoint migrated to /api/workflows/turns/stream (Phase 4)

  describe('GET /api/llm/preprocessing/runs*', () => {
    it('returns run snapshot for an existing run id', async () => {
      const app = createTestApp();
      const executeResponse = await request(app)
        .post('/api/llm/tools/execute')
        .send({
          projectId: 'project-1',
          toolCalls: [
            {
              id: 'tool-1',
              tool: 'propose_transformation_step',
              args: {
                title: 'Normalize values',
                intentType: 'scale_numeric'
              }
            }
          ]
        });

      expect(executeResponse.status).toBe(200);
      const runId = executeResponse.body.results?.[0]?.output?.runId as string | undefined;
      expect(runId).toBeTruthy();

      const snapshotResponse = await request(app).get(`/api/llm/preprocessing/runs/${runId}`);
      expect(snapshotResponse.status).toBe(200);
      expect(snapshotResponse.body.run).toMatchObject({
        runId,
        projectId: 'project-1'
      });

      const listResponse = await request(app).get('/api/llm/preprocessing/runs').query({ projectId: 'project-1' });
      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body.runs)).toBe(true);
      expect(listResponse.body.runs.some((run: { runId: string }) => run.runId === runId)).toBe(true);
    });

    it('returns 404 for missing run id', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/llm/preprocessing/runs/non-existent-run');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Preprocessing run not found');
    });

    it('returns 400 for malformed list request', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/llm/preprocessing/runs');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('returns typed run error for unknown explicit preprocessing runId', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/tools/execute')
        .send({
          projectId: 'project-1',
          toolCalls: [
            {
              id: 'tool-unknown-run',
              tool: 'list_project_datasets',
              args: {
                runId: 'run_001'
              }
            }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.results?.[0]?.output).toMatchObject({
        isError: true,
        runId: 'run_001'
      });
      const reasonCode = response.body.results?.[0]?.output?.reasonCode as string | undefined;
      expect(['RUN_NOT_FOUND', 'RUN_PROJECT_MISMATCH']).toContain(reasonCode);
    });

  });

  describe('POST /api/llm/preprocessing/stream', () => {
    it('uses preprocessing-specific timeout for non-thinking requests', async () => {
      const app = createTestApp();

      const response = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: 'profile missing values'
        });

      expect(response.status).toBe(200);
      expect(createLlmClientMock.mock.calls).toContainEqual([undefined, env.preprocessingLlmTimeoutMs]);
    });

    it('normalizes OpenAI quota errors into actionable preprocessing message', async () => {
      llmStreamMock.mockRejectedValueOnce(new Error(JSON.stringify({
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          message: 'Quota exceeded for metric generate_requests_per_model_per_day'
        }
      })));

      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: 'profile missing values'
        });

      expect(response.status).toBe(200);
      const events = response.text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      const errorEvent = events.find((event) => event.type === 'error') as { message?: string } | undefined;
      expect(errorEvent?.message).toContain('OpenAI rate limit or quota reached (429)');
      expect(errorEvent?.message).toContain('preprocessing request was not completed');
      expect(events[events.length - 1]?.type).toBe('done');
    });

    it('emits an error when preprocessing stream returns text-only response without tool calls', async () => {
      llmCompleteMock.mockResolvedValueOnce(JSON.stringify({
        turnMode: 'action_required',
        rationale: 'The user asked for a transformation.'
      }));
      llmStreamMock.mockImplementationOnce(async (...args: unknown[]) => {
        const handlers = args[1] as { onToken: (token: string) => void };
        handlers.onToken('```python\nprint("hello")\n```');
        return '```python\nprint("hello")\n```';
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: 'Encode categoricals'
        });

      expect(response.status).toBe(200);
      const events = response.text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      const errorEvent = events.find((event) => event.type === 'error') as { message?: string } | undefined;
      expect(errorEvent?.message).toContain('text without tool calls');
      expect(events[events.length - 1]?.type).toBe('done');
    });

    it('allows answer-only preprocessing turns when the classifier routes to answer mode', async () => {
      llmCompleteMock.mockResolvedValueOnce(JSON.stringify({
        turnMode: 'answer_only',
        rationale: 'The user asked for explanation only.'
      }));
      llmStreamMock.mockImplementationOnce(async (...args: unknown[]) => {
        const handlers = args[1] as { onToken: (token: string) => void };
        handlers.onToken('Scaling keeps features on a comparable range.');
        return 'Scaling keeps features on a comparable range.';
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: 'Why would scaling help here?'
        });

      expect(response.status).toBe(200);
      const events = response.text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      const errorEvent = events.find((event) => event.type === 'error');
      const envelope = events.find((event) => event.type === 'envelope') as {
        envelope?: { message?: string; controller?: { turnMode?: string; currentNode?: string } };
      } | undefined;

      expect(errorEvent).toBeUndefined();
      expect(envelope?.envelope?.message).toContain('Scaling keeps features');
      expect(envelope?.envelope?.controller?.turnMode).toBe('answer_only');
      expect(envelope?.envelope?.controller?.currentNode).toBe('answer');
    });

    it('keeps free-answer behavior for a new question even when prior tool history exists', async () => {
      llmCompleteMock.mockResolvedValueOnce(JSON.stringify({
        turnMode: 'answer_only',
        rationale: 'The user asked a follow-up question.'
      }));
      llmStreamMock.mockImplementationOnce(async (...args: unknown[]) => {
        const handlers = args[1] as { onToken: (token: string) => void };
        handlers.onToken('We validate row counts to catch accidental data loss.');
        return 'We validate row counts to catch accidental data loss.';
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: 'Why did we validate row counts?',
          toolResults: [
            {
              id: 'result-1',
              tool: 'commit_transformation_step',
              output: {
                runId: 'prep-run-1',
                stepId: 'step-1',
                status: 'applied'
              }
            }
          ]
        });

      const events = response.text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      const errorEvent = events.find((event) => event.type === 'error');
      const envelope = events.find((event) => event.type === 'envelope') as {
        envelope?: { message?: string; controller?: { turnMode?: string } };
      } | undefined;

      expect(errorEvent).toBeUndefined();
      expect(envelope?.envelope?.message).toContain('validate row counts');
      expect(envelope?.envelope?.controller?.turnMode).toBe('answer_only');
    });

    it('routes explicit approval prompts into the commit state when a step is awaiting approval', async () => {
      llmStreamMock.mockImplementationOnce(async (...args: unknown[]) => {
        const handlers = args[1] as {
          onToken: (token: string) => void;
          onToolCall: (call: { name: string; args: Record<string, unknown> }) => void;
        };
        handlers.onToken('Approving the pending step.');
        handlers.onToolCall({
          name: 'commit_transformation_step',
          args: {
            runId: 'prep-run-1',
            stepId: 'step-1',
            approved: true
          }
        });
        return '';
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: 'Approve it.',
          toolResults: [
            {
              id: 'result-1',
              tool: 'validate_step_result',
              output: {
                runId: 'prep-run-1',
                stepId: 'step-1',
                status: 'awaiting_approval'
              }
            }
          ]
        });

      const events = response.text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      const envelope = events.find((event) => event.type === 'envelope') as {
        envelope?: {
          message?: string;
          tool_calls?: Array<{ tool?: string }>;
          controller?: { currentNode?: string };
        };
      } | undefined;

      expect(llmCompleteMock).not.toHaveBeenCalled();
      expect(envelope?.envelope?.message).toContain('Approving the pending step');
      expect(envelope?.envelope?.tool_calls?.[0]?.tool).toBe('commit_transformation_step');
      expect(envelope?.envelope?.controller?.currentNode).toBe('commit');
    });

    it('includes both message text and tool calls for action turns', async () => {
      llmCompleteMock.mockResolvedValueOnce(JSON.stringify({
        turnMode: 'action_required',
        rationale: 'The user asked for a preprocessing change.'
      }));
      llmStreamMock.mockImplementationOnce(async (...args: unknown[]) => {
        const handlers = args[1] as {
          onToken: (token: string) => void;
          onToolCall: (call: { name: string; args: Record<string, unknown> }) => void;
        };
        handlers.onToken('I will add a scaling step.');
        handlers.onToolCall({
          name: 'propose_transformation_step',
          args: {
            title: 'Scale numeric features',
            intentType: 'scale_numeric'
          }
        });
        return '';
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: 'Scale the numeric columns.'
        });

      const events = response.text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      const envelope = events.find((event) => event.type === 'envelope') as {
        envelope?: { message?: string; tool_calls?: Array<{ tool?: string }>; controller?: { turnMode?: string } };
      } | undefined;

      expect(envelope?.envelope?.message).toContain('I will add a scaling step.');
      expect(envelope?.envelope?.tool_calls?.[0]?.tool).toBe('propose_transformation_step');
      expect(envelope?.envelope?.controller?.turnMode).toBe('action_required');
    });

    it('treats tool continuations as action-required without reclassifying', async () => {
      llmStreamMock.mockImplementationOnce(async (...args: unknown[]) => {
        const handlers = args[1] as { onToken: (token: string) => void };
        handlers.onToken('Continue by updating the notebook cell.');
        return 'Continue by updating the notebook cell.';
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: 'Scale the numeric columns.',
          continuation: true,
          toolResults: [
            {
              id: 'result-1',
              tool: 'propose_transformation_step',
              output: {
                runId: 'prep-run-1',
                stepId: 'step-1',
                status: 'pending'
              }
            }
          ]
        });

      const events = response.text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      const errorEvent = events.find((event) => event.type === 'error') as { message?: string } | undefined;

      expect(llmCompleteMock).not.toHaveBeenCalled();
      expect(errorEvent?.message).toContain('text without tool calls');
    });

    it('persists interrupted run state as failed when provider stream errors', async () => {
      const app = createTestApp();

      const proposeResponse = await request(app)
        .post('/api/llm/tools/execute')
        .send({
          projectId: 'project-1',
          toolCalls: [
            {
              id: 'tool-propose',
              tool: 'propose_transformation_step',
              args: {
                title: 'Scale usage count',
                intentType: 'numeric_scaling',
                stepId: 'step_num'
              }
            }
          ]
        });
      const runId = proposeResponse.body.results?.[0]?.output?.runId as string;
      expect(runId).toBeTruthy();

      await request(app)
        .post('/api/llm/tools/execute')
        .send({
          projectId: 'project-1',
          toolCalls: [
            {
              id: 'tool-materialize',
              tool: 'materialize_step_code',
              args: {
                runId,
                stepId: 'step_num',
                code: 'df["Usage"] = df["Usage"] / df["Usage"].max()'
              }
            }
          ]
        });

      await request(app)
        .post('/api/llm/tools/execute')
        .send({
          projectId: 'project-1',
          toolCalls: [
            {
              id: 'tool-execute',
              tool: 'execute_transformation_step',
              args: {
                runId,
                stepId: 'step_num',
                cellId: 'cell-1',
                succeeded: true
              }
            }
          ]
        });

      llmStreamMock.mockRejectedValueOnce(new Error(JSON.stringify({
        error: {
          code: 503,
          status: 'UNAVAILABLE',
          message: 'Model temporarily overloaded'
        }
      })));

      const streamResponse = await request(app)
        .post('/api/llm/preprocessing/stream')
        .send({
          projectId: 'project-1',
          datasetId: 'ds-1',
          prompt: 'continue scaling',
          toolCalls: [
            {
              id: 'tool-history',
              tool: 'execute_transformation_step',
              args: {
                runId,
                stepId: 'step_num'
              }
            }
          ]
        });

      expect(streamResponse.status).toBe(200);

      const snapshotResponse = await request(app).get(`/api/llm/preprocessing/runs/${runId}`);
      expect(snapshotResponse.status).toBe(200);
      const run = snapshotResponse.body.run as {
        steps: Array<{ stepId: string; status: string; decisionReason?: string }>;
        langGraphState?: { isCompleted?: boolean; currentStage?: string; lastError?: string };
        events?: Array<{ type?: string }>;
      };
      const interruptedStep = run.steps.find((step) => step.stepId === 'step_num');
      expect(interruptedStep).toMatchObject({
        status: 'failed'
      });
      expect(interruptedStep?.decisionReason).toContain('Model temporarily overloaded');
      expect(run.langGraphState).toMatchObject({
        isCompleted: true,
        currentStage: 'completed'
      });
      expect(run.langGraphState?.lastError).toContain('Model temporarily overloaded');
      expect(run.events?.at(-1)?.type).toBe('run_interrupted');
    });
  });
});
