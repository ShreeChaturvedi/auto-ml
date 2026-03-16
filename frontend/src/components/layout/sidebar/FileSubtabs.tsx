/**
 * FileSubtabs — renders data files + separator + context files under Explorer phase.
 */

import { useState } from 'react';
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
import { cn } from '@/lib/utils';
import type { UploadedFile } from '@/types/file';

interface FileSubtabsProps {
  projectId: string;
  themeColorClass: string;
}

function FileItem({
  file,
  isActive,
  themeColorClass,
  onOpen,
  onDelete,
  onDownload
}: {
  file: UploadedFile;
  isActive: boolean;
  themeColorClass: string;
  onOpen: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const { Icon, colorClass } = resolveFileIcon(file.type);
  const [hovered, setHovered] = useState(false);

  const iconColor = isActive || hovered ? colorClass : 'text-muted-foreground';

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-1.5 transition-colors cursor-pointer text-xs truncate',
        isActive
          ? 'font-medium'
          : 'text-muted-foreground hover:text-foreground hover:underline underline-offset-2 decoration-muted-foreground/50'
      )}
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative z-10 shrink-0 rounded-sm bg-card">
        <Icon className={cn('h-3.5 w-3.5 transition-colors duration-200', iconColor)} />
      </div>
      <span className={cn('flex-1 truncate', isActive && themeColorClass)}>{file.name}</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-3.5 w-3.5" />
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
    </div>
  );
}

export function FileSubtabs({ projectId, themeColorClass }: FileSubtabsProps) {
  const { dataFiles, contextFiles, activeFileTabId, isOnDataViewer, handleOpenFile, handleDeleteFile, handleDownloadFile } = useFileActions(projectId);

  if (dataFiles.length === 0 && contextFiles.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {dataFiles.map((file) => (
        <FileItem
          key={file.id}
          file={file}
          isActive={isOnDataViewer && file.id === activeFileTabId}
          themeColorClass={themeColorClass}
          onOpen={() => handleOpenFile(file.id)}
          onDelete={() => handleDeleteFile(file)}
          onDownload={() => handleDownloadFile(file)}
        />
      ))}

      {dataFiles.length > 0 && contextFiles.length > 0 && (
        <div className="my-1 mx-3 border-t border-border/50" />
      )}

      {contextFiles.map((file) => (
        <FileItem
          key={file.id}
          file={file}
          isActive={isOnDataViewer && file.id === activeFileTabId}
          themeColorClass={themeColorClass}
          onOpen={() => handleOpenFile(file.id)}
          onDelete={() => handleDeleteFile(file)}
          onDownload={() => handleDownloadFile(file)}
        />
      ))}
    </div>
  );
}
