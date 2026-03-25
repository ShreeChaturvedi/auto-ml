/**
 * QA tests for preprocessing workflows against the current API surface:
 *   - POST /api/workflows/turns/stream  (workflow turn execution)
 *   - POST /api/preprocessing/step-decision  (user approval/rejection)
 *
 * These tests mock `executeWorkflowTurn` at the turnExecutor level and
 * the preprocessing tool system, verifying that the route layer correctly
 * dispatches requests, streams NDJSON events, and forwards step decisions.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';

import type { WorkflowEventSink } from '../services/workflows/eventSink.js';
import { describeRouteSuite } from '../tests/describeRouteSuite.js';

import { createPreprocessingRouter } from './preprocessing.js';
import { createWorkflowRouter } from './workflows.js';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                      */
/* ------------------------------------------------------------------ */

const {
  executeWorkflowTurnMock,
  workflowRepositoryMock,
  executePreprocessingToolMock,
  syncPreprocessingLangGraphStateMock,
  isPreprocessingToolNameMock,
  getPreprocessingRunSnapshotMock,
  listPreprocessingRunSnapshotsMock,
  datasetListMock
} = vi.hoisted(() => ({
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
  },
  executePreprocessingToolMock: vi.fn(),
  syncPreprocessingLangGraphStateMock: vi.fn(
    async (_projectId: string, _tool: string, _args: unknown, result: unknown) => result
  ),
  isPreprocessingToolNameMock: vi.fn(() => true),
  getPreprocessingRunSnapshotMock: vi.fn(),
  listPreprocessingRunSnapshotsMock: vi.fn(async () => []),
  datasetListMock: vi.fn(async () => [])
}));

vi.mock('../services/workflows/turnExecutor.js', () => ({
  executeWorkflowTurn: executeWorkflowTurnMock
}));

vi.mock('../services/workflows/repository/index.js', () => ({
  getWorkflowRepository: vi.fn(() => workflowRepositoryMock)
}));

vi.mock('../services/workflows/phases/featureEngineering.js', () => ({}));
vi.mock('../services/workflows/phases/onboarding.js', () => ({}));
vi.mock('../services/workflows/phases/preprocessing.js', () => ({}));
vi.mock('../services/workflows/phases/training.js', () => ({}));

vi.mock('../services/workflows/phaseConfig.js', async () => {
  const actual = await vi.importActual<typeof import('../services/workflows/phaseConfig.js')>(
    '../services/workflows/phaseConfig.js'
  );
  actual.registerPhaseConfig({
    phase: 'preprocessing',
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
  });
  return actual;
});

vi.mock('../services/llm/preprocessingGraph.js', () => ({
  executePreprocessingTool: executePreprocessingToolMock,
  syncPreprocessingLangGraphState: syncPreprocessingLangGraphStateMock,
  isPreprocessingToolName: isPreprocessingToolNameMock,
  getPreprocessingRunSnapshot: getPreprocessingRunSnapshotMock,
  listPreprocessingRunSnapshots: listPreprocessingRunSnapshotsMock
}));

vi.mock('../repositories/datasetRepository.js', () => ({
  createDatasetRepository: vi.fn(() => ({
    list: datasetListMock,
    listByProjectId: vi.fn(async () => [])
  }))
}));

vi.mock('../services/datasetLoader.js', () => ({
  sanitizeTableName: vi.fn((filename: string) => filename.replace(/\.\w+$/, ''))
}));

