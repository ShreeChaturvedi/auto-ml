import { useEffect, useMemo, useState } from 'react';
import * as notebooksApi from '@/lib/api/notebooks';
import { useNotebookStore } from '@/stores/notebookStore';
import type { Notebook, NotebookPhaseMetadata } from '@/types/notebook';

export interface SidebarTabNode {
  tabId: string;
  tabName: string;
  notebooks: Notebook[];
}

export interface SidebarPhaseNode {
  phase: NotebookPhaseMetadata['phase'] & string;
  tabs: SidebarTabNode[];
  notebooks: Notebook[];
}

const NOTEBOOK_PHASES: Array<NotebookPhaseMetadata['phase'] & string> = [
  'preprocessing',
  'feature-engineering',
  'training'
];

/**
 * Fetches project notebooks directly from the API (independent of notebook store lifecycle)
 * and groups them into a phase → tab → notebook tree for sidebar rendering.
 *
 * Also syncs from the notebook store when phase panels create/delete/rename notebooks,
 * so the sidebar stays up-to-date without extra API calls.
 */
export function useSidebarNotebookTree(projectId: string | undefined) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);

  // Fetch notebooks directly from API when project changes
  useEffect(() => {
    if (!projectId) {
      setNotebooks([]);
      return;
    }
    let cancelled = false;
    void notebooksApi.listNotebooks(projectId).then((result) => {
      if (!cancelled) setNotebooks(result);
    }).catch(() => {
      // Silently fail — sidebar just won't show notebook sub-trees
    });
    return () => { cancelled = true; };
  }, [projectId]);

  // Sync from store when phase panels mutate notebooks
  const storeNotebooks = useNotebookStore((state) => state.notebooks);
  const storeProjectId = useNotebookStore((state) => state.currentProjectId);

  useEffect(() => {
    if (storeProjectId === projectId) {
      setNotebooks(storeNotebooks);
    }
  }, [storeNotebooks, storeProjectId, projectId]);

  return useMemo((): SidebarPhaseNode[] => {
    if (!projectId) return [];

    return NOTEBOOK_PHASES.map((phase) => {
      const phaseNotebooks = notebooks.filter(
        (nb) => (nb.metadata as NotebookPhaseMetadata)?.phase === phase
      );

      // Preprocessing & feature-engineering: group by tabId
      if (phase === 'preprocessing' || phase === 'feature-engineering') {
        const tabMap = new Map<string, SidebarTabNode>();
        const ungrouped: Notebook[] = [];

        for (const nb of phaseNotebooks) {
          const meta = nb.metadata as NotebookPhaseMetadata;
          if (meta.tabId) {
            const existing = tabMap.get(meta.tabId);
            if (existing) {
              existing.notebooks.push(nb);
            } else {
              tabMap.set(meta.tabId, {
                tabId: meta.tabId,
                tabName: meta.tabName ?? meta.tabId,
                notebooks: [nb]
              });
            }
          } else {
            ungrouped.push(nb);
          }
        }

        return { phase, tabs: Array.from(tabMap.values()), notebooks: ungrouped };
      }

      // Training: flat list, no tabs
      return { phase, tabs: [], notebooks: phaseNotebooks };
    });
  }, [notebooks, projectId]);
}
