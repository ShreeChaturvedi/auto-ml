import { useEffect, useRef, useState } from 'react';

import { hydrateStoredMessages } from './agenticLoopStorage';
import { recoverNotebook, type RecoverableNotebookPhase } from '@/lib/api/notebooks';
import { useNotebookStore } from '@/stores/notebookStore';

interface UsePhaseNotebookRecoveryOptions {
  projectId: string | undefined;
  phase: RecoverableNotebookPhase;
  notebookId: string | null | undefined;
  storageKey: string | null | undefined;
  enabled?: boolean;
}

const attemptedRecoveryKeys = new Set<string>();

export function usePhaseNotebookRecovery({
  projectId,
  phase,
  notebookId,
  storageKey,
  enabled = true
}: UsePhaseNotebookRecoveryOptions): { isRecoveryReady: boolean } {
  const initializeNotebook = useNotebookStore((state) => state.initializeNotebook);
  const currentNotebookProjectId = useNotebookStore((state) => state.currentProjectId);
  const activeNotebookId = useNotebookStore((state) => state.activeNotebookId);
  const attemptedRef = useRef(attemptedRecoveryKeys);
  const [isRecoveryReady, setIsRecoveryReady] = useState(true);

  useEffect(() => {
    if (!enabled || !projectId || !notebookId || !storageKey) {
      setIsRecoveryReady(true);
      return;
    }

    const messageStorageScope = `${storageKey}-${projectId}`;
    const hydrated = hydrateStoredMessages(messageStorageScope);
    if (hydrated.messages.length === 0) {
      setIsRecoveryReady(true);
      return;
    }

    if (currentNotebookProjectId === projectId && activeNotebookId === notebookId) {
      setIsRecoveryReady(true);
      return;
    }

    const attemptKey = `${phase}:${notebookId}:${messageStorageScope}`;
    if (attemptedRef.current.has(attemptKey)) {
      setIsRecoveryReady(true);
      return;
    }

    attemptedRef.current.add(attemptKey);
    setIsRecoveryReady(false);
    let cancelled = false;

    void recoverNotebook(notebookId, phase)
      .then(async (result) => {
        if (cancelled || result.status !== 'recovered') {
          return;
        }
        await initializeNotebook(projectId, notebookId);
      })
      .catch((error) => {
        console.warn('[phase-notebook-recovery] Recovery attempt failed', {
          phase,
          notebookId,
          error
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsRecoveryReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeNotebookId, currentNotebookProjectId, enabled, initializeNotebook, notebookId, phase, projectId, storageKey]);

  return { isRecoveryReady };
}
