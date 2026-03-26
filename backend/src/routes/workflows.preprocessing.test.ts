import express from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';

import type { WorkflowEventSink } from '../services/workflows/eventSink.js';
import { describeRouteSuite } from '../tests/describeRouteSuite.js';

import { createWorkflowRouter } from './workflows.js';

const { executeWorkflowTurnMock, workflowRepositoryMock } = vi.hoisted(() => ({
  executeWorkflowTurnMock: vi.fn(),
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

vi.mock('../services/workflows/turnExecutor.js', () => ({
  executeWorkflowTurn: executeWorkflowTurnMock
}));

vi.mock('../services/workflows/repository/index.js', () => ({
  getWorkflowRepository: vi.fn(() => workflowRepositoryMock)
}));

// Phase config registrations must still be imported so getPhaseConfig finds them,
// but the actual turn executor is mocked above — no real graph runs.
vi.mock('../services/workflows/phases/featureEngineering.js', () => ({}));
vi.mock('../services/workflows/phases/onboarding.js', () => ({}));
vi.mock('../services/workflows/phases/preprocessing.js', () => ({}));
vi.mock('../services/workflows/phases/training.js', () => ({}));

// Register a minimal preprocessing phase config so getPhaseConfig doesn't throw
vi.mock('../services/workflows/phaseConfig.js', async () => {
  const actual = await vi.importActual<typeof import('../services/workflows/phaseConfig.js')>(
    '../services/workflows/phaseConfig.js'
  );
  // Pre-register a minimal preprocessing config
  const minimalConfig = {
    phase: 'preprocessing' as const,
    lifecycle: [],
    classifyTurn: vi.fn(async () => 'action' as const),
    getStageConfig: vi.fn(() => ({
      name: 'plan_step',
      mode: 'action' as const,
      allowedTools: [],
      toolChoice: 'auto' as const,
      requiresApproval: false,
      allowAssistantMessage: false,
      allowAskUser: false,
      allowRenderUi: false,
      allowPlanExit: false,
      requireToolCall: true
    })),
    buildSystemPrompt: vi.fn(() => ''),
    buildUserContext: vi.fn(() => []),
    resolveNextStage: vi.fn(() => null),
    isPhaseSpecificTool: vi.fn(() => false),
    executePhaseSpecificTool: vi.fn()
  };

  actual.registerPhaseConfig(minimalConfig);
  return actual;
});

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createWorkflowRouter());
  return app;
}

describeRouteSuite('workflow routes preprocessing turns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streams backend-owned tool execution events for preprocessing action turns', async () => {
    executeWorkflowTurnMock.mockImplementation(
      async (sink: WorkflowEventSink) => {
        sink.emit({
          type: 'tool_executed',
          call: {
            id: 'call-1',
            tool: 'propose_transformation_step',
            args: {
              datasetId: 'dataset-1',
              title: 'Impute missing subscriptions',
              intentType: 'impute_missing'
            }
          },
          result: {
            id: 'call-1',
            tool: 'propose_transformation_step',
            output: {
              runId: 'prep-run-1',
              step: { stepId: 'step-1', status: 'pending' },
              status: 'pending'
            }
          }
        });
      }
    );

    const response = await request(createTestApp())
      .post('/api/workflows/turns/stream')
      .send({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1',
        prompt: 'Profile missing values and propose an imputation step.'
      });

    expect(response.status).toBe(200);
    expect(executeWorkflowTurnMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1'
      }),
      expect.anything()
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
