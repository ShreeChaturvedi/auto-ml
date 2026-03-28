/**
 * NotebookEditor - Notebook cell list with real-time sync.
 *
 * Renders cells in a scrollable area with inline insert-cell controls.
 * Toolbar and notebook management are handled by NotebookToolbar.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { NotebookCellComponent } from './NotebookCell';
import { NotebookMarkdownCell } from './NotebookMarkdownCell';
import { useNotebookStore } from '@/stores/notebookStore';
import { useInsightNavigationStore } from '@/stores/insightNavigationStore';
import { interruptKernel } from '@/lib/api/notebooks';
import { Loader2, Code, Type } from 'lucide-react';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { cn } from '@/lib/utils';
import { scrollToRadixElement } from '@/lib/scrollUtils';
import type { NotebookCell as NotebookCellModel, NotebookCellType } from '@/types/notebook';

interface InsertCellRowProps {
  position: number;
  onInsert: (position: number, cellType: NotebookCellType) => void;
  disabled?: boolean;
  className?: string;
}

function InsertCellRow({ position, onInsert, disabled, className }: InsertCellRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn('group relative flex h-6 items-center justify-center', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors duration-150',
          isHovered ? 'bg-primary/40' : 'bg-transparent'
        )}
      />

      <div
        className={cn(
          'relative z-10 flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 shadow-sm dark:shadow-none transition-opacity duration-150',
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

export interface NotebookEditorHandle {
  scrollToHeading: (slug: string) => void;
}

interface NotebookEditorProps {
  projectId: string;
  notebookId?: string;
  className?: string;
}

interface RenderItem {
  cell: NotebookCellModel;
  kind: 'code' | 'markdown';
  nestedUnderMarkdown: boolean;
  isSectionCollapsed: boolean;
  hiddenCodeCount: number;
}

function countCodeChildren(cells: NotebookCellModel[], markdownIndex: number): number {
  let count = 0;
  for (let index = markdownIndex + 1; index < cells.length; index += 1) {
    if (cells[index].cellType === 'markdown') {
      break;
    }
    if (cells[index].cellType === 'code') {
      count += 1;
    }
  }
  return count;
}

export const NotebookEditor = forwardRef<NotebookEditorHandle, NotebookEditorProps>(
  function NotebookEditor({ projectId, notebookId, className }, ref) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { themeColor } = useProjectThemeColor();

  useImperativeHandle(ref, () => ({
    scrollToHeading: (slug: string) => scrollToRadixElement(scrollAreaRef.current, slug),
  }), []);

  const notebook = useNotebookStore((state) => state.notebook);
  const rawCells = useNotebookStore((state) => state.cells);
  const cells = useMemo(
    () => notebookId ? rawCells.filter((c) => c.notebookId === notebookId) : rawCells,
    [rawCells, notebookId]
  );
  const isLoading = useNotebookStore((state) => state.isLoading);
  const isSaving = useNotebookStore((state) => state.isSaving);
  const createCell = useNotebookStore((state) => state.createCell);
  const updateCell = useNotebookStore((state) => state.updateCell);
  const deleteCell = useNotebookStore((state) => state.deleteCell);
  const runCell = useNotebookStore((state) => state.runCell);
  const isCellLocked = useNotebookStore((state) => state.isCellLocked);
  const getCellLockOwner = useNotebookStore((state) => state.getCellLockOwner);
  const suggestedCellIds = useNotebookStore((state) => state.suggestedCellIds);
  const streamingCellIds = useNotebookStore((state) => state.streamingCellIds);
  const streamErrors = useNotebookStore((state) => state.streamErrors);
  const acceptSuggestedCell = useNotebookStore((state) => state.acceptSuggestedCell);
  const rejectSuggestedCell = useNotebookStore((state) => state.rejectSuggestedCell);
  const cancelSuggestedCellStream = useNotebookStore((state) => state.cancelSuggestedCellStream);
  const startSuggestedCellStream = useNotebookStore((state) => state.startSuggestedCellStream);
  const activeNotebookId = useNotebookStore((state) => state.activeNotebookId);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Consume pending insight context (cross-phase navigation from EDA → Notebook)
  const pendingInsightContext = useInsightNavigationStore((state) => state.pendingInsightContext);
  const clearPendingContext = useInsightNavigationStore((state) => state.clearPendingContext);
  const insightFiredRef = useRef(false);

  useEffect(() => {
    if (pendingInsightContext && activeNotebookId && !insightFiredRef.current) {
      insightFiredRef.current = true;
      startSuggestedCellStream(activeNotebookId, pendingInsightContext);
      clearPendingContext();
    }
    if (!pendingInsightContext) {
      insightFiredRef.current = false;
    }
  }, [pendingInsightContext, activeNotebookId, startSuggestedCellStream, clearPendingContext]);

  const handleAddCell = useCallback(async (cellType: NotebookCellType = 'code') => {
    await createCell({ content: '', cellType });
  }, [createCell]);

  const handleInsertCell = useCallback(async (position: number, cellType: NotebookCellType) => {
    await createCell({ content: '', cellType, position });
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

  const handleCellInterrupt = useCallback(
    async (cellId: string) => {
      try {
        await interruptKernel(cellId, projectId);
      } catch (error) {
        console.error('[NotebookEditor] Failed to interrupt kernel:', error);
      }
    },
    [projectId]
  );

  useEffect(() => {
    const markdownIds = new Set(
      cells
        .filter((cell) => cell.cellType === 'markdown')
        .map((cell) => cell.cellId)
    );

    setCollapsedSections((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([cellId]) => markdownIds.has(cellId))
      );
      const hasChanged = Object.keys(prev).length !== Object.keys(next).length;
      return hasChanged ? next : prev;
    });
  }, [cells]);

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    let activeMarkdownId: string | null = null;
    let activeSectionCollapsed = false;

    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index];
      if (cell.cellType === 'markdown') {
        const collapsed = Boolean(collapsedSections[cell.cellId]);
        const hiddenCodeCount = collapsed ? countCodeChildren(cells, index) : 0;
        activeMarkdownId = cell.cellId;
        activeSectionCollapsed = collapsed;
        items.push({
          cell,
          kind: 'markdown',
          nestedUnderMarkdown: false,
          isSectionCollapsed: collapsed,
          hiddenCodeCount
        });
        continue;
      }

      if (activeSectionCollapsed) {
        continue;
      }

      items.push({
        cell,
        kind: 'code',
        nestedUnderMarkdown: activeMarkdownId !== null,
        isSectionCollapsed: false,
        hiddenCodeCount: 0
      });
    }

    return items;
  }, [cells, collapsedSections]);

  const toggleSectionCollapse = useCallback((cellId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [cellId]: !prev[cellId]
    }));
  }, []);

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
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

          {renderItems.map((item) => (
            <div key={item.cell.cellId}>
              {item.kind === 'markdown' ? (
                <NotebookMarkdownCell
                  cell={item.cell}
                  isLocked={isCellLocked(item.cell.cellId)}
                  lockOwner={getCellLockOwner(item.cell.cellId)}
                  isCollapsed={item.isSectionCollapsed}
                  hiddenCodeCount={item.hiddenCodeCount}
                  themeColor={themeColor}
                  onToggleCollapsed={() => toggleSectionCollapse(item.cell.cellId)}
                  onContentChange={(content) => handleCellContentChange(item.cell.cellId, content)}
                  onDelete={() => handleCellDelete(item.cell.cellId)}
                />
              ) : (
                <div className={cn(item.nestedUnderMarkdown && 'ml-6 border-l border-border/50 pl-4')}>
                  <NotebookCellComponent
                    cell={item.cell}
                    isLocked={isCellLocked(item.cell.cellId)}
                    lockOwner={getCellLockOwner(item.cell.cellId)}
                    projectId={projectId}
                    onContentChange={(content) => handleCellContentChange(item.cell.cellId, content)}
                    onDelete={() => handleCellDelete(item.cell.cellId)}
                    onRun={() => handleCellRun(item.cell.cellId)}
                    onInterrupt={() => handleCellInterrupt(item.cell.cellId)}
                    isSuggested={suggestedCellIds.has(item.cell.cellId)}
                    isStreaming={streamingCellIds.has(item.cell.cellId)}
                    streamError={streamErrors.get(item.cell.cellId) ?? null}
                    onAccept={() => acceptSuggestedCell(item.cell.cellId)}
                    onReject={() => rejectSuggestedCell(item.cell.cellId)}
                    onCancel={() => cancelSuggestedCellStream(item.cell.cellId)}
                  />
                </div>
              )}
              <InsertCellRow
                position={item.cell.position + 1}
                onInsert={handleInsertCell}
                disabled={isSaving || !notebook}
                className={cn(item.nestedUnderMarkdown && item.kind === 'code' && 'ml-6 pl-4')}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
});
