/**
 * NotebookToolbar - Right-pane ribbon for cell actions and cloud runtime.
 *
 * Layout (phase variant):
 *   <Text> <Code>  ···  <↻ Restart> <● Cloud>
 *
 * Layout (explorer variant):
 *   <Text> <Code> <RunAll|Stop> <ClearOutputs> ··· <↻ Restart> <● Cloud>
 *
 * The cloud badge is clickable and opens the RuntimeManagerDialog.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { useNotebookStore } from '@/stores/notebookStore';
import { useExecutionStore } from '@/stores/executionStore';
import { interruptKernel, restartKernel } from '@/lib/api/notebooks';
import { RuntimeManagerDialog } from '@/components/training/RuntimeManagerDialog';
import {
  COMPACT_TOOLBAR_GROUP_CLASS,
  COMPACT_TOOLBAR_ICON_BUTTON_CLASS
} from '@/components/agentic/toolbarStyles';
import { Code, Eraser, List, Loader2, Play, RotateCcw, Square, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isDemoMode } from '@/lib/demoMode';
import type { NotebookCell, NotebookCellType } from '@/types/notebook';
import type { TocHeading } from '@/lib/markdown/tocUtils';

interface NotebookToolbarProps {
  projectId: string;
  className?: string;
  headings?: TocHeading[];
  onScrollToHeading?: (slug: string) => void;
  /**
   * 'phase' (default) renders the canonical toolbar. 'explorer' adds Run All,
   * Stop, and Clear Outputs buttons — used by the data-viewer notebook panel.
   */
  variant?: 'phase' | 'explorer';
}

export function NotebookToolbar({
  projectId,
  className,
  headings,
  onScrollToHeading,
  variant = 'phase'
}: NotebookToolbarProps) {
  const notebook = useNotebookStore((state) => state.notebook);
  const isSaving = useNotebookStore((state) => state.isSaving);
  const createCell = useNotebookStore((state) => state.createCell);
  const updateCellLocally = useNotebookStore((state) => state.updateCellLocally);
  const runAllCells = useNotebookStore((state) => state.runAllCells);
  const stopRunAllCells = useNotebookStore((state) => state.stopRunAllCells);
  const runAllRunningCellId = useNotebookStore((state) => state.runAllRunningCellId);
  const cells = useNotebookStore((state) => state.cells);

  const cloudAvailable = useExecutionStore((state) => state.cloudAvailable);
  const cloudInitializing = useExecutionStore((state) => state.cloudInitializing);
  const sessionId = useExecutionStore((state) => state.sessionId);
  const checkCloudHealth = useExecutionStore((state) => state.checkCloudHealth);
  const initializeCloud = useExecutionStore((state) => state.initializeCloud);

  const [isRestarting, setIsRestarting] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const runAllAbortRef = useRef<AbortController | null>(null);

  // Bootstrap cloud runtime
  useEffect(() => {
    checkCloudHealth().catch(() => undefined);
  }, [checkCloudHealth]);

  useEffect(() => {
    if (isDemoMode()) {
      return;
    }

    if (projectId && cloudAvailable && !sessionId && !cloudInitializing) {
      initializeCloud(projectId).catch(() => undefined);
    }
  }, [projectId, cloudAvailable, sessionId, cloudInitializing, initializeCloud]);

  // Abort any in-flight run-all on unmount so the state doesn't leak.
  useEffect(() => {
    return () => {
      runAllAbortRef.current?.abort();
    };
  }, []);

  const handleAddCell = useCallback(async (cellType: NotebookCellType) => {
    await createCell({ content: '', cellType, position: 0 });
  }, [createCell]);

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

  const isAnyCellRunning = cells.some((cell) => cell.executionStatus === 'running');
  const canRunAll = !!notebook && cells.some((c) => c.cellType === 'code');

  const handleRunAll = useCallback(async () => {
    if (!canRunAll || !projectId) return;
    const controller = new AbortController();
    runAllAbortRef.current = controller;
    setIsRunningAll(true);
    try {
      await runAllCells(projectId, controller.signal);
    } finally {
      if (runAllAbortRef.current === controller) {
        runAllAbortRef.current = null;
      }
      setIsRunningAll(false);
    }
  }, [canRunAll, projectId, runAllCells]);

  const handleStop = useCallback(async () => {
    // Abort the local run-all loop so it stops queuing additional cells.
    runAllAbortRef.current?.abort();
    if (!projectId) return;
    // Run-all active: store tracks the running cell via runAllRunningCellId
    // so Stop works even across notebook switches.
    if (runAllRunningCellId) {
      await stopRunAllCells(projectId);
      return;
    }
    // Single-cell run (user clicked play on one cell): fall back to
    // finding it in the current cell list and interrupting directly.
    const runningCell = cells.find((c) => c.executionStatus === 'running');
    if (!runningCell) return;
    try {
      await interruptKernel(runningCell.cellId, projectId);
    } catch (error) {
      console.error('[NotebookToolbar] Failed to interrupt cell:', error);
    }
  }, [projectId, runAllRunningCellId, stopRunAllCells, cells]);

  const handleClearAllOutputs = useCallback(() => {
    // Clears client-side outputs only; persisted outputs reload on re-run.
    // The cell API does not expose an "outputs" update path, so we write
    // through updateCellLocally to keep the UI clean without a round-trip.
    for (const cell of cells) {
      if (cell.cellType !== 'code' || !hasOutput(cell)) continue;
      updateCellLocally({
        ...cell,
        output: [],
        outputRefs: [],
        executionStatus: 'idle',
        executionOrder: null,
        executionDurationMs: null
      });
    }
  }, [cells, updateCellLocally]);

  return (
    <div className={cn('flex h-14 items-center justify-between border-b px-3 shrink-0', className)}>
      {/* Left group: cell buttons + TOC + optional explorer controls */}
      <TooltipProvider delayDuration={300}>
        <div className={COMPACT_TOOLBAR_GROUP_CLASS}>
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

          {variant === 'explorer' && (
            <>
              <div className="mx-1 h-5 w-px bg-border" aria-hidden />

              {isRunningAll || isAnyCellRunning ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                      onClick={() => void handleStop()}
                      aria-label="Stop execution"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Stop</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                      onClick={() => void handleRunAll()}
                      disabled={!canRunAll}
                      aria-label="Run all cells"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Run all cells</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                    onClick={handleClearAllOutputs}
                    disabled={isSaving || !notebook || !cells.some(hasOutput)}
                    aria-label="Clear all outputs"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Clear all outputs</TooltipContent>
              </Tooltip>
            </>
          )}

          {headings && headings.length > 0 && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                      aria-label="Table of Contents"
                    >
                      <List className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Table of Contents</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
                {headings.map((h) => (
                  <DropdownMenuItem
                    key={h.slug}
                    onClick={() => onScrollToHeading?.(h.slug)}
                    className={cn('cursor-pointer truncate', h.level === 3 && 'pl-6')}
                  >
                    {h.text}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TooltipProvider>

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
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium cursor-pointer select-none transition-colors',
                cloudAvailable
                  ? 'border-primary/25 bg-primary/10'
                  : 'border-border/70 bg-muted/30'
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  cloudInitializing
                    ? 'bg-amber-500 animate-pulse'
                    : cloudAvailable
                      ? 'bg-emerald-500'
                      : 'bg-destructive'
                )}
              />
              Cloud
            </span>
          }
        />
      </div>
    </div>
  );
}

function hasOutput(cell: NotebookCell): boolean {
  return (cell.output?.length ?? 0) > 0 || (cell.outputRefs?.length ?? 0) > 0;
}
