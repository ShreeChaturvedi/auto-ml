import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '../../lib/api/client';
import { getPreprocessingRunSnapshot } from '../../lib/api/llm';
import type { PreprocessingRunSnapshot } from '../../types/preprocessing';
import { usePreprocessingStore } from '../preprocessingStore';

vi.mock('../../lib/api/client', () => ({
  ApiError: class ApiError extends Error {
    readonly status: number;
    readonly payload: unknown;

    constructor(message: string, status: number, payload: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.payload = payload;
    }
  },
  apiRequest: vi.fn(),
  getApiBaseUrl: vi.fn(() => 'http://localhost:4000/api')
}));

vi.mock('../../lib/api/llm', () => ({
  getPreprocessingRunSnapshot: vi.fn()
}));

const apiRequestMock = vi.mocked(apiRequest);
const getPreprocessingRunSnapshotMock = vi.mocked(getPreprocessingRunSnapshot);

function resetPreprocessingStore() {
  usePreprocessingStore.setState({
    activeProjectId: null,
    tables: [],
    selectedDatasetId: null,
    runId: null,
    nextRunCellMode: 'continue',
    latestCheckpointId: null,
    assistantMessages: [],
    timeline: [],
    stepBindings: {},
    replayReport: null,
    controllerSummary: null,
    isLoadingTables: false,
    error: null
  });
}

function buildSnapshot(): PreprocessingRunSnapshot {
  return {
    runId: 'prep-run-1',
    projectId: 'project-1',
    activeDatasetId: 'dataset-1',
    derivedDatasetIds: [],
    checkpoints: [],
    events: [],
    createdAt: '2026-02-27T12:00:00.000Z',
    updatedAt: '2026-02-27T12:05:00.000Z',
    steps: [
      {
        stepId: 'step-1',
        title: 'Normalize income',
        rationale: 'Scale heavy-tailed values',
        intentType: 'scale_numeric',
        status: 'applied',
        code: 'df["income"] = (df["income"] - df["income"].mean()) / df["income"].std()',
        codeHash: 'abc123',
        version: 2,
        cellIds: ['cell-1'],
        requiresApproval: false,
        validation: {
          rowCountBefore: 100,
          rowCountAfter: 100,
          schemaDrift: false
        },
        createdAt: '2026-02-27T12:01:00.000Z',
        updatedAt: '2026-02-27T12:03:00.000Z'
      }
    ]
  };
}

