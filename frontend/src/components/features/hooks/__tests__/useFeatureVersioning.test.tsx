import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatureStore } from '@/stores/featureStore';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import {
  buildWorkflowSessionKey,
  useWorkflowSessionStore
} from '@/stores/workflowSessionStore';
import { useFeatureVersioning } from '../useFeatureVersioning';
import type { PipelineVersion } from '@/types/feature';

function makeDraftVersion(overrides: Partial<PipelineVersion> & { id: string }): PipelineVersion {
  return {
    projectId: 'project-1',
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
    },
    ...overrides
  };
}

describe('useFeatureVersioning', () => {
  const projectId = 'project-1';
  const versionId = 'draft-1';
  const storageKey = `feature-engineering-messages-v3-${versionId}`;
  const sessionKey = buildWorkflowSessionKey(projectId, storageKey);
  const initialFeatureState = useFeatureStore.getState();
  const initialWorkflowSessionState = useWorkflowSessionStore.getState();

  function renderVersioning(overrides?: Partial<Parameters<typeof useFeatureVersioning>[0]>) {
    return renderHook(() => useFeatureVersioning({
      projectId,
      setSuggestionDrafts: vi.fn(),
      setPanelError: vi.fn(),
      setApplyStatus: vi.fn(),
      setApplyMessage: vi.fn(),
      ...overrides
    }));
  }

  beforeEach(() => {
    useFeatureStore.setState({
      ...initialFeatureState,
      versions: {
        [projectId]: [makeDraftVersion({ id: versionId })]
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

  afterEach(() => {
    // Ensure handler cleanup
    useWorkbookRegistryStore.getState().setDeleteHandler('feature-engineering', null);
  });

  it('clears the persisted workflow session when resetting the current draft', () => {
    const { result } = renderVersioning();

    act(() => {
      result.current.handleReset();
    });

    expect(useFeatureStore.getState().featureRunId).toBeNull();
    expect(useFeatureStore.getState().currentStage).toBeNull();
    expect(useFeatureStore.getState().featureSteps).toEqual({});
    expect(useWorkflowSessionStore.getState().getSession(sessionKey)).toBeUndefined();
  });

  describe('sidebar delete handler', () => {
    it('registers on mount and deregisters on unmount', () => {
      const { unmount } = renderVersioning();

      const handler = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering'];
      expect(handler).toBeTypeOf('function');

      unmount();

      const handlerAfterUnmount = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering'];
      expect(handlerAfterUnmount).toBeUndefined();
    });

    it('deletes a draft version and returns the new current ID', () => {
      const secondId = 'draft-2';
      useFeatureStore.setState({
        versions: {
          [projectId]: [
            makeDraftVersion({ id: versionId }),
            makeDraftVersion({ id: secondId, name: 'Draft Pipeline v2' })
          ]
        },
        currentVersionId: { [projectId]: versionId }
      });

      renderVersioning();

      const handler = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering']!;
      let newId: string | undefined;
      act(() => {
        newId = handler(versionId);
      });

      const state = useFeatureStore.getState();
      expect(state.versions[projectId]).toHaveLength(1);
      expect(state.versions[projectId]![0].id).toBe(secondId);
      expect(newId).toBe(secondId);
    });

    it('rejects deletion of approved versions', () => {
      useFeatureStore.setState({
        versions: {
          [projectId]: [makeDraftVersion({ id: versionId, status: 'approved' })]
        }
      });

      renderVersioning();

      const handler = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering']!;
      let result: string | undefined;
      act(() => {
        result = handler(versionId);
      });

      expect(result).toBeUndefined();
      expect(useFeatureStore.getState().versions[projectId]).toHaveLength(1);
    });

    it('creates a replacement draft when deleting the last version', () => {
      renderVersioning();

      const handler = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering']!;
      let newId: string | undefined;
      act(() => {
        newId = handler(versionId);
      });

      const state = useFeatureStore.getState();
      // A replacement draft was created, old one removed
      expect(state.versions[projectId]).toHaveLength(1);
      expect(state.versions[projectId]![0].id).not.toBe(versionId);
      expect(state.versions[projectId]![0].name).toBe('Draft Pipeline v1');
      expect(newId).toBe(state.versions[projectId]![0].id);
    });

    it('clears feature store ephemeral state on delete', () => {
      renderVersioning();

      const handler = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering']!;
      act(() => {
        handler(versionId);
      });

      const state = useFeatureStore.getState();
      expect(state.featureRunId).toBeNull();
      expect(state.currentStage).toBeNull();
      expect(state.featureSteps).toEqual({});
    });
  });
});
