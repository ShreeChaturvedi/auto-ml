import { useCallback, useEffect, useMemo } from 'react';
import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileCode,
  FileText,
  FileSpreadsheet,
  FileType,
  File,
  MoreVertical,
  Download,
  Trash2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { useDataStore } from '@/stores/dataStore';
import { deleteDataset, downloadDataset } from '@/lib/api/datasets';
import { deleteDocument, downloadDocument } from '@/lib/api/documents';
import { cn } from '@/lib/utils';
import type { FileType as UploadedFileType, UploadedFile } from '@/types/file';

interface FileExplorerProps {
  projectId: string;
}

const iconByType: Record<UploadedFileType, ComponentType<{ className?: string }>> = {
  csv: FileSpreadsheet,
  json: FileSpreadsheet,
  excel: FileSpreadsheet,
  pdf: FileText,
  markdown: FileCode,
  word: FileType,
  text: FileText,
  other: File
};

// Colors for file type icons when selected
const activeIconColorByType: Record<UploadedFileType, string> = {
  csv: 'text-green-500',
  json: 'text-blue-500',
  excel: 'text-emerald-500',
  pdf: 'text-red-500',
  markdown: 'text-purple-500',
  word: 'text-blue-500',
  text: 'text-muted-foreground',
  other: 'text-muted-foreground'
};

interface FileItemProps {
  file: UploadedFile;
  isActive: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onDownload: () => void;
}

function FileItem({ file, isActive, onOpen, onDelete, onDownload }: FileItemProps) {
  const Icon = iconByType[file.type] ?? File;
  const iconColor = isActive
    ? activeIconColorByType[file.type] ?? 'text-muted-foreground'
    : 'text-muted-foreground';

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer',
        isActive
          ? 'bg-muted text-foreground font-medium'
          : 'text-foreground hover:bg-muted'
      )}
      onClick={onOpen}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
      <span className="text-workflow truncate flex-1">{file.name}</span>

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

export function FileExplorer({ projectId }: FileExplorerProps) {
  const navigate = useNavigate();
  const files = useDataStore((state) => state.files);
  const activeFileTabId = useDataStore((state) => state.activeFileTabId);
  const openFileTab = useDataStore((state) => state.openFileTab);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);
  const removeFile = useDataStore((state) => state.removeFile);

  useEffect(() => {
    if (projectId) {
      void hydrateFromBackend(projectId);
    }
  }, [projectId, hydrateFromBackend]);

  const projectFiles = useMemo(
    () => files.filter((file) => file.projectId === projectId),
    [files, projectId]
  );

  const dataFiles = useMemo(
    () => projectFiles.filter((file) => ['csv', 'json', 'excel'].includes(file.type)),
    [projectFiles]
  );

  const contextFiles = useMemo(
    () => projectFiles.filter((file) => !['csv', 'json', 'excel'].includes(file.type)),
    [projectFiles]
  );

  const handleOpenFile = useCallback((fileId: string) => {
    openFileTab(fileId);
    navigate(`/project/${projectId}/data-viewer`);
  }, [openFileTab, navigate, projectId]);

  const handleDeleteFile = useCallback(async (file: UploadedFile) => {
    try {
      const datasetId = file.metadata?.datasetId;
      const documentId = file.metadata?.documentId;

      if (datasetId) {
        await deleteDataset(datasetId);
      } else if (documentId) {
        await deleteDocument(documentId);
      }

      removeFile(file.id);
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  }, [removeFile]);

  const handleDownloadFile = useCallback(async (file: UploadedFile) => {
    try {
      const datasetId = file.metadata?.datasetId;
      const documentId = file.metadata?.documentId;
      let blob: Blob;

      if (datasetId) {
        const buffer = await downloadDataset(datasetId);
        blob = new Blob([buffer]);
      } else if (documentId) {
        blob = await downloadDocument(documentId);
      } else {
        console.error('No dataset or document ID found');
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  }, []);

  const renderFileList = (fileList: UploadedFile[], emptyMessage: string) => {
    if (fileList.length === 0) {
      return (
        <div className="px-3 py-2 text-workflow text-muted-foreground">
          {emptyMessage}
        </div>
      );
    }

    return (
      <div className="space-y-0.5">
        {fileList.map((file) => (
          <FileItem
            key={file.id}
            file={file}
            isActive={file.id === activeFileTabId}
            onOpen={() => handleOpenFile(file.id)}
            onDelete={() => handleDeleteFile(file)}
            onDownload={() => handleDownloadFile(file)}
          />
        ))}
      </div>
    );
  };

  if (projectFiles.length === 0) {
    return (
      <div className="space-y-4">
        <CollapsibleSection title="Data Files">
          <div className="px-3 py-2 text-workflow text-muted-foreground">
            No datasets yet.
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Context Files">
          <div className="px-3 py-2 text-workflow text-muted-foreground">
            No context docs yet.
          </div>
        </CollapsibleSection>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CollapsibleSection title="Data Files">
        {renderFileList(dataFiles, 'No datasets yet.')}
      </CollapsibleSection>

      <CollapsibleSection title="Context Files">
        {renderFileList(contextFiles, 'No context docs yet.')}
      </CollapsibleSection>
    </div>
  );
}
