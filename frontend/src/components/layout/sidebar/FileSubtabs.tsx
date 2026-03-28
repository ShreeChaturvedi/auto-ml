/**
 * FileSubtabs — renders data files + separator + context files under Explorer phase.
 * Reuses SubtabItem for uniform sidebar spacing.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { MoreVertical, Download, Trash2, Pencil } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFileActions } from '@/hooks/useFileActions';
import { useDataStore } from '@/stores/dataStore';
import { renameDataset } from '@/lib/api/datasets';
import { resolveFileIcon } from '@/lib/fileUtils';
import type { UploadedFile } from '@/types/file';
import { SubtabItem } from './SubtabItem';

interface FileSubtabsProps {
  projectId: string;
}

function FileActionMenu({
  onRename,
  onDownload,
  onDelete
}: {
  onRename: () => void;
  onDownload: () => void;
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
          <span className="sr-only">File options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Download
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FileSubtabs({ projectId }: FileSubtabsProps) {
  const {
    dataFiles,
    contextFiles,
    activeFileTabId,
    isOnDataViewer,
    handleOpenFile,
    handleDeleteFile,
    handleDownloadFile
  } = useFileActions(projectId);

  const [renamingFile, setRenamingFile] = useState<UploadedFile | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const openRenameDialog = (file: UploadedFile) => {
    setRenamingFile(file);
    setRenameValue(file.name);
  };

  const handleRenameConfirm = async () => {
    if (!renamingFile || !renameValue.trim()) return;
    const datasetId = renamingFile.metadata?.datasetId;
    if (!datasetId) return;
    try {
      await renameDataset(datasetId, renameValue.trim());
      await useDataStore.getState().hydrateFromBackend(projectId, { force: true });
      toast.success('File renamed');
    } catch {
      toast.error('Failed to rename file');
    }
    setRenamingFile(null);
  };

  if (dataFiles.length === 0 && contextFiles.length === 0) return null;

  const renderFile = (file: UploadedFile) => {
    const { Icon, colorClass } = resolveFileIcon(file.type);
    return (
      <SubtabItem
        key={file.id}
        icon={Icon}
        label={file.name}
        isActive={isOnDataViewer && file.id === activeFileTabId}

        iconColorClass={colorClass}
        onClick={() => handleOpenFile(file.id)}
        actionSlot={
          <FileActionMenu
            onRename={() => openRenameDialog(file)}
            onDownload={() => handleDownloadFile(file)}
            onDelete={() => handleDeleteFile(file)}
          />
        }
      />
    );
  };

  return (
    <>
      <div className="space-y-0.5">
        {dataFiles.map(renderFile)}

        {dataFiles.length > 0 && contextFiles.length > 0 && (
          <div className="my-1 mx-3 border-t border-border/50" />
        )}

        {contextFiles.map(renderFile)}
      </div>

      <Dialog open={!!renamingFile} onOpenChange={(open) => { if (!open) setRenamingFile(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>Enter a new name for this file.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleRenameConfirm(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFile(null)}>Cancel</Button>
            <Button onClick={() => void handleRenameConfirm()} disabled={!renameValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
