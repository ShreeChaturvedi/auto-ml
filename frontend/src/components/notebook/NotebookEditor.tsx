/**
 * NotebookEditor - Notebook cell editor with real-time sync
 *
 * Features:
 * - Display and edit notebook cells
 * - AI editing indicators (locks)
 * - Cell execution
 * - Insert buttons between cells for code/markdown
 * - Drag-and-drop reordering (future)
 */

import { useCallback, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { NotebookCellComponent } from './NotebookCell';
import { useNotebookStore } from '@/stores/notebookStore';
import { Loader2, Code, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotebookCellType } from '@/types/notebook';

/**
 * InsertCellRow - Hover-reveal insert buttons between cells
 */
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
      {/* Hover line */}
      <div
        className={cn(
          'absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-all duration-150',
          isHovered ? 'bg-primary/40' : 'bg-transparent'
        )}
      />

      {/* Insert buttons */}
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
    cells,
    isLoading,
    isSaving,
    createCell,
    updateCell,
    deleteCell,
    runCell,
    isCellLocked,
    getCellLockOwner
  } = useNotebookStore();

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

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b px-4">
        <span className="text-sm font-medium">Notebook</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAddCell('code')}
            disabled={isSaving}
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
            disabled={isSaving}
            className="h-7 gap-1 px-2 text-xs"
            title="Add text cell"
          >
            <Type className="h-3.5 w-3.5" />
            Text
          </Button>
        </div>
      </div>

      {/* Cells */}
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
                >
                  <Code className="h-4 w-4" />
                  Code
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddCell('markdown')}
                  className="gap-1.5"
                >
                  <Type className="h-4 w-4" />
                  Text
                </Button>
              </div>
            </div>
          )}

          {/* Insert row before first cell */}
          {cells.length > 0 && (
            <InsertCellRow position={0} onInsert={handleInsertCell} disabled={isSaving} />
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
              {/* Insert row after each cell */}
              <InsertCellRow position={index + 1} onInsert={handleInsertCell} disabled={isSaving} />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
