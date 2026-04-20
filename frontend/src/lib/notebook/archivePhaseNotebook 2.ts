import { deleteNotebook, listCells, updateNotebook } from '@/lib/api/notebooks';

type ArchivablePhase = 'feature-engineering' | 'training';

export async function archivePhaseNotebook(params: {
  projectId: string;
  notebookId: string;
  phase: ArchivablePhase;
  tabId?: string | null;
  tabName?: string | null;
}): Promise<'archived' | 'deleted'> {
  const cells = await listCells(params.notebookId);
  if (cells.length === 0) {
    await deleteNotebook(params.projectId, params.notebookId);
    return 'deleted';
  }

  await updateNotebook(params.notebookId, {
    metadata: {
      phase: 'archived',
      archivedFromPhase: params.phase,
      archivedTabId: params.tabId ?? null,
      archivedTabName: params.tabName ?? null,
      archivedAt: new Date().toISOString()
    }
  });
  return 'archived';
}
