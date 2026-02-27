/**
 * NotebookEditor - Notebook cell editor with real-time sync
 */

import { useCallback, useMemo, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
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
import { NotebookCellComponent } from './NotebookCell';
import { useNotebookStore } from '@/stores/notebookStore';
import { Loader2, Code, Type, MoreHorizontal, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotebookCellType } from '@/types/notebook';

interface InsertCellRowProps {
  position: number;
  onInsert: (position: number, cellType: NotebookCellType) => void;
  disabled?: boolean;
}

function InsertCellRow({ position, onInsert, disabled }: InsertCellRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="group relative flex h-6 items-center justify-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-all duration-150',
          isHovered ? 'bg-primary/40' : 'bg-transparent'
        )}
      />

      <div
        className={cn(
          'relative z-10 flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 shadow-sm transition-all duration-150',
          isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-5 gap-1 px-1.5 text-[10px] hover:bg-primary/10"
          onClick={() => onInsert(position, 'code')}
          disabled={disabled}
        >
          <Code className="h-3 w-3" />
          Code
        </Button>
        <div className="h-3 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-5 gap-1 px-1.5 text-[10px] hover:bg-primary/10"
          onClick={() => onInsert(position, 'markdown')}
          disabled={disabled}
        >
          <Type className="h-3 w-3" />
          Text
        </Button>
      </div>
    </div>
  );
}

interface NotebookEditorProps {
  projectId: string;
  className?: string;
}

export function NotebookEditor({ projectId, className }: NotebookEditorProps) {
  const {
    notebook,
    notebooks,
    activeNotebookId,
    cells,
    isLoading,
    isSaving,
    createNotebook,
    renameNotebook,
    deleteNotebook,
    setActiveNotebook,
    createCell,
    updateCell,
    deleteCell,
    runCell,
    isCellLocked,
    getCellLockOwner
  } = useNotebookStore();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState('');

  const canDeleteNotebook = useMemo(() => notebooks.length > 1, [notebooks.length]);

  const handleAddCell = useCallback(async (cellType: NotebookCellType = 'code') => {
    await createCell({
      content: '',
      cellType
    });
  }, [createCell]);

  const handleInsertCell = useCallback(async (position: number, cellType: NotebookCellType) => {
    await createCell({
      content: '',
      cellType,
      position
    });
  }, [createCell]);

  const handleCellContentChange = useCallback(
    async (cellId: string, content: string) => {
      await updateCell(cellId, { content });
    },
    [updateCell]
  );

  const handleCellDelete = useCallback(
    async (cellId: string) => {
      await deleteCell(cellId);
    },
    [deleteCell]
  );

  const handleCellRun = useCallback(
    async (cellId: string) => {
      await runCell(cellId, projectId);
    },
    [runCell, projectId]
  );

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
    if (updated) {
      setRenameDialogOpen(false);
    }
  }, [notebook, renameName, renameNotebook]);

  const handleDeleteNotebook = useCallback(async () => {
    if (!notebook || !canDeleteNotebook) return;
    const confirmed = window.confirm(`Delete notebook "${notebook.name}"?`);
    if (!confirmed) return;
    await deleteNotebook(notebook.notebookId);
  }, [canDeleteNotebook, deleteNotebook, notebook]);

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="border-b">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {notebooks.map((entry) => (
              <Button
                key={entry.notebookId}
                variant={entry.notebookId === activeNotebookId ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 max-w-[190px] shrink-0 px-2 text-xs"
                onClick={() => void setActiveNotebook(entry.notebookId)}
              >
                <span className="truncate">{entry.name}</span>
              </Button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setCreateDialogOpen(true)}
            disabled={isSaving}
          >
            <Plus className="h-3.5 w-3.5" />
            Notebook
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!notebook}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={openRenameDialog}>
                Rename notebook
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleDeleteNotebook}
                className="text-destructive focus:text-destructive"
                disabled={!canDeleteNotebook}
              >
                Delete notebook
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex h-10 items-center justify-between px-4">
          <span className="truncate text-sm font-medium">{notebook?.name ?? 'Notebook'}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAddCell('code')}
              disabled={isSaving || !notebook}
              className="h-7 gap-1 px-2 text-xs"
              title="Add code cell"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Code className="h-3.5 w-3.5" />
              )}
              Code
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAddCell('markdown')}
              disabled={isSaving || !notebook}
              className="h-7 gap-1 px-2 text-xs"
              title="Add text cell"
            >
              <Type className="h-3.5 w-3.5" />
              Text
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {isLoading && cells.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {cells.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                No cells yet. Add a cell to get started.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddCell('code')}
                  className="gap-1.5"
                  disabled={!notebook}
                >
                  <Code className="h-4 w-4" />
                  Code
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddCell('markdown')}
                  className="gap-1.5"
                  disabled={!notebook}
                >
                  <Type className="h-4 w-4" />
                  Text
                </Button>
              </div>
            </div>
          )}

          {cells.length > 0 && (
            <InsertCellRow position={0} onInsert={handleInsertCell} disabled={isSaving || !notebook} />
          )}

          {cells.map((cell, index) => (
            <div key={cell.cellId}>
              <NotebookCellComponent
                cell={cell}
                cellNumber={index + 1}
                isLocked={isCellLocked(cell.cellId)}
                lockOwner={getCellLockOwner(cell.cellId)}
                projectId={projectId}
                onContentChange={(content) => handleCellContentChange(cell.cellId, content)}
                onDelete={() => handleCellDelete(cell.cellId)}
                onRun={() => handleCellRun(cell.cellId)}
              />
              <InsertCellRow position={index + 1} onInsert={handleInsertCell} disabled={isSaving || !notebook} />
            </div>
          ))}
        </div>
      </ScrollArea>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
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
            placeholder="Notebook name (optional)"
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
    </div>
  );
}
