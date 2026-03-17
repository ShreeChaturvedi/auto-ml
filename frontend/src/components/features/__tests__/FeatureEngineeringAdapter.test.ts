import { beforeEach, describe, expect, it, vi } from 'vitest';

import { streamWorkflowTurn } from '@/lib/api/llm';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { createFeatureEngineeringAdapter } from '../FeatureEngineeringAdapter';

vi.mock('@/lib/api/llm', () => ({
  streamWorkflowTurn: vi.fn(async () => undefined)
}));

describe('FeatureEngineeringAdapter', () => {
  beforeEach(() => {
    useWorkflowSessionStore.setState({ sessions: {} });
  });

  it('reuses the persisted workflow session when building requests', async () => {
    useWorkflowSessionStore.getState().updateSession('feature-session', {
      runId: 'feature-run-1',
      threadId: 'feature-thread-1',
      phase: 'feature_engineering',
      currentNode: 'plan_feature_pipeline',
      status: 'running'
    });

    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session'
    });

    await adapter.buildRequest(
      'Propose leakage-safe features.',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      {
        model: 'gpt-5.4',
        reasoningEffort: 'high'
      }
    );

    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'feature_engineering',
        runId: 'feature-run-1',
        threadId: 'feature-thread-1'
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });
});
