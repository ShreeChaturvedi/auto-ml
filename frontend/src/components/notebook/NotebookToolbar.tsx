/**
 * NotebookToolbar - Right-pane ribbon for notebook management and cloud runtime.
 *
 * Layout: <Selector> <+> <Text> <Code> <⋮>  ···  <Cloud Badge>
 *
 * The cloud badge is clickable and opens the RuntimeManagerDialog.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { useNotebookStore } from '@/stores/notebookStore';
import { useExecutionStore } from '@/stores/executionStore';
import { restartKernel } from '@/lib/api/notebooks';
import { RuntimeManagerDialog } from '@/components/training/RuntimeManagerDialog';
import {
  COMPACT_TOOLBAR_GROUP_CLASS,
  COMPACT_TOOLBAR_ICON_BUTTON_CLASS,
  compactToolbarSelectClass
} from '@/components/agentic/toolbarStyles';
import { Code, Loader2, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, Type, Upload } from 'lucide-react';
import { parseIpynb, importIpynb } from '@/lib/notebook/ipynbImporter';
import { cn } from '@/lib/utils';
import type { NotebookCellType, NotebookPhaseMetadata } from '@/types/notebook';

const NOTEBOOK_PHASE_SET = new Set<string>(['preprocessing', 'feature-engineering', 'training']);

interface NotebookToolbarProps {
  projectId: string;
  className?: string;
}

export function NotebookToolbar({ projectId, className }: NotebookToolbarProps) {
  // Derive notebook phase from the current route (/project/:projectId/:phase)
  const { phase: routePhase } = useParams<{ phase: string }>();
  const phase = NOTEBOOK_PHASE_SET.has(routePhase ?? '')
    ? (routePhase as NotebookPhaseMetadata['phase'])
    : undefined;
  const notebook = useNotebookStore((state) => state.notebook);
  const notebooks = useNotebookStore((state) => state.notebooks);
  const activeNotebookId = useNotebookStore((state) => state.activeNotebookId);
  const isSaving = useNotebookStore((state) => state.isSaving);
  const createNotebook = useNotebookStore((state) => state.createNotebook);
  const renameNotebook = useNotebookStore((state) => state.renameNotebook);
  const deleteNotebook = useNotebookStore((state) => state.deleteNotebook);
  const setActiveNotebook = useNotebookStore((state) => state.setActiveNotebook);
  const createCell = useNotebookStore((state) => state.createCell);

  const cloudAvailable = useExecutionStore((state) => state.cloudAvailable);
  const cloudInitializing = useExecutionStore((state) => state.cloudInitializing);
  const sessionId = useExecutionStore((state) => state.sessionId);
  const checkCloudHealth = useExecutionStore((state) => state.checkCloudHealth);
  const initializeCloud = useExecutionStore((state) => state.initializeCloud);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canDeleteNotebook = useMemo(() => notebooks.length > 1, [notebooks.length]);

  const nextNotebookNumber = useMemo(() => {
    const maxNum = notebooks.reduce((max, nb) => {
      const match = nb.name.match(/^Notebook (\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    return maxNum + 1;
  }, [notebooks]);

  // Bootstrap cloud runtime
  useEffect(() => {
    checkCloudHealth().catch(() => undefined);
  }, [checkCloudHealth]);

  useEffect(() => {
    if (projectId && cloudAvailable && !sessionId && !cloudInitializing) {
      initializeCloud(projectId).catch(() => undefined);
    }
  }, [projectId, cloudAvailable, sessionId, cloudInitializing, initializeCloud]);

  const handleCreateDialogOpen = useCallback((open: boolean) => {
    setCreateDialogOpen(open);
    if (open) setCreateName(`Notebook ${nextNotebookNumber}`);
  }, [nextNotebookNumber]);

  const handleAddCell = useCallback(async (cellType: NotebookCellType) => {
    await createCell({ content: '', cellType, position: 0 });
  }, [createCell]);

  const handleCreateNotebook = useCallback(async () => {
    const metadata = phase ? { phase } : undefined;
    const created = await createNotebook(createName.trim() || undefined, metadata);
    if (created) {
      setCreateDialogOpen(false);
      setCreateName('');
    }
  }, [createName, createNotebook, phase]);

  const openRenameDialog = useCallback(() => {
    if (!notebook) return;
    setRenameName(notebook.name);
    setRenameDialogOpen(true);
  }, [notebook]);

  const handleRenameNotebook = useCallback(async () => {
    if (!notebook) return;
    const updated = await renameNotebook(notebook.notebookId, renameName.trim());
    if (updated) setRenameDialogOpen(false);
  }, [notebook, renameName, renameNotebook]);

  const handleDeleteNotebook = useCallback(async () => {
    if (!notebook || !canDeleteNotebook) return;
    if (!window.confirm(`Delete notebook "${notebook.name}"?`)) return;
    await deleteNotebook(notebook.notebookId);
  }, [canDeleteNotebook, deleteNotebook, notebook]);

  const handleRestartKernel = useCallback(async () => {
    const pid = notebook?.projectId;
    if (!pid) return;
    setIsRestarting(true);
    try {
      await restartKernel(pid);
    } catch (error) {
      console.error('Failed to restart kernel:', error);
    } finally {
      setIsRestarting(false);
    }
  }, [notebook?.projectId]);

  const handleUploadIpynb = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseIpynb(text, file.name);
      const metadata = phase ? { phase } : undefined;
      const imported = await importIpynb(projectId, parsed, metadata);

      // Reload notebooks and switch to the imported one
      const loadNotebooks = useNotebookStore.getState().loadNotebooks;
      await loadNotebooks();
      await setActiveNotebook(imported.notebookId);
    } catch (error) {
      console.error('Failed to import .ipynb:', error);
      const message = error instanceof Error ? error.message : 'Failed to import notebook';
      useNotebookStore.getState().setError(message);
    }

    // Reset file input for re-upload
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [phase, projectId, setActiveNotebook]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ipynb"
        className="hidden"
        onChange={(e) => void handleUploadIpynb(e)}
      />
      <div className={cn('flex h-14 items-center justify-between border-b px-3 shrink-0', className)}>
        {/* Left group: selector + add buttons + menu */}
        <div className={COMPACT_TOOLBAR_GROUP_CLASS}>
          <Select
            value={activeNotebookId ?? ''}
            onValueChange={(value) => {
              if (value) void setActiveNotebook(value);
            }}
          >
            <SelectTrigger className={compactToolbarSelectClass('w-[160px]')}>
              <SelectValue placeholder="Select notebook" />
            </SelectTrigger>
            <SelectContent>
              {notebooks.map((entry) => (
                <SelectItem key={entry.notebookId} value={entry.notebookId}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
            onClick={() => setCreateDialogOpen(true)}
            disabled={isSaving}
            title="Create new notebook"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
            onClick={() => handleAddCell('markdown')}
            disabled={isSaving || !notebook}
            title="Add text cell"
          >
            <Type className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
            onClick={() => handleAddCell('code')}
            disabled={isSaving || !notebook}
            title="Add code cell"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Code className="h-3.5 w-3.5" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                disabled={isSaving}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-2" />
                Upload
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={openRenameDialog} disabled={!notebook}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleDeleteNotebook}
                className="text-destructive focus:text-destructive"
                disabled={!notebook || !canDeleteNotebook}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right group: restart + cloud badge */}
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                  onClick={() => void handleRestartKernel()}
                  disabled={isRestarting || !cloudAvailable}
                  title="Restart Kernel"
                >
                  {isRestarting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Restart Kernel</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <RuntimeManagerDialog
            projectId={projectId}
            trigger={
            <Badge
              variant={cloudAvailable ? 'default' : 'secondary'}
              className={cn(
                'cursor-pointer gap-1.5 text-xs select-none',
                cloudInitializing && 'animate-pulse'
              )}
            >
              {cloudInitializing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : cloudAvailable ? (
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-destructive" />
              )}
              {cloudInitializing ? 'Connecting...' : cloudAvailable ? 'Cloud' : 'Unavailable'}
            </Badge>
            }
          />
        </div>
      </div>

      {/* Create notebook dialog */}
      <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create notebook</DialogTitle>
            <DialogDescription>
              Create a new notebook tab for independent experimentation.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreateNotebook();
            }}
            placeholder="Notebook name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateNotebook()} disabled={isSaving}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename notebook dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename notebook</DialogTitle>
            <DialogDescription>
              Update the active notebook name.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(event) => setRenameName(event.target.value)}
            placeholder="Notebook name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleRenameNotebook()} disabled={isSaving || !renameName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
