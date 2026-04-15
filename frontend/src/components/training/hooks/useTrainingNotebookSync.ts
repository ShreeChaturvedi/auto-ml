/**
 * useTrainingNotebookSync — per-workbook notebook ownership for the Training phase.
 *
 * Mirrors the pattern established by useFeatureNotebookSync for the FE phase.
 * Every training workbook owns exactly one notebook tagged with
 * `{ phase: 'training', tabId: workbookId, tabName: workbookName }`. The hook
 * resolves that notebook on mount and on every workbook switch, either by:
 *
 *   1. Reusing a bound notebookId stored on the workbook (fast path).
 *   2. Adopting an unbound training-phase notebook whose tabId matches.
 *   3. Creating a fresh notebook with training metadata.
 *
 * The hook NEVER carries a notebook from another phase. If the user came from
 * Feature Engineering, the FE notebook is left alone — both its metadata and
 * cells stay intact — and Training creates (or adopts) its own.
 *
 * Guards borrowed from the FE sync hook (see useFeatureNotebookSync.ts):
 *   - `notebookEnsureLockRef` de-dupes concurrent ensure flows during rapid
 *     workbook switches so we don't create multiple orphan notebooks.
 *   - `isReady` gates the caller's AgenticShell mount until the notebook
 *     is resolved, preventing AgenticShell's `initializeNotebook(undefined)`
 *     fallback from activating `notebooks[0]` (which is often an FE notebook).
 */
import { useEffect, useRef, useState } from 'react';

import * as notebooksApi from '@/lib/api/notebooks';
import { useNotebookStore } from '@/stores/notebookStore';
import type { Notebook } from '@/types/notebook';
import type { WorkbookEntry } from '@/types/workbook';
import { isDemoMode } from '@/lib/demoMode';

const TRAINING_PHASE = 'training' as const;

interface UseTrainingNotebookSyncOptions {
  projectId: string | undefined;
  activeWorkbook: WorkbookEntry | undefined;
  setWorkbookNotebookId: (workbookId: string, notebookId: string | null) => void;
  /**
   * Optional deep-link notebook id from the URL (?notebook=<id>). Only adopted
   * if the notebook exists and has `metadata.phase === 'training'`. All other
   * values are ignored to preserve cross-phase isolation.
   */
  initialNotebookId?: string | undefined;
}

interface UseTrainingNotebookSyncResult {
  notebookId: string | null;
  isReady: boolean;
}

function readMetadata(notebook: Pick<Notebook, 'metadata'> | undefined): Record<string, unknown> | null {
  if (!notebook?.metadata || typeof notebook.metadata !== 'object' || Array.isArray(notebook.metadata)) {
    return null;
  }
  return notebook.metadata as Record<string, unknown>;
}

function matchesTrainingWorkbookNotebook(
  notebook: Pick<Notebook, 'notebookId' | 'kind' | 'metadata'>,
  workbookId: string
): boolean {
  // Standalone notebooks must never be adopted by phase workflows, even if
  // their metadata happens to match — they are user-owned exploration
  // scratch spaces from the data viewer phase.
  if (notebook.kind !== 'phase') return false;
  const metadata = readMetadata(notebook);
  return metadata?.phase === TRAINING_PHASE && metadata?.tabId === workbookId;
}

function isUsableTrainingNotebookBinding(
  notebook: Pick<Notebook, 'notebookId' | 'kind' | 'metadata'>,
  workbookId: string
): boolean {
  if (notebook.kind !== 'phase') return false;

  const metadata = readMetadata(notebook);

  // Unphased notebooks (null metadata OR empty object OR phase field
  // missing) are treated as adoptable legacy state. They will be healed
  // with training metadata on adoption. Notebooks with a phase set to
  // something other than 'training' belong to another phase and must NOT
  // be adopted.
  if (!metadata || metadata.phase === undefined) {
    return true;
  }

  if (metadata.phase !== TRAINING_PHASE) {
    return false;
  }

  // If the notebook has a tabId, it must match this workbook; a mismatch
  // means the notebook belongs to a different training workbook.
  return metadata.tabId === undefined || metadata.tabId === workbookId;
}