describe('preprocessingStore hydration', () => {
  beforeEach(() => {
    resetPreprocessingStore();
    apiRequestMock.mockReset();
    getPreprocessingRunSnapshotMock.mockReset();
  });

  it('hydrates timeline and bindings from snapshot payload', () => {
    const snapshot = buildSnapshot();

    usePreprocessingStore.getState().hydrateRunSnapshot(snapshot);

    const state = usePreprocessingStore.getState();
    expect(state.runId).toBe('prep-run-1');
    expect(state.selectedDatasetId).toBe('dataset-1');
    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0]).toMatchObject({
      stepId: 'step-1',
      runId: 'prep-run-1',
      title: 'Normalize income',
      status: 'applied',
      codeHash: 'abc123',
      cellIds: ['cell-1']
    });
    expect(state.stepBindings['step-1']).toMatchObject({
      stepId: 'step-1',
      cellIds: ['cell-1'],
      codeHash: 'abc123',
      version: 2
    });
    expect(state.controllerSummary).toBeNull();
  });

  it('clears stale controller state when hydrating an authoritative run snapshot', () => {
    usePreprocessingStore.setState({
      controllerSummary: {
        threadId: 'prep-thread:stale',
        turnMode: 'action_required',
        currentNode: 'generate_code',
        allowedTools: ['materialize_step_code'],
        allowTextResponse: false,
        requireToolCall: true,
        pendingApproval: false,
        updatedAt: '2026-03-13T00:00:00.000Z'
      }
    });

    usePreprocessingStore.getState().hydrateRunSnapshot(buildSnapshot());

    expect(usePreprocessingStore.getState().controllerSummary).toBeNull();
  });

  it('applies tab snapshots with a clean controller and continuity state', () => {
    usePreprocessingStore.setState({
      nextRunCellMode: 'restart_from_original',
      latestCheckpointId: 'ckpt-stale',
      controllerSummary: {
        threadId: 'prep-thread:stale',
        turnMode: 'action_required',
        currentNode: 'write_code',
        allowedTools: ['run_cell'],
        allowTextResponse: false,
        requireToolCall: true,
        pendingApproval: false,
        updatedAt: '2026-03-13T00:00:00.000Z'
      },
      error: 'stale error'
    });

    usePreprocessingStore.getState().applyTabSnapshot({
      selectedDatasetId: 'dataset-2',
      runId: 'prep-run-2',
      timeline: [],
      stepBindings: {},
      replayReport: null
    });

    const state = usePreprocessingStore.getState();
    expect(state.selectedDatasetId).toBe('dataset-2');
    expect(state.runId).toBe('prep-run-2');
    expect(state.nextRunCellMode).toBe('continue');
    expect(state.latestCheckpointId).toBeNull();
    expect(state.controllerSummary).toBeNull();
    expect(state.error).toBeNull();
  });

  it('consumes restart run-cell mode once and resets to continue', () => {
    usePreprocessingStore.getState().setNextRunCellMode('restart_from_original');

    const first = usePreprocessingStore.getState().consumeRunCellMode();
    const second = usePreprocessingStore.getState().consumeRunCellMode();

    expect(first).toBe('restart_from_original');
    expect(second).toBe('continue');
  });

  it('rejects selecting a dataset that is not available in the project', () => {
    usePreprocessingStore.setState({
      tables: [
        {
          datasetId: 'dataset-1',
          name: 'dataset_1',
          filename: 'dataset.csv',
          sizeBytes: 123
        }
      ],
      controllerSummary: {
        threadId: 'prep-thread:test',
        turnMode: 'action_required',
        currentNode: 'generate_code',
        allowedTools: ['materialize_step_code'],
        allowTextResponse: false,
        requireToolCall: true,
        pendingApproval: false,
        updatedAt: '2026-03-13T00:00:00.000Z'
      }
    });

    usePreprocessingStore.getState().selectDataset('missing-dataset');

    const state = usePreprocessingStore.getState();
    expect(state.selectedDatasetId).toBeNull();
    expect(state.controllerSummary).not.toBeNull();
    expect(state.error).toContain('Selected dataset is unavailable');
  });

  it('clears stale run state when selecting a valid dataset', () => {
    usePreprocessingStore.setState({
      tables: [
        {
          datasetId: 'dataset-1',
          name: 'dataset_1',
          filename: 'dataset.csv',
          sizeBytes: 123
        }
      ],
      runId: 'prep-run-1',
      nextRunCellMode: 'restart_from_original',
      latestCheckpointId: 'ckpt-1',
      timeline: [
        {
          id: 'evt-1',
          runId: 'prep-run-1',
          stepId: 'step-1',
          toolName: 'propose_transformation_step',
          title: 'Scale',
          status: 'pending',
          requiresApproval: false,
          cellIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ],
      controllerSummary: {
        threadId: 'prep-thread:test',
        turnMode: 'action_required',
        currentNode: 'generate_code',
        allowedTools: ['materialize_step_code'],
        allowTextResponse: false,
        requireToolCall: true,
        pendingApproval: false,
        updatedAt: '2026-03-13T00:00:00.000Z'
      }
    });

    usePreprocessingStore.getState().selectDataset('dataset-1');

    const state = usePreprocessingStore.getState();
    expect(state.selectedDatasetId).toBe('dataset-1');
    expect(state.runId).toBeNull();
    expect(state.nextRunCellMode).toBe('continue');
    expect(state.latestCheckpointId).toBeNull();
    expect(state.timeline).toEqual([]);
    expect(state.controllerSummary).toBeNull();
  });

  it('clears controller summary when the active run is cleared', () => {
    usePreprocessingStore.setState({
      runId: 'prep-run-1',
      controllerSummary: {
        threadId: 'prep-thread:test',
        turnMode: 'action_required',
        currentNode: 'generate_code',
        allowedTools: ['materialize_step_code'],
        allowTextResponse: false,
        requireToolCall: true,
        pendingApproval: false,
        updatedAt: '2026-03-13T00:00:00.000Z'
      }
    });

    usePreprocessingStore.getState().clearRun();

    expect(usePreprocessingStore.getState().runId).toBeNull();
    expect(usePreprocessingStore.getState().controllerSummary).toBeNull();
  });

  it('does not flag divergence when cell content hash matches backend codeHash', async () => {
    const content = 'df["Usage"] = df["Usage"].fillna(0)';
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    const matchingCodeHash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 24);

    usePreprocessingStore.setState({
      timeline: [
        {
          id: 'evt-step-1',
          runId: 'prep-run-1',
          stepId: 'step-1',
          toolName: 'snapshot_hydration',
          title: 'Scale usage',
          status: 'applied',
          code: content,
          codeHash: matchingCodeHash,
          version: 1,
          cellIds: ['cell-1'],
          requiresApproval: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ],
      stepBindings: {
        'step-1': {
          stepId: 'step-1',
          cellIds: ['cell-1'],
          codeHash: matchingCodeHash,
          version: 1,
          lastSyncedAt: Date.now()
        }
      }
    });

    await usePreprocessingStore.getState().syncDivergence([
      {
        cellId: 'cell-1',
        notebookId: 'nb-1',
        cellType: 'code',
        content,
        position: 0,
        metadata: {},
        executionCount: 0,
        executionStatus: 'idle',
        isDirty: false,
        output: [],
        outputRefs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);

    expect(usePreprocessingStore.getState().timeline[0].status).toBe('applied');
  });

  it('hydrates from backend snapshot API by run id', async () => {
    const snapshot = buildSnapshot();
    getPreprocessingRunSnapshotMock.mockResolvedValue({ run: snapshot });

    await usePreprocessingStore.getState().hydrateRunById('project-1', 'prep-run-1');

    expect(getPreprocessingRunSnapshotMock).toHaveBeenCalledWith('prep-run-1', 'project-1');
    const state = usePreprocessingStore.getState();
    expect(state.runId).toBe('prep-run-1');
    expect(state.timeline).toHaveLength(1);
    expect(state.error).toBeNull();
  });

  it('surfaces backend hydration errors when snapshot fetch fails', async () => {
    getPreprocessingRunSnapshotMock.mockRejectedValue(new Error('snapshot fetch failed'));

    await usePreprocessingStore.getState().hydrateRunById('project-1', 'prep-run-1');

    expect(usePreprocessingStore.getState().error).toContain('snapshot fetch failed');
  });

  it('uses backend as source of truth when local pre-check passes but backend fails', async () => {
    apiRequestMock.mockResolvedValue({
      output: {
        isError: true,
        reasonCode: 'REPLAY_INCOMPATIBLE_DATASET',
        compatibilityIssues: [
          {
            stepId: 'step-1',
            column: 'income',
            issue: 'missing_column'
          }
        ]
      }
    });

    usePreprocessingStore.setState({
      runId: 'prep-run-1',
      latestCheckpointId: 'ckpt-1',
      selectedDatasetId: 'dataset-1',
      tables: [
        {
          datasetId: 'dataset-1',
          name: 'dataset_1',
          filename: 'dataset.csv',
          sizeBytes: 123,
          columns: [{ name: 'income', dtype: 'float' }]
        }
      ],
      timeline: [
        {
          id: 'evt-1',
          runId: 'prep-run-1',
          stepId: 'step-1',
          toolName: 'snapshot_hydration',
          title: 'Normalize income',
          status: 'applied',
          code: 'df["income"] = df["income"] / 100',
          codeHash: 'abc',
          version: 1,
          cellIds: ['cell-1'],
          requiresApproval: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    });

    await usePreprocessingStore.getState().evaluateReplayCompatibility('project-1');

    const report = usePreprocessingStore.getState().replayReport;
    expect(report).toBeTruthy();
    expect(report?.source).toBe('backend_authoritative');
    expect(report?.compatible).toBe(false);
    expect(report?.issues[0]).toContain('missing_column');
  });

  it('keeps backend pass authoritative even when local pre-check warns', async () => {
    apiRequestMock.mockResolvedValue({
      output: {
        isError: false,
        compatible: true,
        compatibilityIssues: []
      }
    });

    usePreprocessingStore.setState({
      runId: 'prep-run-1',
      latestCheckpointId: 'ckpt-1',
      selectedDatasetId: 'dataset-1',
      tables: [
        {
          datasetId: 'dataset-1',
          name: 'dataset_1',
          filename: 'dataset.csv',
          sizeBytes: 123,
          columns: [{ name: 'income', dtype: 'float' }]
        }
      ],
      timeline: [
        {
          id: 'evt-2',
          runId: 'prep-run-1',
          stepId: 'step-2',
          toolName: 'snapshot_hydration',
          title: 'Uses missing column',
          status: 'applied',
          code: 'df["missing_col"] = 1',
          codeHash: 'def',
          version: 1,
          cellIds: ['cell-1'],
          requiresApproval: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    });

    await usePreprocessingStore.getState().evaluateReplayCompatibility('project-1');

    const report = usePreprocessingStore.getState().replayReport;
    expect(report?.source).toBe('backend_authoritative');
    expect(report?.compatible).toBe(true);
    expect((report?.precheckIssues?.length ?? 0) > 0).toBe(true);
  });

  it('persists approve action via backend commit and rehydrates authoritative state', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'approval-step-1',
      tool: 'commit_transformation_step',
      output: {
        runId: 'prep-run-1',
        isError: false
      }
    });
    getPreprocessingRunSnapshotMock.mockResolvedValue({
      run: {
        ...buildSnapshot(),
        steps: [
          {
            ...buildSnapshot().steps[0],
            status: 'applied',
            requiresApproval: false,
            approvalDecision: 'approved'
          }
        ]
      }
    });

    usePreprocessingStore.setState({
      runId: 'prep-run-1',
      selectedDatasetId: 'dataset-1',
      timeline: [
        {
          id: 'evt-step-1',
          runId: 'prep-run-1',
          stepId: 'step-1',
          toolName: 'validate_step_result',
          title: 'Drop outliers',
          status: 'awaiting_approval',
          requiresApproval: true,
          cellIds: ['cell-1'],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    });

    await usePreprocessingStore.getState().approveStep('project-1', 'step-1');

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/preprocessing/step-decision',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"approved":true')
      })
    );
    expect(getPreprocessingRunSnapshotMock).toHaveBeenCalledWith('prep-run-1', 'project-1');
    expect(usePreprocessingStore.getState().timeline[0]).toMatchObject({
      stepId: 'step-1',
      status: 'applied'
    });
  });

  it('persists reject action with reason and restores reason from backend snapshot', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'reject-step-1',
      tool: 'commit_transformation_step',
      output: {
        runId: 'prep-run-1',
        isError: false
      }
    });
    getPreprocessingRunSnapshotMock.mockResolvedValue({
      run: {
        ...buildSnapshot(),
        steps: [
          {
            ...buildSnapshot().steps[0],
            status: 'failed',
            requiresApproval: true,
            approvalDecision: 'rejected',
            decisionReason: 'Risk too high'
          }
        ]
      }
    });

    usePreprocessingStore.setState({
      runId: 'prep-run-1',
      timeline: [
        {
          id: 'evt-step-1',
          runId: 'prep-run-1',
          stepId: 'step-1',
          toolName: 'validate_step_result',
          title: 'Drop outliers',
          status: 'awaiting_approval',
          requiresApproval: true,
          cellIds: ['cell-1'],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    });

    await usePreprocessingStore.getState().rejectStep('project-1', 'step-1', 'Risk too high');

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/preprocessing/step-decision',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"approved":false')
      })
    );
    expect(getPreprocessingRunSnapshotMock).toHaveBeenCalledWith('prep-run-1', 'project-1');
    expect(usePreprocessingStore.getState().timeline[0]).toMatchObject({
      stepId: 'step-1',
      status: 'failed',
      error: 'Risk too high'
    });
  });

  it('marks in-flight steps as failed when stream is interrupted', () => {
    usePreprocessingStore.setState({
      timeline: [
        {
          id: 'evt-pending',
          runId: 'prep-run-1',
          stepId: 'step-pending',
          toolName: 'propose_transformation_step',
          title: 'Pending step',
          status: 'pending',
          requiresApproval: false,
          cellIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: 'evt-running',
          runId: 'prep-run-1',
          stepId: 'step-running',
          toolName: 'materialize_step_code',
          title: 'Running step',
          status: 'running',
          requiresApproval: false,
          cellIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: 'evt-await',
          runId: 'prep-run-1',
          stepId: 'step-await',
          toolName: 'validate_step_result',
          title: 'Awaiting approval step',
          status: 'awaiting_approval',
          requiresApproval: true,
          cellIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    });

    usePreprocessingStore.getState().markInterruptedSteps('OpenAI rate limit or quota reached (429).');
    const state = usePreprocessingStore.getState();

    expect(state.timeline.find((event) => event.stepId === 'step-pending')).toMatchObject({
      status: 'failed'
    });
    expect(state.timeline.find((event) => event.stepId === 'step-running')).toMatchObject({
      status: 'failed'
    });
    expect(state.timeline.find((event) => event.stepId === 'step-await')).toMatchObject({
      status: 'awaiting_approval'
    });
    expect(state.error).toContain('OpenAI rate limit or quota reached');
  });
});
