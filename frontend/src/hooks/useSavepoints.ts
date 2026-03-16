import { useState, useCallback, useRef, useMemo } from 'react';
import * as savepointApi from '@/lib/api/savepoints';
import type { SavepointDiff } from '@/types/savepoint';

export function useSavepoints() {
  const [savepointMap, setSavepointMap] = useState<Map<number, string>>(new Map());
  const diffCacheRef = useRef<Map<string, SavepointDiff>>(new Map());

  const createSavepoint = useCallback(async (
    notebookId: string,
    turnIndex: number,
    turnMessageId: string
  ) => {
    try {
      const sp = await savepointApi.createSavepoint(notebookId, turnIndex, turnMessageId);
      setSavepointMap(prev => {
        const next = new Map(prev);
        next.set(turnIndex, sp.savepointId);
        return next;
      });
      return sp;
    } catch (err) {
      console.error('[useSavepoints] Failed to create savepoint:', err);
      return null;
    }
  }, []);

  const getDiff = useCallback(async (
    notebookId: string,
    turnIndex: number
  ): Promise<SavepointDiff | null> => {
    const savepointId = savepointMap.get(turnIndex);
    if (!savepointId) return null;

    const cached = diffCacheRef.current.get(savepointId);
    if (cached) return cached;

    try {
      const diff = await savepointApi.getSavepointDiff(notebookId, savepointId);
      diffCacheRef.current.set(savepointId, diff);
      return diff;
    } catch (err) {
      console.error('[useSavepoints] Failed to get diff:', err);
      return null;
    }
  }, [savepointMap]);

  const clearAfter = useCallback(async (
    notebookId: string,
    turnIndex: number
  ) => {
    try {
      await savepointApi.deleteSavepointsAfter(notebookId, turnIndex);
      setSavepointMap(prev => {
        const next = new Map(prev);
        const survivingIds = new Set<string>();
        for (const [idx, id] of next) {
          if (idx > turnIndex) {
            next.delete(idx);
          } else {
            survivingIds.add(id);
          }
        }
        for (const cachedId of Array.from(diffCacheRef.current.keys())) {
          if (!survivingIds.has(cachedId)) diffCacheRef.current.delete(cachedId);
        }
        return next;
      });
    } catch (err) {
      console.error('[useSavepoints] Failed to clear:', err);
    }
  }, []);

  return useMemo(() => ({
    createSavepoint,
    getDiff,
    clearAfter
  }), [createSavepoint, getDiff, clearAfter]);
}
