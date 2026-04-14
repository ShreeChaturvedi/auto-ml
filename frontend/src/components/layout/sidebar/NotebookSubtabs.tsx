/**
 * NotebookSubtabs — renders standalone notebooks under the Explorer phase,
 * sibling of FileSubtabs. Always shows a "New notebook" action row at the
 * top so the section is reachable even when no notebooks exist yet.
 *
 * Active state mirrors the data-viewer tab model: a notebook is "active"
 * when its id is the currently focused tab AND the tab type is 'notebook'.
 */

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { RenameTabDialog } from '@/components/preprocessing/PreprocessingDialogs';
import { useDataStore } from '@/stores/dataStore';
import { useNotebookStore } from '@/stores/notebookStore';
import {
  createNotebook as createNotebookApi,
  deleteNotebook as deleteNotebookApi
} from '@/lib/api/notebooks';
import type { Notebook } from '@/types/notebook';
import { cn } from '@/lib/utils';
import { NOTEBOOK_ICON_CLASS } from '@/lib/notebookTheme';
import { SidebarSubtabSectionDivider } from './SidebarSubtabSectionDivider';
import { SubtabItem } from './SubtabItem';
import { SidebarSubtabActionMenu } from './SidebarSubtabActionMenu';
import { useSidebarDeleteConfirm } from './useSidebarDeleteConfirm';

interface NotebookSubtabsProps {
  projectId: string;
}

/** Jupyter-orange "NB" badge used as the sidebar icon for notebook subtabs. */
function NotebookBadgeIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-center justify-center rounded-[3px] border',
        'text-[7px] font-bold leading-none tracking-tight',
        'border-current',
        NOTEBOOK_ICON_CLASS,
        className
      )}
      style={{ paddingInline: 1 }}
    >
      NB
    </span>
  );
}

function defaultNotebookName(existing: Notebook[]): string {
  const taken = new Set(existing.map((nb) => nb.name));
  let idx = existing.length + 1;
  while (taken.has(`Notebook ${idx}`)) idx += 1;
  return `Notebook ${idx}`;
}

export function NotebookSubtabs({ projectId }: NotebookSubtabsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeFileTabId = useDataStore((s) => s.activeFileTabId);
  const fileTabType = useDataStore((s) => s.fileTabType);
  const isOnDataViewer = location.pathname.endsWith('/data-viewer');

  // Read standalone notebooks from the shared notebook store so every
  // surface (sidebar, tab bar, data viewer) stays in sync. useShallow keeps
  // this stable across re-renders even though .filter() returns a new array.
  const notebooks = useNotebookStore(
    useShallow((state) =>
      state.notebooks.filter(
        (nb) => nb.kind === 'standalone' && nb.projectId === projectId
      )
    )
  );

  const [isCreating, setIsCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Notebook | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createValue, setCreateValue] = useState('');

  const { requestDelete, confirmDialog } = useSidebarDeleteConfirm();

  // Seed the store once per project so tests and first renders see data.
  // The store itself dedupes when already initialized for this project.
  useEffect(() => {
    void useNotebookStore.getState().loadNotebooks(projectId);
  }, [projectId]);

  const handleOpen = (notebookId: string) => {
    useDataStore.getState().openNotebookTab(notebookId);
    if (!isOnDataViewer) {
      navigate(`/project/${projectId}/data-viewer`);
    }
  };

  const openCreateDialog = () => {
    setCreateValue(defaultNotebookName(notebooks));
    setCreateOpen(true);
  };

  const handleCreateConfirm = async () => {
    const name = createValue.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    try {
      // The store's createNotebook action doesn't support `kind`, so call the
      // API directly and then refresh the store so all surfaces pick it up.
      const nb = await createNotebookApi(projectId, { name, kind: 'standalone' });
      await useNotebookStore.getState().loadNotebooks(projectId);
      setCreateOpen(false);
      toast.success(`${nb.name} created`);
      useDataStore.getState().openNotebookTab(nb.notebookId);
      if (!isOnDataViewer) {
        navigate(`/project/${projectId}/data-viewer`);
      }
    } catch (error) {
      console.error('[NotebookSubtabs] Failed to create notebook:', error);
      toast.error('Failed to create notebook');
    } finally {
      setIsCreating(false);
    }
  };

  const openRenameDialog = (nb: Notebook) => {
    setRenameTarget(nb);
    setRenameValue(nb.name);
  };

  const handleRenameConfirm = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name || name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    const result = await useNotebookStore
      .getState()
      .renameNotebook(renameTarget.notebookId, name);
    if (result) {
      toast.success('Notebook renamed');
    } else {
      toast.error('Failed to rename notebook');
    }
    setRenameTarget(null);
  };

  const handleDelete = async (nb: Notebook) => {
    // Call the API directly because the store's deleteNotebook requires a
    // `currentProjectId` that may not be set when the sidebar is the only
    // consumer. Refresh the store afterwards so all surfaces stay in sync.
    try {
      await deleteNotebookApi(projectId, nb.notebookId);
      await useNotebookStore.getState().loadNotebooks(projectId);
      toast.success('Notebook deleted');
    } catch (error) {
      console.error('[NotebookSubtabs] Failed to delete notebook:', error);
      toast.error('Failed to delete notebook');
    }
  };

  return (
    <>
      <SidebarSubtabSectionDivider />

      <div className="space-y-0.5">
        <SubtabItem
          icon={Plus}
          label="New notebook"
          isActive={false}
          onClick={openCreateDialog}
        />

        {notebooks.map((nb) => {
          const isActive =
            isOnDataViewer
            && activeFileTabId === nb.notebookId
            && fileTabType === 'notebook';
          return (
            <SubtabItem
              key={nb.notebookId}
              icon={NotebookBadgeIcon}
              label={nb.name}
              isActive={isActive}
              iconColorClass={NOTEBOOK_ICON_CLASS}
              onClick={() => handleOpen(nb.notebookId)}
              actionSlot={
                <SidebarSubtabActionMenu ariaLabel="Notebook options">
                  <DropdownMenuItem onClick={() => openRenameDialog(nb)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      requestDelete({
                        title: 'Delete notebook?',
                        description: `Permanently remove "${nb.name}". This cannot be undone.`,
                        onConfirm: () => void handleDelete(nb)
                      })
                    }
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </SidebarSubtabActionMenu>
              }
            />
          );
        })}
      </div>

      {confirmDialog}

      <RenameTabDialog
        open={!!renameTarget}
        onOpenChange={(open) => { if (!open) setRenameTarget(null); }}
        value={renameValue}
        onValueChange={setRenameValue}
        onSave={() => void handleRenameConfirm()}
        title="Rename notebook"
        description="Enter a new name for this notebook."
        placeholder="Notebook name"
      />

      <RenameTabDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && !isCreating) setCreateOpen(false);
        }}
        value={createValue}
        onValueChange={setCreateValue}
        onSave={() => void handleCreateConfirm()}
        title="New notebook"
        description="Create a standalone notebook in this project."
        placeholder="Notebook name"
      />
    </>
  );
}
