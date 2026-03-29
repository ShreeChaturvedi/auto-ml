import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  MoreVertical,
  Download,
  Trash2,
  ClipboardList,
  Plus,
  Pencil
} from 'lucide-react';
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
import { useProjectPlans } from '@/hooks/useProjectPlans';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { useDataStore } from '@/stores/dataStore';
import { renameDataset } from '@/lib/api/datasets';
import { cn } from '@/lib/utils';
import { resolveFileIcon } from '@/lib/fileUtils';
import type { UploadedFile } from '@/types/file';

interface FileExplorerProps {
  projectId: string;
}


interface FileItemProps {
  file: UploadedFile;
  isActive: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onRename: () => void;
}

function FileItem({ file, isActive, onOpen, onDelete, onDownload, onRename }: FileItemProps) {
  const { Icon, colorClass } = resolveFileIcon(file.type);
  const [hovered, setHovered] = useState(false);

  const iconColor = isActive
    ? colorClass
    : hovered
      ? colorClass
      : 'text-muted-foreground';

  return (
    <div
      className={cn(
        'group flex h-9 items-center gap-2 px-3 rounded-lg transition-colors cursor-pointer',
        isActive
          ? 'bg-muted text-foreground font-medium'
          : 'text-foreground hover:bg-muted'
      )}
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0 transition-colors duration-200', iconColor)} />
      <span className="text-workflow truncate flex-1" title={file.name}>{file.name}</span>

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
    </div>
  );
}

interface PlanItemProps {
  name: string;
  isActive: boolean;
  themeColorClass: string;
  onOpen: () => void;
}

function PlanItem({ name, isActive, themeColorClass, onOpen }: PlanItemProps) {
  const [hovered, setHovered] = useState(false);

  const iconColor = isActive
    ? themeColorClass
    : hovered
      ? themeColorClass
      : 'text-muted-foreground';

  return (
    <div
      className={cn(
        'group flex h-9 items-center gap-2 px-3 rounded-lg transition-colors cursor-pointer',
        isActive
          ? 'bg-muted text-foreground font-medium'
          : 'text-foreground hover:bg-muted'
      )}
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ClipboardList className={cn('h-3.5 w-3.5 shrink-0 transition-colors duration-200', iconColor)} />
      <span className="text-workflow truncate flex-1">{name}</span>
    </div>
  );
}

export function FileExplorer({ projectId }: FileExplorerProps) {
  const location = useLocation();
  const { dataFiles, contextFiles, activeFileTabId, isOnDataViewer, handleOpenFile, handleDeleteFile, handleDownloadFile } = useFileActions(projectId);
  const { plans, selectedPlanId, handleOpenPlan, handleCreateNewPlan } = useProjectPlans(projectId);
  const { themeColorClass } = useProjectThemeColor();

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

  const isOnUpload = location.pathname.endsWith('/upload');

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
            isActive={isOnDataViewer && file.id === activeFileTabId}
            onOpen={() => handleOpenFile(file.id)}
            onDelete={() => handleDeleteFile(file)}
            onDownload={() => handleDownloadFile(file)}
            onRename={() => openRenameDialog(file)}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-4">
        <section>
          <h2 className="px-2 py-1 text-workflow-label font-semibold text-muted-foreground uppercase tracking-wider">Data Files</h2>
          {renderFileList(dataFiles, 'No datasets yet.')}
        </section>

        <section>
          <h2 className="px-2 py-1 text-workflow-label font-semibold text-muted-foreground uppercase tracking-wider">Context Files</h2>
          {renderFileList(contextFiles, 'No context docs yet.')}
        </section>

        <section>
          <div className="flex items-center gap-1 px-2 py-1">
            <h2 className="flex-1 text-workflow-label font-semibold text-muted-foreground uppercase tracking-wider">Plans</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-muted"
              onClick={handleCreateNewPlan}
              title="Create new plan"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
          {plans.length > 0 ? (
            <div className="space-y-0.5">
              {plans.map((plan) => (
                <PlanItem
                  key={plan.id}
                  name={plan.name}
                  isActive={isOnUpload && plan.id === selectedPlanId}
                  themeColorClass={themeColorClass ?? ''}
                  onOpen={() => handleOpenPlan(plan.id)}
                />
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-workflow text-muted-foreground cursor-pointer hover:text-foreground hover:underline" onClick={handleCreateNewPlan}>
              Create a plan
            </div>
          )}
        </section>
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
