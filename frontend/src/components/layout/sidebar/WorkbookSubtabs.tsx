/**
 * WorkbookSubtabs — renders workbooks under Processing/FE/Training phases.
 * Reads from workbookRegistryStore for reactive updates.
 * Reads its own URL params to determine the active workbook, keeping
 * searchParams reactivity isolated from the parent WorkflowPhaseTree.
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Notebook, Pencil, Trash2 } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { RenameTabDialog } from '@/components/preprocessing/PreprocessingDialogs';
import { useWorkbookRegistryStore, type WorkbookPhase } from '@/stores/workbookRegistryStore';
import { getWorkbookParam } from '@/lib/workbookParam';
import { SubtabItem } from './SubtabItem';
import { SidebarSubtabActionMenu } from './SidebarSubtabActionMenu';
import { useSidebarDeleteConfirm } from './useSidebarDeleteConfirm';

interface WorkbookSubtabsProps {
  projectId: string;
  /** Phase key — doubles as both the registry store key and URL path segment. */
  phase: WorkbookPhase;
  /** Whether this phase is the currently active one in the sidebar. */
  isActivePhase: boolean;
}

export function WorkbookSubtabs({
  projectId,
  phase,
  isActivePhase
}: WorkbookSubtabsProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workbooks = useWorkbookRegistryStore((state) => state[phase]);
  const updateWorkbook = useWorkbookRegistryStore((s) => s.updateWorkbook);
  const removeWorkbook = useWorkbookRegistryStore((s) => s.removeWorkbook);
  const activeWorkbookId = isActivePhase ? getWorkbookParam(searchParams) : undefined;

  const { requestDelete, confirmDialog } = useSidebarDeleteConfirm();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const navigateToPhase = (workbookId?: string) => {
    navigate(workbookId
      ? `/project/${projectId}/${phase}?workbook=${workbookId}`
      : `/project/${projectId}/${phase}`);
  };

  const openRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const handleRenameConfirm = () => {
    if (!renamingId || !renameValue.trim()) return;
    updateWorkbook(phase, renamingId, { name: renameValue.trim() });
    setRenamingId(null);
  };

  const handleDelete = (workbookId: string) => {
    const handler = useWorkbookRegistryStore.getState().deleteHandlers[phase];
    if (handler) {
      const nextActiveId = handler(workbookId);
      if (nextActiveId === undefined) return; // rejected (e.g. approved version)
      if (activeWorkbookId === workbookId) navigateToPhase(nextActiveId);
      return;
    }
    // Fallback for phases without a registered handler (preprocessing, training)
    removeWorkbook(phase, workbookId);
    if (activeWorkbookId === workbookId) navigateToPhase();
  };

  if (workbooks.length === 0) {
    return (
      <SubtabItem
        icon={Notebook}
        label="New workbook"
        isActive={false}
        onClick={() => navigateToPhase()}
      />
    );
  }

  return (
    <>
      <div className="space-y-0.5">
        {workbooks.map((wb) => (
          <SubtabItem
            key={wb.id}
            icon={Notebook}
            label={wb.name}
            isActive={wb.id === activeWorkbookId}
            onClick={() => navigateToPhase(wb.id)}
            actionSlot={
              <SidebarSubtabActionMenu ariaLabel="Workbook options">
                <DropdownMenuItem onClick={() => openRename(wb.id, wb.name)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    requestDelete({
                      title: 'Delete workbook?',
                      description: `Permanently remove "${wb.name}". This cannot be undone.`,
                      onConfirm: () => handleDelete(wb.id)
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
        ))}
      </div>

      {confirmDialog}

      <RenameTabDialog
        open={!!renamingId}
        onOpenChange={(open) => { if (!open) setRenamingId(null); }}
        value={renameValue}
        onValueChange={setRenameValue}
        onSave={handleRenameConfirm}
        title="Rename workbook"
        description="Enter a new name for this workbook."
        placeholder="Workbook name"
      />
    </>
  );
}
