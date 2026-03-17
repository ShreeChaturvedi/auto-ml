/**
 * FileSubtabs — renders data files + separator + context files under Explorer phase.
 * Reuses SubtabItem for uniform sidebar spacing.
 */

import { MoreVertical, Download, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useFileActions } from '@/hooks/useFileActions';
import { resolveFileIcon } from '@/lib/fileUtils';
import type { UploadedFile } from '@/types/file';
import { SubtabItem } from './SubtabItem';

interface FileSubtabsProps {
  projectId: string;
  themeColorClass: string;
}

function FileActionMenu({
  onDownload,
  onDelete
}: {
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

export function FileSubtabs({ projectId, themeColorClass }: FileSubtabsProps) {
  const {
    dataFiles,
    contextFiles,
    activeFileTabId,
    isOnDataViewer,
    handleOpenFile,
    handleDeleteFile,
    handleDownloadFile
  } = useFileActions(projectId);

  if (dataFiles.length === 0 && contextFiles.length === 0) return null;

  const renderFile = (file: UploadedFile) => {
    const { Icon, colorClass } = resolveFileIcon(file.type);
    return (
      <SubtabItem
        key={file.id}
        icon={Icon}
        label={file.name}
        isActive={isOnDataViewer && file.id === activeFileTabId}
        themeColorClass={themeColorClass}
        iconColorClass={colorClass}
        onClick={() => handleOpenFile(file.id)}
        actionSlot={
          <FileActionMenu
            onDownload={() => handleDownloadFile(file)}
            onDelete={() => handleDeleteFile(file)}
          />
        }
      />
    );
  };

  return (
    <div className="space-y-0.5">
      {dataFiles.map(renderFile)}

      {dataFiles.length > 0 && contextFiles.length > 0 && (
        <div className="my-1 mx-3 border-t border-border/50" />
      )}

      {contextFiles.map(renderFile)}
    </div>
  );
}
