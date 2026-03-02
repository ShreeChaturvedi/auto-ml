import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeToolCalls, getPreprocessingRunSnapshot } from '../../lib/api/llm';
import type { PreprocessingRunSnapshot } from '../../types/preprocessing';
import { usePreprocessingStore } from '../preprocessingStore';

vi.mock('../../lib/api/llm', () => ({
  getPreprocessingRunSnapshot: vi.fn(),
  executeToolCalls: vi.fn()
}));

const getPreprocessingRunSnapshotMock = vi.mocked(getPreprocessingRunSnapshot);
const executeToolCallsMock = vi.mocked(executeToolCalls);

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
    getPreprocessingRunSnapshotMock.mockReset();
    executeToolCallsMock.mockReset();
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
  });

  it('consumes restart run-cell mode once and resets to continue', () => {
    usePreprocessingStore.getState().setNextRunCellMode('restart_from_original');

    const first = usePreprocessingStore.getState().consumeRunCellMode();
    const second = usePreprocessingStore.getState().consumeRunCellMode();

    expect(first).toBe('restart_from_original');
    expect(second).toBe('continue');
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
        executionCount: 0,
        executionStatus: 'idle',
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

  it('uses backend as source of truth when local pre-check passes but backend fails', async () => {
    executeToolCallsMock.mockResolvedValue({
      results: [
        {
          id: 'replay-check-1',
          tool: 'restore_checkpoint',
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
        }
      ]
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
    executeToolCallsMock.mockResolvedValue({
      results: [
        {
          id: 'replay-check-2',
          tool: 'restore_checkpoint',
          output: {
            isError: false,
            compatible: true,
            compatibilityIssues: []
          }
        }
      ]
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
    executeToolCallsMock.mockResolvedValue({
      results: [
        {
          id: 'approval-step-1',
          tool: 'commit_transformation_step',
          output: {
            runId: 'prep-run-1',
            isError: false
          }
        }
      ]
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

    expect(executeToolCallsMock).toHaveBeenCalledWith(
      'project-1',
      [
        expect.objectContaining({
          tool: 'commit_transformation_step',
          args: expect.objectContaining({
            runId: 'prep-run-1',
            stepId: 'step-1',
            approved: true,
            datasetId: 'dataset-1'
          })
        })
      ]
    );
    expect(getPreprocessingRunSnapshotMock).toHaveBeenCalledWith('prep-run-1', 'project-1');
    expect(usePreprocessingStore.getState().timeline[0]).toMatchObject({
      stepId: 'step-1',
      status: 'applied'
    });
  });

  it('persists reject action with reason and restores reason from backend snapshot', async () => {
    executeToolCallsMock.mockResolvedValue({
      results: [
        {
          id: 'reject-step-1',
          tool: 'commit_transformation_step',
          output: {
            runId: 'prep-run-1',
            isError: false
          }
        }
      ]
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

    expect(executeToolCallsMock).toHaveBeenCalledWith(
      'project-1',
      [
        expect.objectContaining({
          tool: 'commit_transformation_step',
          args: expect.objectContaining({
            runId: 'prep-run-1',
            stepId: 'step-1',
            approved: false,
            rejectionReason: 'Risk too high'
          })
        })
      ]
    );
    expect(getPreprocessingRunSnapshotMock).toHaveBeenCalledWith('prep-run-1', 'project-1');
    expect(usePreprocessingStore.getState().timeline[0]).toMatchObject({
      stepId: 'step-1',
      status: 'failed',
      error: 'Risk too high'
    });
  });
});
