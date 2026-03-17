import { beforeEach, describe, expect, it, vi } from 'vitest';

import { streamWorkflowTurn } from '@/lib/api/llm';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { createTrainingAdapter } from '../TrainingAdapter';

vi.mock('@/lib/api/llm', () => ({
  streamWorkflowTurn: vi.fn(async () => undefined)
}));

describe('TrainingAdapter', () => {
  beforeEach(() => {
    useWorkflowSessionStore.setState({ sessions: {} });
  });

  it('reuses the persisted workflow session when building requests', async () => {
    useWorkflowSessionStore.getState().updateSession('training-session', {
      runId: 'training-run-1',
      threadId: 'training-thread-1',
      phase: 'training',
      currentNode: 'plan_training_workflow',
      status: 'running'
    });

    const adapter = createTrainingAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      featureSummary: 'Validated categorical and scaling pipeline.',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'training-session'
    });

    await adapter.buildRequest(
      'Train a baseline model.',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      {
        model: 'gpt-5.4',
        reasoningEffort: 'medium'
      }
    );

    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'training',
        runId: 'training-run-1',
        threadId: 'training-thread-1'
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });
});
