/**
 * FileSubtabs — renders data files + separator + context files under Explorer phase.
 * Reuses SubtabItem for uniform sidebar spacing.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Trash2, Pencil } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { RenameTabDialog } from '@/components/preprocessing/PreprocessingDialogs';
import { useFileActions } from '@/hooks/useFileActions';
import { useDataStore } from '@/stores/dataStore';
import { renameDataset } from '@/lib/api/datasets';
import { resolveFileIcon } from '@/lib/fileUtils';
import type { UploadedFile } from '@/types/file';
import { SubtabItem } from './SubtabItem';
import { SidebarSubtabActionMenu } from './SidebarSubtabActionMenu';
import { useSidebarDeleteConfirm } from './useSidebarDeleteConfirm';

interface FileSubtabsProps {
  projectId: string;
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

  const { requestDelete, confirmDialog } = useSidebarDeleteConfirm();

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
          <SidebarSubtabActionMenu ariaLabel="File options">
            <DropdownMenuItem onClick={() => openRenameDialog(file)}>
              <Pencil className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownloadFile(file)}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                requestDelete({
                  title: 'Delete file?',
                  description: `Permanently remove "${file.name}" from this project. This cannot be undone.`,
                  onConfirm: () => handleDeleteFile(file)
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

      {confirmDialog}

      <RenameTabDialog
        open={!!renamingFile}
        onOpenChange={(open) => { if (!open) setRenamingFile(null); }}
        value={renameValue}
        onValueChange={setRenameValue}
        onSave={() => void handleRenameConfirm()}
        title="Rename file"
        description="Enter a new name for this file."
        placeholder="File name"
      />
    </>
  );
}
