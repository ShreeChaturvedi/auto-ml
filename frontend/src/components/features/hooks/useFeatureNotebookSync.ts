import { useEffect, useRef, useState } from 'react';

import { useFeatureStore } from '@/stores/featureStore';
import type { PipelineVersion } from '@/types/feature';
import type { Notebook } from '@/types/notebook';
import * as notebooksApi from '@/lib/api/notebooks';

interface UseFeatureNotebookSyncOptions {
  projectId: string;
  currentVersion: PipelineVersion | undefined;
}

interface UseFeatureNotebookSyncResult {
  notebookId: string | null;
  isReady: boolean;
}

function matchesFeatureVersionNotebook(
  notebook: Pick<Notebook, 'notebookId' | 'metadata'>,
  versionId: string
): boolean {
  const metadata = notebook.metadata && typeof notebook.metadata === 'object' && !Array.isArray(notebook.metadata)
    ? notebook.metadata as Record<string, unknown>
    : null;
  return metadata?.phase === 'feature-engineering' && metadata?.tabId === versionId;
}

function isUsableFeatureNotebookBinding(
  notebook: Pick<Notebook, 'notebookId' | 'metadata'>,
  versionId: string
): boolean {
  const metadata = notebook.metadata && typeof notebook.metadata === 'object' && !Array.isArray(notebook.metadata)
    ? notebook.metadata as Record<string, unknown>
    : null;

  if (!metadata) {
    return true;
  }

  if (metadata.phase !== 'feature-engineering') {
    return false;
  }

  return metadata.tabId === undefined || metadata.tabId === versionId;
}

export function useFeatureNotebookSync({
  projectId,
  currentVersion
}: UseFeatureNotebookSyncOptions): UseFeatureNotebookSyncResult {
  const setVersionNotebookId = useFeatureStore((state) => state.setVersionNotebookId);
  const currentVersionId = currentVersion?.id ?? null;
  const currentVersionName = currentVersion?.name ?? null;
  const currentVersionNotebookId = currentVersion?.notebookId ?? null;

  const [notebookId, setNotebookId] = useState<string | null>(currentVersionNotebookId);
  const [isReady, setIsReady] = useState(false);
  const notebookEnsureLockRef = useRef<{ versionId: string; promise: Promise<string | null> } | null>(null);
  const activeVersionIdRef = useRef<string | null>(currentVersionId);

  useEffect(() => {
    let cancelled = false;

    const ensureNotebookForVersion = async () => {
      if (!currentVersionId || !currentVersionName) {
        notebookEnsureLockRef.current = null;
        activeVersionIdRef.current = null;
        if (!cancelled) {
          setNotebookId(null);
          setIsReady(true);
        }
        return;
      }

      const versionChanged = activeVersionIdRef.current !== currentVersionId;
      activeVersionIdRef.current = currentVersionId;

      if (versionChanged || !notebookId) {
        setIsReady(false);
      }

      try {
        const existingEnsure = notebookEnsureLockRef.current;
        let resolvedNotebookId: string | null;

        if (existingEnsure?.versionId === currentVersionId) {
          resolvedNotebookId = await existingEnsure.promise;
        } else {
          const ensurePromise = (async () => {
            const currentNotebooks = await notebooksApi.listNotebooks(projectId);
            const boundNotebook = currentVersionNotebookId
              ? currentNotebooks.find((entry) => entry.notebookId === currentVersionNotebookId)
              : undefined;
            let nextNotebookId = boundNotebook && isUsableFeatureNotebookBinding(boundNotebook, currentVersionId)
              ? boundNotebook.notebookId
              : null;

            if (!nextNotebookId) {
              const matchingNotebook = currentNotebooks.find((entry) =>
                matchesFeatureVersionNotebook(entry, currentVersionId)
              );
              if (matchingNotebook) {
                nextNotebookId = matchingNotebook.notebookId;
                setVersionNotebookId(projectId, currentVersionId, matchingNotebook.notebookId);
              }
            }

            if (!nextNotebookId) {
              const created = await notebooksApi.createNotebook(projectId, {
                name: currentVersionName,
                metadata: {
                  phase: 'feature-engineering',
                  tabId: currentVersionId,
                  tabName: currentVersionName
                }
              });
              nextNotebookId = created.notebookId;
              if (nextNotebookId) {
                setVersionNotebookId(projectId, currentVersionId, nextNotebookId);
              }
            }

            if (nextNotebookId) {
              const currentNotebook = currentNotebooks.find((entry) => entry.notebookId === nextNotebookId);
              await notebooksApi.updateNotebook(nextNotebookId, {
                metadata: {
                  ...((currentNotebook?.metadata as Record<string, unknown> | undefined) ?? {}),
                  phase: 'feature-engineering',
                  tabId: currentVersionId,
                  tabName: currentVersionName
                }
              });
            }

            return nextNotebookId;
          })();

          notebookEnsureLockRef.current = {
            versionId: currentVersionId,
            promise: ensurePromise
          };

          try {
            resolvedNotebookId = await ensurePromise;
          } finally {
            if (notebookEnsureLockRef.current?.promise === ensurePromise) {
              notebookEnsureLockRef.current = null;
            }
          }
        }

        if (!cancelled) {
          setNotebookId(resolvedNotebookId);
          setIsReady(Boolean(resolvedNotebookId));
        }
      } catch (error) {
        console.error('[useFeatureNotebookSync] Failed to ensure notebook for feature version:', error);
        if (!cancelled) {
          setNotebookId(null);
          setIsReady(false);
        }
      }
    };

    void ensureNotebookForVersion();

    return () => {
      cancelled = true;
    };
  }, [
    currentVersionId,
    currentVersionName,
    currentVersionNotebookId,
    notebookId,
    projectId,
    setVersionNotebookId
  ]);

  return {
    notebookId,
    isReady
  };
}
