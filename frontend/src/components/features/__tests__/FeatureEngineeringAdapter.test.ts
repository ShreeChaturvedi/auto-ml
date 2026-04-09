import { beforeEach, describe, expect, it, vi } from 'vitest';

import { streamWorkflowTurn } from '@/lib/api/llm';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { createFeatureEngineeringAdapter } from '../FeatureEngineeringAdapter';

vi.mock('@/lib/api/llm', () => ({
  streamWorkflowTurn: vi.fn(async () => undefined)
}));

const mockFeatureStore = vi.hoisted(() => ({
  features: [] as Array<{
    id: string;
    projectId: string;
    featureName: string;
    method: string;
    sourceColumn: string;
    secondaryColumn?: string;
    enabled: boolean;
    code?: string;
  }>,
  featureSteps: {} as Record<string, { stepId: string; name: string; method: string; status: string; code?: string }>,
  setCurrentStage: vi.fn(),
  setFeatureStep: vi.fn(),
  setFeatureRunId: vi.fn(),
  upsertFeature: vi.fn(),
  clearDraft: vi.fn()
}));

const mockNotebookStore = vi.hoisted(() => ({
  activeNotebookId: 'notebook-1' as string | null,
  notebooks: [{ notebookId: 'notebook-1', metadata: { phase: 'feature-engineering' } }] as Array<{ notebookId: string; metadata?: Record<string, unknown> }>,
  createNotebook: vi.fn(),
  setActiveNotebook: vi.fn() as ReturnType<typeof vi.fn>
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
        features: mockFeatureStore.features,
        featureSteps: mockFeatureStore.featureSteps,
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
    mockFeatureStore.upsertFeature.mockReset();
    mockFeatureStore.clearDraft.mockReset();
    mockFeatureStore.features = [];
    mockFeatureStore.featureSteps = {};
    mockNotebookStore.activeNotebookId = 'notebook-1';
    mockNotebookStore.notebooks = [{ notebookId: 'notebook-1', metadata: { phase: 'feature-engineering' } }];
    mockNotebookStore.setActiveNotebook.mockReset();
    mockNotebookStore.setActiveNotebook.mockImplementation(async (notebookId: string) => {
      mockNotebookStore.activeNotebookId = notebookId;
    });
    mockNotebookStore.createNotebook.mockReset();
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
      payload: {
        message: 'Completed run.',
        featureRunId: 'feature-run-2'
      }
    });

    expect(mockFeatureStore.setFeatureRunId).toHaveBeenCalledWith('feature-run-2');
  });

  it('does not write the workflow runId into the feature store on workflow state updates', () => {
    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session'
    });

    adapter.onWorkflowStateUpdate?.({
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      phase: 'feature_engineering',
      currentNode: 'continue_feature_pipeline',
      status: 'running'
    });

    expect(mockFeatureStore.setFeatureRunId).not.toHaveBeenCalled();
    expect(useWorkflowSessionStore.getState().getSession('feature-session')).toMatchObject({
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1'
    });
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

  it('includes enabled feature ids in implementation prompts', async () => {
    mockFeatureStore.features = [
      {
        id: 'feat-signup-month',
        projectId: 'project-1',
        featureName: 'signup_month',
        method: 'extract_month',
        sourceColumn: 'signup_date',
        enabled: true
      },
      {
        id: 'feat-city-frequency',
        projectId: 'project-1',
        featureName: 'city_frequency',
        method: 'frequency_encode',
        sourceColumn: 'city',
        enabled: true
      }
    ];

    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session'
    });

    await adapter.buildRequest(
      'Implement the enabled features in the notebook.',
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
        prompt: expect.stringContaining(
          'Selected feature IDs to implement: feat-signup-month, feat-city-frequency\nEnabled features to implement: signup_month (extract_month on signup_date); city_frequency (frequency_encode on city)'
        )
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('uses the version-scoped notebook id instead of reusing the active preprocessing notebook', async () => {
    mockNotebookStore.activeNotebookId = 'preprocessing-notebook';
    mockNotebookStore.notebooks = [
      { notebookId: 'preprocessing-notebook', metadata: { phase: 'preprocessing', tabId: 'workbook-1' } },
      { notebookId: 'feature-notebook-1', metadata: { phase: 'feature-engineering', tabId: 'draft-1' } }
    ];

    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session',
      notebookId: 'feature-notebook-1',
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

    expect(mockNotebookStore.setActiveNotebook).toHaveBeenCalledWith('feature-notebook-1');
    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        notebookId: 'feature-notebook-1'
      }),
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('uses the draft-scoped notebook id instead of reusing an unrelated active notebook', async () => {
    mockNotebookStore.activeNotebookId = 'preprocessing-notebook-1';
    mockNotebookStore.notebooks = [
      { notebookId: 'preprocessing-notebook-1', metadata: { phase: 'preprocessing' } },
      { notebookId: 'feature-notebook-2', metadata: { phase: 'feature-engineering', tabId: 'draft-2' } }
    ];

    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session',
      notebookId: 'feature-notebook-2'
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

    expect(mockNotebookStore.setActiveNotebook).toHaveBeenCalledWith('feature-notebook-2');
    expect(mockNotebookStore.createNotebook).not.toHaveBeenCalled();
    expect(streamWorkflowTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        notebookId: 'feature-notebook-2'
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

  it('maps lifecycle tool results to semantic step statuses', () => {
    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session'
    });

    adapter.toolRegistry.register_feature.onResult?.(
      {
        id: 'call-register-1',
        tool: 'register_feature',
        args: {
          featureId: 'feat-2',
          featureName: 'division_lag_7d',
          method: 'lag_transform'
        }
      },
      {
        id: 'call-register-1',
        tool: 'register_feature',
        output: {
          featureId: 'feat-2',
          status: 'ok'
        }
      }
    );

    expect(mockFeatureStore.setFeatureStep).toHaveBeenCalledWith(
      'feat-2',
      expect.objectContaining({
        stepId: 'feat-2',
        status: 'registered'
      })
    );
  });

  it('keeps project ownership when register_feature result omits projectId', () => {
    mockFeatureStore.features = [
      {
        id: 'feat-2',
        projectId: 'project-1',
        featureName: 'division_lag_7d',
        method: 'lag_transform',
        sourceColumn: 'CF EE Division',
        enabled: true
      }
    ];

    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session'
    });

    adapter.toolRegistry.register_feature.onResult?.(
      {
        id: 'call-register-2',
        tool: 'register_feature',
        args: {
          featureId: 'feat-2',
          featureName: 'division_lag_7d',
          method: 'lag_transform'
        }
      },
      {
        id: 'call-register-2',
        tool: 'register_feature',
        output: {
          featureId: 'feat-2',
          status: 'ok'
        }
      }
    );

    expect(mockFeatureStore.upsertFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'feat-2',
        projectId: 'project-1',
        enabled: true
      })
    );
  });

  it('preserves step.code from materialize_feature_code when register_feature fires (BLOCKER F1)', () => {
    // Pre-populate featureSteps with code persisted earlier by materialize_feature_code
    mockFeatureStore.featureSteps = {
      'feat-ratio': {
        stepId: 'feat-ratio',
        name: 'Department Usage Share',
        method: 'ratio',
        status: 'validated',
        code: "df['department_usage_share'] = df.groupby('CF EE Division')['usage_count'].transform(lambda x: x / x.sum())"
      }
    };

    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session'
    });

    // register_feature tool call has NO code arg (not in tool schema). Without
    // the fix, setFeatureStep would overwrite step.code with undefined.
    adapter.toolRegistry.register_feature.onResult?.(
      {
        id: 'call-register-3',
        tool: 'register_feature',
        args: { featureId: 'feat-ratio', approved: true }
      },
      {
        id: 'call-register-3',
        tool: 'register_feature',
        output: { featureId: 'feat-ratio', status: 'ok' }
      }
    );

    // setFeatureStep should have been called with the PRESERVED code, not undefined
    expect(mockFeatureStore.setFeatureStep).toHaveBeenCalledWith(
      'feat-ratio',
      expect.objectContaining({
        stepId: 'feat-ratio',
        code: "df['department_usage_share'] = df.groupby('CF EE Division')['usage_count'].transform(lambda x: x / x.sum())"
      })
    );
  });

  it('copies step.code into the FeatureSpec on register_feature upsert (Bug B primary propagation)', () => {
    mockFeatureStore.featureSteps = {
      'feat-ratio': {
        stepId: 'feat-ratio',
        name: 'Department Usage Share',
        method: 'ratio',
        status: 'validated',
        code: "df['department_usage_share'] = df.groupby('CF EE Division')['usage_count'].transform(lambda x: x / x.sum())"
      }
    };
    // Existing feature from suggestion toggle (has columns but no code yet)
    mockFeatureStore.features = [
      {
        id: 'feat-ratio',
        projectId: 'project-1',
        featureName: 'Department Usage Share',
        method: 'ratio',
        sourceColumn: 'CF EE Division',
        secondaryColumn: 'CF EE Department',
        enabled: true
      }
    ];

    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session'
    });

    adapter.toolRegistry.register_feature.onResult?.(
      {
        id: 'call-register-4',
        tool: 'register_feature',
        args: { featureId: 'feat-ratio', approved: true }
      },
      {
        id: 'call-register-4',
        tool: 'register_feature',
        output: { featureId: 'feat-ratio', status: 'ok' }
      }
    );

    // upsertFeature should be called with BOTH the code AND the secondaryColumn preserved
    expect(mockFeatureStore.upsertFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'feat-ratio',
        code: "df['department_usage_share'] = df.groupby('CF EE Division')['usage_count'].transform(lambda x: x / x.sum())",
        secondaryColumn: 'CF EE Department'
      })
    );
  });

  it('replaces placeholder feature descriptions with the register rationale', () => {
    mockFeatureStore.features = [
      {
        id: 'feat-division-missing',
        projectId: 'project-1',
        featureName: 'CF_EE_Division_missing_flag',
        method: 'missing_indicator',
        sourceColumn: 'CF EE Division',
        description: 'Feature proposed — awaiting user review',
        enabled: true
      }
    ];

    const adapter = createFeatureEngineeringAdapter({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      targetColumn: 'churn',
      datasetFiles: [],
      documentFiles: [],
      sessionKey: 'feature-session'
    });

    adapter.toolRegistry.register_feature.onResult?.(
      {
        id: 'call-register-5',
        tool: 'register_feature',
        args: {
          featureId: 'feat-division-missing',
          rationale: 'Create a binary feature that marks rows where CF EE Division is missing or blank.'
        }
      },
      {
        id: 'call-register-5',
        tool: 'register_feature',
        output: {
          featureId: 'feat-division-missing',
          status: 'ok'
        }
      }
    );

    expect(mockFeatureStore.upsertFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'feat-division-missing',
        description: 'Create a binary feature that marks rows where CF EE Division is missing or blank.'
      })
    );
  });
});
