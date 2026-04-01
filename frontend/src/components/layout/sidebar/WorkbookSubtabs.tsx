/**
 * WorkbookSubtabs — renders workbooks under Processing/FE/Training phases.
 * Reads from workbookRegistryStore for reactive updates.
 * Reads its own URL params to determine the active workbook, keeping
 * searchParams reactivity isolated from the parent WorkflowPhaseTree.
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MoreVertical, Notebook, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { RenameTabDialog } from '@/components/preprocessing/PreprocessingDialogs';
import { useWorkbookRegistryStore, type WorkbookPhase } from '@/stores/workbookRegistryStore';
import { getWorkbookParam } from '@/lib/workbookParam';
import { SubtabItem } from './SubtabItem';

interface WorkbookSubtabsProps {
  projectId: string;
  /** Phase key — doubles as both the registry store key and URL path segment. */
  phase: WorkbookPhase;
  /** Whether this phase is the currently active one in the sidebar. */
  isActivePhase: boolean;
}

function WorkbookActionMenu({
  onRename,
  onDelete
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 -my-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-3 w-3" />
          <span className="sr-only">Workbook options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onRename(); }}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleClick = (workbookId: string) => {
    navigate(`/project/${projectId}/${phase}?workbook=${workbookId}`);
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
    removeWorkbook(phase, workbookId);
    if (activeWorkbookId === workbookId) {
      navigate(`/project/${projectId}/${phase}`);
    }
  };

  if (workbooks.length === 0) {
    return (
      <SubtabItem
        icon={Notebook}
        label="New workbook"
        isActive={false}
        onClick={() => navigate(`/project/${projectId}/${phase}`)}
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
            onClick={() => handleClick(wb.id)}
            actionSlot={
              <WorkbookActionMenu
                onRename={() => openRename(wb.id, wb.name)}
                onDelete={() => handleDelete(wb.id)}
              />
            }
          />
        ))}
      </div>

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
