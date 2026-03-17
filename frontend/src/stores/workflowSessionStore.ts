import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { WorkflowState } from '@/types/workflow';

export interface WorkflowSessionRecord {
  runId?: string;
  threadId?: string;
  state?: WorkflowState;
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

export const useWorkflowSessionStore = create<WorkflowSessionStore>()(
  persist(
    (set, get) => ({
      sessions: {},
      updateSession: (sessionKey, state) => {
        set((current) => ({
          sessions: {
            ...current.sessions,
            [sessionKey]: {
              runId: state.runId,
              threadId: state.threadId,
              state
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
