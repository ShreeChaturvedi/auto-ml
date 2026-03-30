import { beforeEach, describe, expect, it, vi } from 'vitest';

import { streamWorkflowTurn } from '@/lib/api/llm';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { createFeatureEngineeringAdapter } from '../FeatureEngineeringAdapter';

vi.mock('@/lib/api/llm', () => ({
  streamWorkflowTurn: vi.fn(async () => undefined)
}));

const mockFeatureStore = vi.hoisted(() => ({
  setCurrentStage: vi.fn(),
  setFeatureStep: vi.fn(),
  setFeatureRunId: vi.fn(),
  upsertFeature: vi.fn(),
  clearDraft: vi.fn()
}));

const mockNotebookStore = vi.hoisted(() => ({
  activeNotebookId: 'notebook-1' as string | null,
  notebooks: [{ notebookId: 'notebook-1' }] as Array<{ notebookId: string }>,
  createNotebook: vi.fn(),
  setActiveNotebook: vi.fn(async () => undefined)
}));

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector({
      setCurrentStage: mockFeatureStore.setCurrentStage,
      setFeatureStep: mockFeatureStore.setFeatureStep,
      setFeatureRunId: mockFeatureStore.setFeatureRunId,
      clearDraft: mockFeatureStore.clearDraft
    }),
    {
      getState: () => ({
        features: [],
        featureSteps: {},
        setCurrentStage: mockFeatureStore.setCurrentStage,
        setFeatureStep: mockFeatureStore.setFeatureStep,
        setFeatureRunId: mockFeatureStore.setFeatureRunId,
        upsertFeature: mockFeatureStore.upsertFeature,
        clearDraft: mockFeatureStore.clearDraft
      })
    }
  )
}));

vi.mock('@/stores/notebookStore', () => ({
  useNotebookStore: {
    getState: () => ({
      activeNotebookId: mockNotebookStore.activeNotebookId,
      notebooks: mockNotebookStore.notebooks,
      createNotebook: mockNotebookStore.createNotebook,
      setActiveNotebook: mockNotebookStore.setActiveNotebook
    })
  }
}));

describe('FeatureEngineeringAdapter', () => {
  beforeEach(() => {
    useWorkflowSessionStore.setState({ sessions: {} });
    mockFeatureStore.setCurrentStage.mockReset();
    mockFeatureStore.setFeatureStep.mockReset();
    mockFeatureStore.setFeatureRunId.mockReset();
    mockFeatureStore.clearDraft.mockReset();
    mockNotebookStore.activeNotebookId = 'notebook-1';
    mockNotebookStore.notebooks = [{ notebookId: 'notebook-1' }];
    mockNotebookStore.createNotebook.mockReset();
    mockNotebookStore.setActiveNotebook.mockReset();
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
      sessionKey: 'feature-session',
      versionNotebookId: 'notebook-1'
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
        threadId: 'feature-thread-1',
        notebookId: 'notebook-1'
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('captures the runId from artifact updates', () => {
    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session'
    });

    adapter.onWorkflowArtifactUpdate?.({
      artifactId: 'artifact-1',
      runId: 'workflow-run-2',
      kind: 'summary',
      payload: { featureRunId: 'feature-run-2', message: 'Completed run.' }
    });

    expect(mockFeatureStore.setFeatureRunId).toHaveBeenCalledWith('feature-run-2');
  });

  it('creates a notebook before starting feature engineering when none is active', async () => {
    mockNotebookStore.activeNotebookId = null;
    mockNotebookStore.notebooks = [];
    mockNotebookStore.createNotebook.mockResolvedValue({
      notebookId: 'created-notebook-1'
    });

    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session',
      notebookName: 'Draft Pipeline v1',
      notebookMetadata: {
        phase: 'feature-engineering',
        tabId: 'draft-1',
        tabName: 'Draft Pipeline v1'
      }
    });

    await adapter.buildRequest(
      'Create new features.',
      undefined,
      undefined,
      () => undefined,
      new AbortController().signal,
      {
        model: 'gpt-5.4',
        reasoningEffort: 'high'
      }
    );

    expect(mockNotebookStore.createNotebook).toHaveBeenCalledWith(
      'Draft Pipeline v1',
      expect.objectContaining({
        phase: 'feature-engineering',
        tabId: 'draft-1'
      })
    );
    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        notebookId: 'created-notebook-1'
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('throws a clear error when a notebook cannot be created', async () => {
    mockNotebookStore.activeNotebookId = null;
    mockNotebookStore.notebooks = [];
    mockNotebookStore.createNotebook.mockResolvedValue(null);

    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session'
    });

    await expect(
      adapter.buildRequest(
        'Create new features.',
        undefined,
        undefined,
        () => undefined,
        new AbortController().signal,
        {
          model: 'gpt-5.4',
          reasoningEffort: 'high'
        }
      )
    ).rejects.toThrow('Feature engineering could not start because no notebook is available for execution.');
  });

  it('captures tool errors in the feature lifecycle store', () => {
    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session'
    });

    adapter.toolRegistry.execute_feature.onResult?.(
      {
        id: 'call-1',
        tool: 'execute_feature',
        args: {
          featureId: 'feat-1',
          featureName: 'log_salary',
          method: 'python'
        }
      },
      {
        id: 'call-1',
        tool: 'execute_feature',
        error: 'Notebook cell execution failed'
      }
    );

    expect(mockFeatureStore.setFeatureStep).toHaveBeenCalledWith(
      'feat-1',
      expect.objectContaining({
        stepId: 'feat-1',
        status: 'error',
        error: 'Notebook cell execution failed'
      })
    );
  });
});
