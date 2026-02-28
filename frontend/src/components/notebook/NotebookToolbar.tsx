/**
 * NotebookToolbar - Right-pane ribbon for notebook management and cloud runtime.
 *
 * Layout: <Selector> <+> <Text> <Code> <⋮>  ···  <Cloud Badge>
 *
 * The cloud badge is clickable and opens the RuntimeManagerDialog.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useNotebookStore } from '@/stores/notebookStore';
import { useExecutionStore } from '@/stores/executionStore';
import { RuntimeManagerDialog } from '@/components/training/RuntimeManagerDialog';
import { Code, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotebookCellType } from '@/types/notebook';

interface NotebookToolbarProps {
  projectId: string;
  className?: string;
}

export function NotebookToolbar({ projectId, className }: NotebookToolbarProps) {
  const {
    notebook,
    notebooks,
    activeNotebookId,
    isSaving,
    createNotebook,
    renameNotebook,
    deleteNotebook,
    setActiveNotebook,
    createCell
  } = useNotebookStore();

  const {
    cloudAvailable,
    cloudInitializing,
    sessionId,
    checkCloudHealth,
    initializeCloud
  } = useExecutionStore();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState('');

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
    const created = await createNotebook(createName.trim() || undefined);
    if (created) {
      setCreateDialogOpen(false);
      setCreateName('');
    }
  }, [createName, createNotebook]);

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

  return (
    <>
      <div className={cn('flex h-14 items-center justify-between border-b px-3 shrink-0', className)}>
        {/* Left group: selector + add buttons + menu */}
        <div className="flex items-center gap-1.5">
          <Select
            value={activeNotebookId ?? ''}
            onValueChange={(value) => {
              if (value) void setActiveNotebook(value);
            }}
          >
            <SelectTrigger className="h-7 w-[160px] text-xs">
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
            className="h-7 w-7"
            onClick={() => setCreateDialogOpen(true)}
            disabled={isSaving}
            title="Create new notebook"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => handleAddCell('markdown')}
            disabled={isSaving || !notebook}
            title="Add text cell"
          >
            <Type className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
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
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!notebook}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={openRenameDialog}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleDeleteNotebook}
                className="text-destructive focus:text-destructive"
                disabled={!canDeleteNotebook}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right group: cloud badge */}
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
