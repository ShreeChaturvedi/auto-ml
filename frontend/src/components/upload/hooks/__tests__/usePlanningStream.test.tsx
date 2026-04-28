import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlanningStream } from '../usePlanningStream';
import type { LlmStreamEvent } from '@/lib/api/llm';
import type { WorkflowState } from '@/types/workflow';

const {
  interruptWorkflowRunMock,
  listWorkflowRunsMock,
  streamOnboardingPlanMock
} = vi.hoisted(() => ({
  interruptWorkflowRunMock: vi.fn(),
  listWorkflowRunsMock: vi.fn(),
  streamOnboardingPlanMock: vi.fn()
}));

vi.mock('@/lib/api/llm', () => ({
  interruptWorkflowRun: (...args: unknown[]) => interruptWorkflowRunMock(...args),
  listWorkflowRuns: (...args: unknown[]) => listWorkflowRunsMock(...args),
  streamOnboardingPlan: (...args: unknown[]) => streamOnboardingPlanMock(...args)
}));

function buildRunningState(runId = 'onboarding-run-1'): WorkflowState {
  return {
    runId,
    threadId: `${runId}-thread`,
    phase: 'onboarding',
    currentNode: 'bootstrap_context',
    status: 'running'
  };
}

function createAbortableStream(options?: {
  initialState?: WorkflowState;
  onEvent?: (event: (event: LlmStreamEvent) => void) => void;
}) {
  return async (
    _request: unknown,
    emitEvent: (event: LlmStreamEvent) => void,
    signal?: AbortSignal
  ) => {
    if (options?.initialState) {
      emitEvent({ type: 'workflow_state', state: options.initialState });
    }
    options?.onEvent?.(emitEvent);

    await new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      signal?.addEventListener('abort', () => resolve(), { once: true });
    });
  };
}

function createProps() {
  return {
    projectId: 'project-1',
    selectedModel: 'gpt-5.4',
    reasoningEffort: 'high' as const,
    currentRound: 0,
    setCurrentRound: vi.fn(),
    setMessages: vi.fn(),
    setIsStreaming: vi.fn(),
    handleStreamEvent: vi.fn(() => false),
    completeThinking: vi.fn(),
    closeTextStream: vi.fn(),
    currentTextIdRef: { current: null },
    getAnswerHistory: () => [],
    onStreamComplete: vi.fn()
  };
}

describe('usePlanningStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    interruptWorkflowRunMock.mockResolvedValue({ run: { runId: 'onboarding-run-1' } });
    listWorkflowRunsMock.mockResolvedValue({ projectId: 'project-1', phase: 'onboarding', runs: [] });
  });

  it('interrupts the active onboarding run when the client aborts the stream', async () => {
    streamOnboardingPlanMock.mockImplementation(
      createAbortableStream({ initialState: buildRunningState('onboarding-run-1') })
    );

    const { result } = renderHook(() => usePlanningStream(createProps()));

    let streamPromise: Promise<void>;
    await act(async () => {
      streamPromise = result.current.requestStream('Plan this dataset');
      await Promise.resolve();
    });

    await act(async () => {
      result.current.controllerRef.current?.abort();
      await streamPromise;
    });

    await waitFor(() => {
      expect(interruptWorkflowRunMock).toHaveBeenCalledWith(
        'onboarding-run-1',
        'Onboarding plan stream aborted by client.'
      );
    });
    expect(listWorkflowRunsMock).not.toHaveBeenCalled();
  });

  it('falls back to backend workflow discovery when a stream is replaced before the run id is observed', async () => {
    streamOnboardingPlanMock
      .mockImplementationOnce(createAbortableStream())
      .mockImplementationOnce(async (_request: unknown, emitEvent: (event: LlmStreamEvent) => void) => {
        emitEvent({ type: 'workflow_state', state: buildRunningState('onboarding-run-2') });
        emitEvent({ type: 'done' });
      });

    listWorkflowRunsMock.mockResolvedValue({
      projectId: 'project-1',
      phase: 'onboarding',
      runs: [buildRunningState('orphaned-onboarding-run')]
    });

    const { result } = renderHook(() => usePlanningStream(createProps()));

    let firstStreamPromise: Promise<void>;
    await act(async () => {
      firstStreamPromise = result.current.requestStream('First attempt');
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.requestStream('Second attempt');
      await firstStreamPromise;
    });

    await waitFor(() => {
      expect(listWorkflowRunsMock).toHaveBeenCalledWith('project-1', 'onboarding');
      expect(interruptWorkflowRunMock).toHaveBeenCalledWith(
        'orphaned-onboarding-run',
        'Onboarding plan request replaced by a new turn.'
      );
    });
  });

  it('does not interrupt paused onboarding runs after the stream has already paused cleanly', async () => {
    streamOnboardingPlanMock.mockImplementation(async (_request: unknown, emitEvent: (event: LlmStreamEvent) => void) => {
      emitEvent({ type: 'workflow_state', state: buildRunningState('onboarding-run-3') });
      emitEvent({
        type: 'workflow_pause',
        reason: 'awaiting_user_input',
        state: {
          ...buildRunningState('onboarding-run-3'),
          currentNode: 'await_user_input',
          status: 'paused',
          mode: 'await_input'
        }
      });
      emitEvent({ type: 'done' });
    });

    const { result, unmount } = renderHook(() => usePlanningStream(createProps()));

    await act(async () => {
      await result.current.requestStream('Help me define the goal');
    });

    unmount();

    expect(interruptWorkflowRunMock).not.toHaveBeenCalled();
    expect(listWorkflowRunsMock).not.toHaveBeenCalled();
  });
});
