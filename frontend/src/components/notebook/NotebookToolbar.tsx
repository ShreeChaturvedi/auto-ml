/**
 * NotebookToolbar - Right-pane ribbon for cell actions and cloud runtime.
 *
 * Layout: <Text> <Code>  ···  <↻ Restart> <● Cloud>
 *
 * The cloud badge is clickable and opens the RuntimeManagerDialog.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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
  COMPACT_TOOLBAR_ICON_BUTTON_CLASS
} from '@/components/agentic/toolbarStyles';
import { Code, Loader2, RotateCcw, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotebookCellType } from '@/types/notebook';

interface NotebookToolbarProps {
  projectId: string;
  className?: string;
}

export function NotebookToolbar({ projectId, className }: NotebookToolbarProps) {
  const notebook = useNotebookStore((state) => state.notebook);
  const isSaving = useNotebookStore((state) => state.isSaving);
  const createCell = useNotebookStore((state) => state.createCell);

  const cloudAvailable = useExecutionStore((state) => state.cloudAvailable);
  const cloudInitializing = useExecutionStore((state) => state.cloudInitializing);
  const sessionId = useExecutionStore((state) => state.sessionId);
  const checkCloudHealth = useExecutionStore((state) => state.checkCloudHealth);
  const initializeCloud = useExecutionStore((state) => state.initializeCloud);

  const [isRestarting, setIsRestarting] = useState(false);

  // Bootstrap cloud runtime
  useEffect(() => {
    checkCloudHealth().catch(() => undefined);
  }, [checkCloudHealth]);

  useEffect(() => {
    if (projectId && cloudAvailable && !sessionId && !cloudInitializing) {
      initializeCloud(projectId).catch(() => undefined);
    }
  }, [projectId, cloudAvailable, sessionId, cloudInitializing, initializeCloud]);

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

  return (
    <div className={cn('flex h-14 items-center justify-between border-b px-3 shrink-0', className)}>
      {/* Left group: cell buttons */}
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