/* ------------------------------------------------------------------ */
/*  Test app factory                                                    */
/* ------------------------------------------------------------------ */

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createWorkflowRouter());
  app.use('/api', createPreprocessingRouter());
  return app;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function parseEvents(responseText: string): Array<Record<string, unknown>> {
  return responseText
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describeRouteSuite('preprocessing workflow QA — workflow engine API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncPreprocessingLangGraphStateMock.mockImplementation(
      async (_projectId: string, _tool: string, _args: unknown, result: unknown) => result
    );
  });

  it('drives a full happy-path preprocessing workflow from user prompt to summary', async () => {
    // Simulate a full happy-path workflow via executeWorkflowTurn mock:
    // The turn executor streams plan, tool execution, and summary events.
    executeWorkflowTurnMock.mockImplementation(async (sink: WorkflowEventSink) => {
      sink.emit({
        type: 'workflow_state',
        state: {
          runId: 'wf-run-1',
          threadId: 'thread-1',
          phase: 'preprocessing',
          status: 'running',
          currentNode: 'plan_step'
        }
      });
      sink.emit({
        type: 'tool_executed',
        call: {
          id: 'call-propose',
          tool: 'propose_transformation_step',
          args: { title: 'Scale age', intentType: 'scale_numeric', datasetId: 'ds-1' }
        },
        result: {
          id: 'call-propose',
          tool: 'propose_transformation_step',
          output: {
            runId: 'prep-run-1',
            step: { stepId: 'step-1', status: 'pending', title: 'Scale age' },
            status: 'pending'
          }
        }
      });
      sink.emit({
        type: 'tool_executed',
        call: {
          id: 'call-code',
          tool: 'materialize_step_code',
          args: {
            runId: 'prep-run-1',
            stepId: 'step-1',
            code: 'df["age"] = (df["age"] - df["age"].mean()) / df["age"].std()'
          }
        },
        result: {
          id: 'call-code',
          tool: 'materialize_step_code',
          output: { runId: 'prep-run-1', stepId: 'step-1', status: 'code_ready' }
        }
      });
      sink.emit({
        type: 'tool_executed',
        call: {
          id: 'call-commit',
          tool: 'commit_transformation_step',
          args: { runId: 'prep-run-1', stepId: 'step-1', approved: true }
        },
        result: {
          id: 'call-commit',
          tool: 'commit_transformation_step',
          output: { runId: 'prep-run-1', stepId: 'step-1', status: 'applied' }
        }
      });
      sink.emit({
        type: 'assistant_message',
        message: 'Scaling is committed and the workflow is summarized.'
      });
      sink.emit({
        type: 'workflow_state',
        state: {
          runId: 'wf-run-1',
          threadId: 'thread-1',
          phase: 'preprocessing',
          status: 'completed',
          currentNode: 'summarize'
        }
      });
    });

    const app = createTestApp();
    const response = await request(app)
      .post('/api/workflows/turns/stream')
      .send({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'ds-1',
        prompt: 'Scale the age column.'
      });

    expect(response.status).toBe(200);
    const events = parseEvents(response.text);

    // Verify workflow state events bracket the turn
    const stateEvents = events.filter((e) => e.type === 'workflow_state');
    expect(stateEvents.length).toBeGreaterThanOrEqual(2);

    // Verify tool execution events for the preprocessing tools
    const toolEvents = events.filter((e) => e.type === 'tool_executed') as Array<{
      type: string;
      call: { tool: string };
      result: { output: { status: string } };
    }>;
    expect(toolEvents.length).toBe(3);
    expect(toolEvents[0].call.tool).toBe('propose_transformation_step');
    expect(toolEvents[1].call.tool).toBe('materialize_step_code');
    expect(toolEvents[2].call.tool).toBe('commit_transformation_step');
    expect(toolEvents[2].result.output.status).toBe('applied');

    // Verify summary message
    const messageEvents = events.filter((e) => e.type === 'assistant_message');
    expect(messageEvents.length).toBe(1);
    expect(messageEvents[0].message).toContain('workflow is summarized');

    // Verify done sentinel
    const doneEvents = events.filter((e) => e.type === 'done');
    expect(doneEvents.length).toBe(1);

    // Verify executeWorkflowTurn was called with proper arguments
    expect(executeWorkflowTurnMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'ds-1',
        prompt: 'Scale the age column.'
      }),
      expect.anything()
    );
  });

  it('handles a pending-approval workflow where the user approves via step-decision', async () => {
    // First turn: the workflow pauses because a step requires approval
    executeWorkflowTurnMock.mockImplementation(async (sink: WorkflowEventSink) => {
      sink.emit({
        type: 'workflow_state',
        state: {
          runId: 'wf-run-2',
          threadId: 'thread-2',
          phase: 'preprocessing',
          status: 'running',
          currentNode: 'plan_step'
        }
      });
      sink.emit({
        type: 'tool_executed',
        call: {
          id: 'call-propose-2',
          tool: 'propose_transformation_step',
          args: { title: 'Drop outliers', intentType: 'drop_rows', datasetId: 'ds-1' }
        },
        result: {
          id: 'call-propose-2',
          tool: 'propose_transformation_step',
          output: {
            runId: 'prep-run-2',
            step: { stepId: 'step-2', status: 'pending', title: 'Drop outliers' },
            status: 'pending'
          }
        }
      });
      sink.emit({
        type: 'tool_executed',
        call: {
          id: 'call-validate-2',
          tool: 'validate_step_result',
          args: { runId: 'prep-run-2', stepId: 'step-2', requiresApproval: true }
        },
        result: {
          id: 'call-validate-2',
          tool: 'validate_step_result',
          output: {
            runId: 'prep-run-2',
            step: { stepId: 'step-2', status: 'awaiting_approval', requiresApproval: true },
            status: 'awaiting_approval',
            reasonCode: 'STEP_APPROVAL_REQUIRED'
          }
        }
      });
      sink.emit({
        type: 'workflow_state',
        state: {
          runId: 'wf-run-2',
          threadId: 'thread-2',
          phase: 'preprocessing',
          status: 'paused',
          currentNode: 'await_approval',
          pendingInputKind: 'approval',
          pauseReason: 'awaiting_approval'
        }
      });
    });

    const app = createTestApp();

    // First turn: start workflow, expect it to pause
    const firstResponse = await request(app)
      .post('/api/workflows/turns/stream')
      .send({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'ds-1',
        prompt: 'Drop outliers aggressively.'
      });

    expect(firstResponse.status).toBe(200);
    const firstEvents = parseEvents(firstResponse.text);
    const lastState = firstEvents
      .filter((e) => e.type === 'workflow_state')
      .pop() as { state: { status: string; pendingInputKind: string } } | undefined;
    expect(lastState?.state.status).toBe('paused');
    expect(lastState?.state.pendingInputKind).toBe('approval');

    // User approves via step-decision endpoint
    executePreprocessingToolMock.mockResolvedValue({
      output: {
        runId: 'prep-run-2',
        step: { stepId: 'step-2', status: 'applied', approvalDecision: 'approved' },
        status: 'applied'
      }
    });

    const approvalResponse = await request(app)
      .post('/api/preprocessing/step-decision')
      .send({
        projectId: 'project-1',
        runId: 'prep-run-2',
        stepId: 'step-2',
        approved: true,
        datasetId: 'ds-1'
      });

    expect(approvalResponse.status).toBe(200);
    expect(approvalResponse.body.tool).toBe('commit_transformation_step');
    expect(approvalResponse.body.output.status).toBe('applied');
    expect(executePreprocessingToolMock).toHaveBeenCalledWith(
      'project-1',
      'commit_transformation_step',
      expect.objectContaining({
        runId: 'prep-run-2',
        stepId: 'step-2',
        approved: true,
        approvalSource: 'user',
        datasetId: 'ds-1'
      })
    );
  });

  it('handles a pending-approval workflow where the user rejects the step with a reason', async () => {
    // Workflow pauses at await_approval
    executeWorkflowTurnMock.mockImplementation(async (sink: WorkflowEventSink) => {
      sink.emit({
        type: 'workflow_state',
        state: {
          runId: 'wf-run-3',
          threadId: 'thread-3',
          phase: 'preprocessing',
          status: 'paused',
          currentNode: 'await_approval',
          pendingInputKind: 'approval'
        }
      });
    });

    const app = createTestApp();

    // Start the workflow
    const startResponse = await request(app)
      .post('/api/workflows/turns/stream')
      .send({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'ds-1',
        prompt: 'Drop outliers aggressively.'
      });
    expect(startResponse.status).toBe(200);

    // User rejects via step-decision endpoint
    executePreprocessingToolMock.mockResolvedValue({
      output: {
        runId: 'prep-run-3',
        step: {
          stepId: 'step-3',
          status: 'failed',
          approvalDecision: 'rejected',
          decisionReason: 'This would remove critical records.'
        },
        status: 'failed'
      }
    });

    const rejectResponse = await request(app)
      .post('/api/preprocessing/step-decision')
      .send({
        projectId: 'project-1',
        runId: 'prep-run-3',
        stepId: 'step-3',
        approved: false,
        rejectionReason: 'This would remove critical records.'
      });

    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.tool).toBe('commit_transformation_step');
    expect(rejectResponse.body.output.status).toBe('failed');
    expect(rejectResponse.body.output.step.approvalDecision).toBe('rejected');
    expect(rejectResponse.body.output.step.decisionReason).toBe('This would remove critical records.');
    expect(executePreprocessingToolMock).toHaveBeenCalledWith(
      'project-1',
      'commit_transformation_step',
      expect.objectContaining({
        approved: false,
        rejectionReason: 'This would remove critical records.'
      })
    );
  });

  it('routes failed execution back into code-repair workflow on the next continue turn', async () => {
    let turnCount = 0;
    executeWorkflowTurnMock.mockImplementation(async (sink: WorkflowEventSink) => {
      turnCount += 1;

      if (turnCount === 1) {
        // First turn: propose step, generate code, execute (fails)
        sink.emit({
          type: 'workflow_state',
          state: {
            runId: 'wf-run-4',
            threadId: 'thread-4',
            phase: 'preprocessing',
            status: 'running',
            currentNode: 'plan_step'
          }
        });
        sink.emit({
          type: 'tool_executed',
          call: { id: 'call-propose-4', tool: 'propose_transformation_step', args: {} },
          result: {
            id: 'call-propose-4',
            tool: 'propose_transformation_step',
            output: { runId: 'prep-run-4', step: { stepId: 'step-4', status: 'pending' }, status: 'pending' }
          }
        });
        sink.emit({
          type: 'tool_executed',
          call: { id: 'call-exec-4', tool: 'execute_transformation_step', args: {} },
          result: {
            id: 'call-exec-4',
            tool: 'execute_transformation_step',
            output: { runId: 'prep-run-4', step: { stepId: 'step-4', status: 'failed' }, status: 'failed' },
            error: 'ZeroDivisionError'
          }
        });
        sink.emit({
          type: 'workflow_state',
          state: {
            runId: 'wf-run-4',
            threadId: 'thread-4',
            phase: 'preprocessing',
            status: 'paused',
            currentNode: 'write_code',
            pauseReason: 'execution_failed'
          }
        });
      } else if (turnCount === 2) {
        // Second turn: code repair, re-run cell
        sink.emit({
          type: 'workflow_state',
          state: {
            runId: 'wf-run-4',
            threadId: 'thread-4',
            phase: 'preprocessing',
            status: 'running',
            currentNode: 'write_code'
          }
        });
        sink.emit({
          type: 'tool_executed',
          call: { id: 'call-rerun-4', tool: 'run_cell', args: { cellId: 'cell-4' } },
          result: {
            id: 'call-rerun-4',
            tool: 'run_cell',
            output: { cellId: 'cell-4', status: 'success' }
          }
        });
        sink.emit({
          type: 'assistant_message',
          message: 'I will rerun the corrected notebook cell.'
        });
      }
    });

    const app = createTestApp();

    // First turn: execution fails
    const firstResponse = await request(app)
      .post('/api/workflows/turns/stream')
      .send({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'ds-1',
        prompt: 'Scale the age column.'
      });
    expect(firstResponse.status).toBe(200);

    const firstEvents = parseEvents(firstResponse.text);
    const failedToolEvent = firstEvents.find(
      (e) => e.type === 'tool_executed'
        && (e as { result?: { error?: string } }).result?.error === 'ZeroDivisionError'
    );
    expect(failedToolEvent).toBeDefined();

    const pausedState = firstEvents
      .filter((e) => e.type === 'workflow_state')
      .pop() as { state: { currentNode: string; pauseReason: string } } | undefined;
    expect(pausedState?.state.currentNode).toBe('write_code');
    expect(pausedState?.state.pauseReason).toBe('execution_failed');

    // Second turn: continue (code repair)
    const recoveryResponse = await request(app)
      .post('/api/workflows/turns/stream')
      .send({
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'ds-1',
        runId: 'wf-run-4',
        prompt: 'Continue preprocessing.'
      });
    expect(recoveryResponse.status).toBe(200);

    const recoveryEvents = parseEvents(recoveryResponse.text);
    const rerunEvent = recoveryEvents.find(
      (e) => e.type === 'tool_executed'
        && (e as { call: { tool: string } }).call.tool === 'run_cell'
    );
    expect(rerunEvent).toBeDefined();

    const recoveryMessage = recoveryEvents.find((e) => e.type === 'assistant_message');
    expect(recoveryMessage).toBeDefined();
    expect((recoveryMessage as { message: string }).message).toContain('rerun');
  });
});
