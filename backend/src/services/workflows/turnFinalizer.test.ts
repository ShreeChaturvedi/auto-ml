import { describe, expect, it } from 'vitest';

import type { WorkflowGraphState } from './graphState.js';
import { InMemoryWorkflowRepository } from './repository/inMemory.js';
import { finalizeWorkflowTurn, persistNewToolExecutionEvents } from './turnFinalizer.js';
import type { WorkflowRunState, WorkflowTurnRequest } from './types.js';

describe('finalizeWorkflowTurn', () => {
  it('includes the workflow runId in emitted artifact updates', async () => {
    const repository = new InMemoryWorkflowRepository();
    const emitted: unknown[] = [];
    const sink = {
      emit(event: unknown) {
        emitted.push(event);
      },
      isOpen() {
        return true;
      }
    };

    const run: WorkflowRunState = {
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      projectId: 'project-1',
      phase: 'feature_engineering',
      status: 'completed',
      currentNode: 'summarize',
      revision: 2,
      retryBudget: 0,
      repairAttemptCount: 0,
      createdAt: new Date('2026-03-23T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-23T00:00:00.000Z').toISOString()
    };

    const turn: WorkflowTurnRequest = {
      projectId: 'project-1',
      phase: 'feature_engineering'
    };

    const result = {
      turn,
      run,
      request: null,
      latestMessage: 'Feature pipeline completed.',
      pendingToolCalls: [],
      toolCallHistory: [],
      toolResultHistory: [],
      askUserPayload: null,
      planExitPayload: {
        planName: 'Leakage-safe plan',
        planMarkdown: '- profile data\n- create features'
      },
      uiPayload: null,
      controllerSummary: null,
      iteration: 0,
      nextStep: 'complete',
      pendingInputKind: null,
      pauseReason: null,
      errorMessage: null,
      errorCode: null
    } satisfies WorkflowGraphState;

    const savedState = {
      ...run,
      mode: 'completed' as const
    };

    await finalizeWorkflowTurn(
      repository,
      sink,
      run,
      turn,
      result,
      savedState,
      undefined,
      undefined
    );

    const artifactEvents = emitted.filter((event): event is { type: 'artifact_updated'; artifact: { runId?: string } } => {
      return (
        typeof event === 'object'
        && event !== null
        && (event as { type?: unknown }).type === 'artifact_updated'
      );
    });

    expect(artifactEvents).not.toHaveLength(0);
    expect(artifactEvents.every((event) => event.artifact.runId === run.runId)).toBe(true);
  });
});

describe('persistNewToolExecutionEvents', () => {
  it('dedupes repeated tool call ids before writing run events', async () => {
    const repository = new InMemoryWorkflowRepository();
    const run = await repository.createRun({
      runId: 'workflow-run-dedupe',
      threadId: 'workflow-thread-dedupe',
      projectId: 'project-1',
      phase: 'feature_engineering',
      status: 'running',
      currentNode: 'continue_feature_pipeline',
      retryBudget: 0,
      repairAttemptCount: 0
    });

    const duplicatedCall = {
      id: 'wf-call-1',
      tool: 'propose_feature' as const,
      args: { featureName: 'api_calls_log1p' }
    };
    const duplicatedResult = {
      id: 'wf-call-1',
      tool: 'propose_feature' as const,
      output: { featureId: 'feat-1', status: 'proposed' }
    };

    await persistNewToolExecutionEvents(
      repository,
      run,
      { toolCalls: [], toolResults: [] },
      {
        toolCallHistory: [duplicatedCall, duplicatedCall],
        toolResultHistory: [duplicatedResult, duplicatedResult]
      } as WorkflowGraphState
    );

    const snapshot = await repository.getRun(run.runId);
    const toolEvents = snapshot?.events.filter((event) => event.eventType === 'tool_executed') ?? [];

    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0].payload).toMatchObject({
      call: {
        id: 'wf-call-1',
        tool: 'propose_feature'
      },
      result: {
        id: 'wf-call-1',
        tool: 'propose_feature'
      }
    });
  });

  it('does not rewrite tool executions that already exist in previous history', async () => {
    const repository = new InMemoryWorkflowRepository();
    const run = await repository.createRun({
      runId: 'workflow-run-previous-history',
      threadId: 'workflow-thread-previous-history',
      projectId: 'project-1',
      phase: 'feature_engineering',
      status: 'running',
      currentNode: 'continue_feature_pipeline',
      retryBudget: 0,
      repairAttemptCount: 0
    });

    const priorCall = {
      id: 'wf-call-prior',
      tool: 'propose_feature' as const,
      args: { featureName: 'prior_feature' }
    };
    const newCall = {
      id: 'wf-call-new',
      tool: 'propose_feature' as const,
      args: { featureName: 'new_feature' }
    };

    await persistNewToolExecutionEvents(
      repository,
      run,
      {
        toolCalls: [priorCall],
        toolResults: [{ id: priorCall.id, tool: priorCall.tool, output: { featureId: 'feat-prior' } }]
      },
      {
        toolCallHistory: [priorCall, newCall],
        toolResultHistory: [
          { id: priorCall.id, tool: priorCall.tool, output: { featureId: 'feat-prior' } },
          { id: newCall.id, tool: newCall.tool, output: { featureId: 'feat-new' } }
        ]
      } as WorkflowGraphState
    );

    const snapshot = await repository.getRun(run.runId);
    const toolEvents = snapshot?.events.filter((event) => event.eventType === 'tool_executed') ?? [];

    expect(toolEvents).toHaveLength(1);
    expect((toolEvents[0].payload.call as { id?: string }).id).toBe('wf-call-new');
  });
});
