import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { WorkflowState } from '@/types/workflow';

type PersistedWorkflowState = Pick<
  WorkflowState,
  | 'runId'
  | 'threadId'
  | 'phase'
  | 'currentNode'
  | 'status'
  | 'mode'
  | 'revision'
  | 'activeStepId'
  | 'pendingInputKind'
  | 'pauseReason'
> & {
  activeDatasetId?: string;
  activeNotebookId?: string;
};

export interface WorkflowSessionRecord {
  runId?: string;
  threadId?: string;
  state?: PersistedWorkflowState;
}

interface WorkflowSessionStore {
  sessions: Record<string, WorkflowSessionRecord>;
  updateSession: (sessionKey: string, state: WorkflowState) => void;
  clearSession: (sessionKey: string) => void;
  getSession: (sessionKey: string) => WorkflowSessionRecord | undefined;
}

export function buildWorkflowSessionKey(projectId: string, storageKey: string): string {
  return `${projectId}:${storageKey}`;
}

function compactWorkflowState(state: WorkflowState): PersistedWorkflowState {
  return {
    runId: state.runId,
    threadId: state.threadId,
    phase: state.phase,
    currentNode: state.currentNode,
    status: state.status,
    ...(state.mode ? { mode: state.mode } : {}),
    ...(state.revision != null ? { revision: state.revision } : {}),
    ...(state.activeStepId ? { activeStepId: state.activeStepId } : {}),
    ...(typeof state.pendingInputKind === 'string' ? { pendingInputKind: state.pendingInputKind } : {}),
    ...(typeof state.pauseReason === 'string' ? { pauseReason: state.pauseReason } : {}),
    ...(typeof state.activeDatasetId === 'string' ? { activeDatasetId: state.activeDatasetId } : {}),
    ...(typeof state.activeNotebookId === 'string' ? { activeNotebookId: state.activeNotebookId } : {})
  };
}

export const useWorkflowSessionStore = create<WorkflowSessionStore>()(
  persist(
    (set, get) => ({
      sessions: {},
      updateSession: (sessionKey, state) => {
        const compactState = compactWorkflowState(state);
        set((current) => ({
          sessions: {
            ...current.sessions,
            [sessionKey]: {
              runId: compactState.runId,
              threadId: compactState.threadId,
              state: compactState
            }
          }
        }));
      },
      clearSession: (sessionKey) => {
        set((current) => {
          const nextSessions = { ...current.sessions };
          delete nextSessions[sessionKey];
          return { sessions: nextSessions };
        });
      },
      getSession: (sessionKey) => get().sessions[sessionKey]
    }),
    {
      name: 'workflow-session-store-v1',
      partialize: (state) => ({
        sessions: state.sessions
      })
    }
  )
);
