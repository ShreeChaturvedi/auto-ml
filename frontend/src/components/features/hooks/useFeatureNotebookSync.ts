import { useEffect, useRef, useState } from 'react';

import { useFeatureStore } from '@/stores/featureStore';
import { useNotebookStore } from '@/stores/notebookStore';
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
  notebook: Pick<Notebook, 'notebookId' | 'kind' | 'metadata'>,
  versionId: string
): boolean {
  // Standalone notebooks must never be adopted by phase workflows, even if
  // their metadata happens to match — they are user-owned exploration
  // scratch spaces from the data viewer phase.
  if (notebook.kind !== 'phase') return false;
  const metadata = notebook.metadata && typeof notebook.metadata === 'object' && !Array.isArray(notebook.metadata)
    ? notebook.metadata as Record<string, unknown>
    : null;
  return metadata?.phase === 'feature-engineering' && metadata?.tabId === versionId;
}

function isUsableFeatureNotebookBinding(
  notebook: Pick<Notebook, 'notebookId' | 'kind' | 'metadata'>,
  versionId: string
): boolean {
  if (notebook.kind !== 'phase') return false;

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

function resolveCachedFeatureNotebookId(
  projectId: string,
  versionId: string,
  boundNotebookId: string | null,
  notebookProjectId: string | null,
  notebooks: Array<Pick<Notebook, 'notebookId' | 'kind' | 'metadata'>>
): string | null {
  if (notebookProjectId !== projectId) {
    return null;
  }

  if (boundNotebookId) {
    const boundNotebook = notebooks.find((entry) => entry.notebookId === boundNotebookId);
    if (boundNotebook && isUsableFeatureNotebookBinding(boundNotebook, versionId)) {
      return boundNotebook.notebookId;
    }
  }

  const matchingNotebook = notebooks.find((entry) => matchesFeatureVersionNotebook(entry, versionId));
  return matchingNotebook?.notebookId ?? null;
}

export function useFeatureNotebookSync({
  projectId,
  currentVersion
}: UseFeatureNotebookSyncOptions): UseFeatureNotebookSyncResult {
  const setVersionNotebookId = useFeatureStore((state) => state.setVersionNotebookId);
  const currentVersionId = currentVersion?.id ?? null;
  const currentVersionName = currentVersion?.name ?? null;
  const currentVersionNotebookId = currentVersion?.notebookId ?? null;
  const notebookProjectId = useNotebookStore((state) => state.currentProjectId);
  const notebooks = useNotebookStore((state) => state.notebooks);
  const cachedNotebookId =
    currentVersionId && projectId
      ? resolveCachedFeatureNotebookId(
          projectId,
          currentVersionId,
          currentVersionNotebookId,
          notebookProjectId,
          notebooks
        )
      : null;

  // Start unresolved. The persisted version binding is not trustworthy until we
  // validate it against the live notebook list for this project.
  const [notebookId, setNotebookId] = useState<string | null>(cachedNotebookId);
  const [isReady, setIsReady] = useState(
    currentVersionId == null ? true : Boolean(cachedNotebookId)
  );
  const [resolvedVersionId, setResolvedVersionId] = useState<string | null>(
    currentVersionId && cachedNotebookId ? currentVersionId : null
  );
  const notebookEnsureLockRef = useRef<{ versionId: string; promise: Promise<string | null> } | null>(null);
  const activeVersionIdRef = useRef<string | null>(currentVersionId && cachedNotebookId ? currentVersionId : null);
  const resolvedNotebookIdRef = useRef<string | null>(cachedNotebookId);

  useEffect(() => {
    if (!projectId) {
      notebookEnsureLockRef.current = null;
      activeVersionIdRef.current = null;
      resolvedNotebookIdRef.current = null;
      setResolvedVersionId(null);
      setNotebookId(null);
      setIsReady(false);
      return;
    }

    let cancelled = false;

    const ensureNotebookForVersion = async () => {
      if (!currentVersionId || !currentVersionName) {
        notebookEnsureLockRef.current = null;
        activeVersionIdRef.current = null;
        resolvedNotebookIdRef.current = null;
        if (!cancelled) {
          setResolvedVersionId(null);
          setNotebookId(null);
          setIsReady(true);
        }
        return;
      }

      const versionChanged = activeVersionIdRef.current !== currentVersionId;
      activeVersionIdRef.current = currentVersionId;
      const bindingChangedForCurrentVersion =
        !versionChanged
        && resolvedNotebookIdRef.current !== null
        && currentVersionNotebookId !== resolvedNotebookIdRef.current;
      const resetCurrentVersion =
        bindingChangedForCurrentVersion
        && currentVersionNotebookId === null;

      if (versionChanged) {
        if (!resolvedNotebookIdRef.current) {
          setIsReady(false);
        }
      } else if (resolvedNotebookIdRef.current) {
        if (bindingChangedForCurrentVersion) {
          resolvedNotebookIdRef.current = null;
          if (resetCurrentVersion) {
            setResolvedVersionId(null);
            setNotebookId(null);
            setIsReady(false);
          } else if (currentVersionNotebookId) {
            // Preserve the shell against a direct notebook rotation for the
            // same draft while we validate the new binding in the background.
            setResolvedVersionId(currentVersionId);
            setNotebookId(currentVersionNotebookId);
            setIsReady(true);
          }
        } else {
          return;
        }
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

            if (!nextNotebookId && !resetCurrentVersion) {
              const matchingNotebook = currentNotebooks.find((entry) =>
                matchesFeatureVersionNotebook(entry, currentVersionId)
              );
              if (matchingNotebook) {
                nextNotebookId = matchingNotebook.notebookId;
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

        if (cancelled) return;

        if (resolvedNotebookId) {
          setVersionNotebookId(projectId, currentVersionId, resolvedNotebookId);
        }
        resolvedNotebookIdRef.current = resolvedNotebookId;
        setResolvedVersionId(currentVersionId);
        setNotebookId(resolvedNotebookId);
        setIsReady(Boolean(resolvedNotebookId));
      } catch (error) {
        console.error('[useFeatureNotebookSync] Failed to ensure notebook for feature version:', error);
        if (!cancelled) {
          resolvedNotebookIdRef.current = null;
          setResolvedVersionId(null);
          setNotebookId(null);
          setIsReady(false);
        }
      }
    };

    void ensureNotebookForVersion();

    return () => {
      cancelled = true;
    };
  // Scalar deps only. Avoid depending on local notebook state because this
  // hook itself updates that state as part of notebook resolution.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, currentVersionId, currentVersionName, currentVersionNotebookId]);

  const resolvedForCurrentVersion = currentVersionId != null && resolvedVersionId === currentVersionId;

  return {
    notebookId: resolvedForCurrentVersion ? notebookId : null,
    isReady: currentVersionId == null ? isReady : (resolvedForCurrentVersion && isReady)
  };
}
