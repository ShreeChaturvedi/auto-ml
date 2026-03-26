import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatureStore } from '@/stores/featureStore';
import {
  buildWorkflowSessionKey,
  useWorkflowSessionStore
} from '@/stores/workflowSessionStore';
import { useFeatureVersioning } from '../useFeatureVersioning';

describe('useFeatureVersioning', () => {
  const projectId = 'project-1';
  const versionId = 'draft-1';
  const storageKey = `feature-engineering-messages-v3-${versionId}`;
  const sessionKey = buildWorkflowSessionKey(projectId, storageKey);
  const initialFeatureState = useFeatureStore.getState();
  const initialWorkflowSessionState = useWorkflowSessionStore.getState();

  beforeEach(() => {
    useFeatureStore.setState({
      ...initialFeatureState,
      versions: {
        [projectId]: [{
          id: versionId,
          projectId,
          name: 'Draft Pipeline v1',
          status: 'draft',
          createdAt: new Date('2026-03-23T00:00:00.000Z').toISOString(),
          readinessReport: {
            dataSummary: {
              addedColumns: [],
              removedColumns: [],
              renamedColumns: [],
              typeChanges: [],
              nullDeltas: [],
              warnings: []
            },
            steps: []
          }
        }]
      },
      currentVersionId: {
        [projectId]: versionId
      },
      featureSteps: {
        'feat-1': {
          stepId: 'feat-1',
          name: 'log_salary',
          method: 'log_transform',
          status: 'executed'
        }
      },
      currentStage: 'execute_feature',
      featureRunId: 'feature-run-1',
      syncFeaturesToProject: vi.fn().mockResolvedValue(undefined)
    });

    useWorkflowSessionStore.setState({
      ...initialWorkflowSessionState,
      sessions: {
        [sessionKey]: {
          runId: 'feature-run-1',
          threadId: 'feature-thread-1',
          state: {
            runId: 'feature-run-1',
            threadId: 'feature-thread-1',
            phase: 'feature_engineering',
            currentNode: 'execute_feature',
            status: 'running'
          }
        }
      }
    });
  });

  it('clears the persisted workflow session when resetting the current draft', () => {
    const { result } = renderHook(() => useFeatureVersioning({
      projectId,
      setSuggestionDrafts: vi.fn(),
      setPanelError: vi.fn(),
      setApplyStatus: vi.fn(),
      setApplyMessage: vi.fn()
    }));

    act(() => {
      result.current.handleReset();
    });

    expect(useFeatureStore.getState().featureRunId).toBeNull();
    expect(useFeatureStore.getState().currentStage).toBeNull();
    expect(useFeatureStore.getState().featureSteps).toEqual({});
    expect(useWorkflowSessionStore.getState().getSession(sessionKey)).toBeUndefined();
  });
});