function resolveCachedTrainingNotebookId(
  projectId: string,
  workbookId: string,
  boundNotebookId: string | null,
  notebookProjectId: string | null,
  notebooks: Array<Pick<Notebook, 'notebookId' | 'kind' | 'metadata'>>
): string | null {
  if (notebookProjectId !== projectId) {
    return null;
  }

  if (boundNotebookId) {
    const boundNotebook = notebooks.find((entry) => entry.notebookId === boundNotebookId);
    if (boundNotebook && isUsableTrainingNotebookBinding(boundNotebook, workbookId)) {
      return boundNotebook.notebookId;
    }
  }

  const matchingNotebook = notebooks.find((entry) => matchesTrainingWorkbookNotebook(entry, workbookId));
  return matchingNotebook?.notebookId ?? null;
}

export function useTrainingNotebookSync({
  projectId,
  activeWorkbook,
  setWorkbookNotebookId,
  initialNotebookId
}: UseTrainingNotebookSyncOptions): UseTrainingNotebookSyncResult {
  const workbookId = activeWorkbook?.id ?? null;
  const workbookName = activeWorkbook?.name ?? null;
  const workbookNotebookId = activeWorkbook?.notebookId ?? null;
  const notebookProjectId = useNotebookStore((state) => state.currentProjectId);
  const notebooks = useNotebookStore((state) => state.notebooks);
  const cachedNotebookId =
    projectId && workbookId
      ? resolveCachedTrainingNotebookId(
          projectId,
          workbookId,
          workbookNotebookId,
          notebookProjectId,
          notebooks
        )
      : null;

  // IMPORTANT: initialize state and refs to null — not to workbookNotebookId.
  // The workbook's persisted binding is UNVERIFIED at mount: the notebook
  // may have been deleted, repurposed for another phase, or never existed.
  // We must always run at least one listNotebooks → validate cycle before
  // trusting the binding. Pre-populating the ref would let the same-
  // workbook early-exit skip that validation on first render.
  const [notebookId, setNotebookId] = useState<string | null>(cachedNotebookId);
  const [isReady, setIsReady] = useState(workbookId == null ? true : Boolean(cachedNotebookId));
  const notebookEnsureLockRef = useRef<{ workbookId: string; promise: Promise<string | null> } | null>(null);
  const activeWorkbookIdRef = useRef<string | null>(workbookId && cachedNotebookId ? workbookId : null);
  // The resolved notebook id is also tracked in a ref so the effect can
  // early-exit on re-runs without needing `notebookId` in its deps (which
  // would cause a redundant extra ensure round-trip per setState).
  const resolvedNotebookIdRef = useRef<string | null>(cachedNotebookId);
  // Ensure the URL deep-link adoption only runs once per mount.
  const initialAdoptionRef = useRef(false);

  useEffect(() => {
    if (!projectId) {
      notebookEnsureLockRef.current = null;
      resolvedNotebookIdRef.current = null;
      setNotebookId(null);
      setIsReady(false);
      return;
    }

    let cancelled = false;

    const ensureNotebookForWorkbook = async () => {
      if (!workbookId || !workbookName) {
        notebookEnsureLockRef.current = null;
        activeWorkbookIdRef.current = null;
        resolvedNotebookIdRef.current = null;
        if (!cancelled) {
          setNotebookId(null);
          setIsReady(true);
        }
        return;
      }

      if (isDemoMode()) {
        const fallbackNotebookId = workbookNotebookId ?? `training-demo-${workbookId}`;
        resolvedNotebookIdRef.current = fallbackNotebookId;
        setWorkbookNotebookId(workbookId, fallbackNotebookId);
        if (!cancelled) {
          setNotebookId(fallbackNotebookId);
          setIsReady(true);
        }
        return;
      }

      const workbookChanged = activeWorkbookIdRef.current !== workbookId;
      activeWorkbookIdRef.current = workbookId;

      const bindingChangedForCurrentWorkbook =
        !workbookChanged
        && resolvedNotebookIdRef.current !== null
        && workbookNotebookId !== resolvedNotebookIdRef.current;
      const resetCurrentWorkbook =
        bindingChangedForCurrentWorkbook
        && workbookNotebookId === null;

      if (workbookChanged) {
        if (!resolvedNotebookIdRef.current) {
          setIsReady(false);
        }
      } else if (resolvedNotebookIdRef.current) {
        // Same workbook, already resolved — but if the workbook binding was
        // cleared or rotated to a new notebook id, invalidate the cached
        // resolution so we reconcile against the new source of truth.
        // For true reset (`old -> null`), clear the exposed notebook id
        // immediately so callers never remount against the stale notebook.
        if (bindingChangedForCurrentWorkbook) {
          resolvedNotebookIdRef.current = null;
          if (resetCurrentWorkbook) {
            setNotebookId(null);
            setIsReady(false);
          } else if (workbookNotebookId) {
            // Direct notebook rotation for the same workbook is expected
            // during reset/create flows. Keep the shell mounted against the
            // new notebook id while we validate the new binding in the
            // background instead of dropping back to "preparing...".
            setNotebookId(workbookNotebookId);
            setIsReady(true);
          }
        } else {
          return;
        }
      }

      try {
        const existingEnsure = notebookEnsureLockRef.current;
        let resolved: string | null;

        if (existingEnsure?.workbookId === workbookId) {
          resolved = await existingEnsure.promise;
        } else {
          const ensurePromise = (async () => {
            const notebooks = await notebooksApi.listNotebooks(projectId);

            // Step 1 — if the workbook already has a bound notebookId that
            // still exists and is usable for this workbook, reuse it.
            let nextId: string | null = null;
            if (workbookNotebookId) {
              const bound = notebooks.find((entry) => entry.notebookId === workbookNotebookId);
              if (bound && isUsableTrainingNotebookBinding(bound, workbookId)) {
                nextId = bound.notebookId;
              }
            }

            // Step 2 — URL deep-link adoption, one-shot and strict on phase.
            if (!nextId && initialNotebookId && !initialAdoptionRef.current) {
              initialAdoptionRef.current = true;
              const deepLinked = notebooks.find((entry) => entry.notebookId === initialNotebookId);
              if (deepLinked && isUsableTrainingNotebookBinding(deepLinked, workbookId)) {
                nextId = deepLinked.notebookId;
              } else if (deepLinked) {
                console.warn(
                  '[useTrainingNotebookSync] Ignoring ?notebook= deep-link pointing at a non-training notebook',
                  { notebookId: deepLinked.notebookId, metadata: deepLinked.metadata }
                );
              }
            }

            // Step 3 — adopt an existing training notebook whose metadata
            // already matches this workbook's tabId (survives reloads and
            // localStorage wipes). Never adopts notebooks from other phases.
            if (!nextId && !resetCurrentWorkbook) {
              const matching = notebooks.find((entry) =>
                matchesTrainingWorkbookNotebook(entry, workbookId)
              );
              if (matching) {
                nextId = matching.notebookId;
              }
            }

            // Step 4 — create a fresh training notebook with correct metadata.
            if (!nextId) {
              const created = await notebooksApi.createNotebook(projectId, {
                name: workbookName,
                metadata: {
                  phase: TRAINING_PHASE,
                  tabId: workbookId,
                  tabName: workbookName
                }
              });
              nextId = created.notebookId;
            } else {
              // Ensure metadata is current — heals drift from legacy or
              // unphased notebooks without rewriting untouched fields.
              const currentNotebook = notebooks.find((entry) => entry.notebookId === nextId);
              const currentMeta = readMetadata(currentNotebook) ?? {};
              const needsUpdate =
                currentMeta.phase !== TRAINING_PHASE ||
                currentMeta.tabId !== workbookId ||
                currentMeta.tabName !== workbookName;
              if (needsUpdate) {
                await notebooksApi.updateNotebook(nextId, {
                  metadata: {
                    ...currentMeta,
                    phase: TRAINING_PHASE,
                    tabId: workbookId,
                    tabName: workbookName
                  }
                });
              }
            }

            return nextId;
          })();

          notebookEnsureLockRef.current = { workbookId, promise: ensurePromise };

          try {
            resolved = await ensurePromise;
          } finally {
            if (notebookEnsureLockRef.current?.promise === ensurePromise) {
              notebookEnsureLockRef.current = null;
            }
          }
        }

        if (cancelled) return;

        if (resolved) {
          // setWorkbookNotebookId is idempotent, so this is a no-op when the
          // binding was already correct (e.g. hydrated from localStorage).
          setWorkbookNotebookId(workbookId, resolved);
        }
        resolvedNotebookIdRef.current = resolved;
        setNotebookId(resolved);
        setIsReady(Boolean(resolved));
      } catch (error) {
        console.error('[useTrainingNotebookSync] Failed to ensure notebook for training workbook:', error);
        if (!cancelled) {
          resolvedNotebookIdRef.current = null;
          setNotebookId(null);
          setIsReady(false);
        }
      }
    };

    void ensureNotebookForWorkbook();

    return () => {
      cancelled = true;
    };
    // Scalar deps only — using `activeWorkbook` as an object would re-run on
    // every workbook state mutation (including ones the hook itself triggers
    // via setWorkbookNotebookId), causing gratuitous listNotebooks calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workbookId, workbookName, workbookNotebookId, initialNotebookId]);

  return { notebookId, isReady };
}
