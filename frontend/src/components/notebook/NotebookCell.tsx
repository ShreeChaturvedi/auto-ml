/**
 * NotebookCell - Code cell component.
 *
 * This component intentionally handles code cells only. Markdown section
 * behavior is rendered by NotebookMarkdownCell + NotebookEditor section logic.
 */

import { useState, useCallback, Suspense, lazy, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Play,
  Square,
  Trash2,
  Loader2,
  Copy,
  ChevronDown,
  ChevronUp,
  Bot,
  Lock
} from 'lucide-react';
import { CellOutputRenderer } from '@/components/training/CellOutputRenderer';
import { buildOutputCopyText } from '@/components/training/cellOutputUtils';
import type { NotebookCell, LockOwner } from '@/types/notebook';
import { cn } from '@/lib/utils';
import { usePythonEditor } from '@/hooks/usePythonEditor';

const Editor = lazy(() =>
  import('@monaco-editor/react').then((module) => ({
    default: module.default
  }))
);

interface NotebookCellComponentProps {
  cell: NotebookCell;
  isLocked: boolean;
  lockOwner: LockOwner | null;
  projectId: string;
  onContentChange: (content: string) => void;
  onDelete: () => void;
  onRun: () => void;
  onInterrupt?: () => void;
}

function formatExecutionTime(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function NotebookCellComponent({
  cell,
  isLocked,
  lockOwner,
  projectId,
  onContentChange,
  onDelete,
  onRun,
  onInterrupt
}: NotebookCellComponentProps) {
  const [showOutput, setShowOutput] = useState(true);

  const completionOptions = useMemo(
    () => ({ projectId, cellId: cell.cellId }),
    [projectId, cell.cellId]
  );

  const {
    localContent,
    resolvedTheme,
    handleContentChange,
    handleEditorMount,
    handleBeforeMount
  } = usePythonEditor({
    content: cell.content,
    onContentChange,
    onRun,
    autosaveDelay: 1000,
    completionOptions,
    preloadMonaco: true
  });

  const isRunning = cell.executionStatus === 'running';

  const richOutputs = useMemo(() => {
    const baseOutputs = cell.output.map((output) => ({
      type: output.type,
      content: output.content,
      data: output.data,
      mimeType: output.mimeType
    }));

    const hasInlineImageOutput = cell.output.some((output) => output.type === 'image');
    if (hasInlineImageOutput) {
      return baseOutputs;
    }

    const inlineOutputRefs = new Set(
      cell.output
        .map((output) => output.content)
        .filter((content) => typeof content === 'string' && content.startsWith('outputs/'))
    );

    // Backwards-compat: older persisted cells may only have images in outputRefs.
    // If the cell already has inline image outputs (data URLs or placeholders), don't append refs
    // to avoid bunching/duplication at the end of the output list.
    const legacyImageRefs = cell.outputRefs
      .filter((ref) => ref.type === 'image' && ref.ref.startsWith('outputs/') && !inlineOutputRefs.has(ref.ref))
      .map((ref) => ({
        type: 'image' as const,
        content: ref.ref,
        mimeType: ref.mimeType
      }));

    return [...baseOutputs, ...legacyImageRefs];
  }, [cell.output, cell.outputRefs]);

  const handleCopyOutput = useCallback(async () => {
    const text = buildOutputCopyText(richOutputs);
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Ignore and fall back to `execCommand('copy')` below.
    }

    if (typeof document === 'undefined') {
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    void copied;
  }, [richOutputs]);

  return (
    <div
      className={cn(
        'group overflow-hidden rounded-lg border bg-card transition-colors duration-150',
        isRunning && 'border-l-2 border-l-primary',
        cell.executionStatus === 'error' && 'border-l-2 border-l-destructive',
        isLocked && lockOwner === 'ai' && 'border-purple-500/50 bg-purple-50/50 dark:bg-purple-950/20'
      )}
    >
      <TooltipProvider>
        <div className="flex h-9 items-center justify-between border-b px-2">
          <div className="flex items-center gap-1.5">
            {/* Run/Stop button — always visible, left-aligned */}
            <Tooltip>
              <TooltipTrigger asChild>
                {isRunning ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onInterrupt}
                    disabled={!onInterrupt}
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    aria-label="Stop execution"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onRun}
                    disabled={isLocked}
                    className="h-6 w-6"
                    aria-label="Run cell"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isRunning ? 'Stop execution' : 'Run cell (Shift+Enter)'}
              </TooltipContent>
            </Tooltip>

            {/* Execution count or spinner */}
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {cell.executionOrder != null
                  ? `[${cell.executionOrder}${cell.isDirty ? '*' : ''}]`
                  : '[ ]'}
              </span>
            )}

            {/* Execution time — subtle, formatted */}
            {!isRunning && cell.executionDurationMs != null && cell.executionDurationMs > 0 && (
              <span className="text-xs text-muted-foreground/60">
                · {formatExecutionTime(cell.executionDurationMs)}
              </span>
            )}

            {/* Lock badges */}
            {isLocked && lockOwner === 'ai' && (
              <Badge
                variant="outline"
                className="gap-1 border-purple-500/30 bg-purple-100/50 text-[10px] text-purple-600 dark:bg-purple-900/30"
              >
                <Bot className="h-3 w-3" />
                AI editing
              </Badge>
            )}

            {isLocked && lockOwner === 'user' && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Lock className="h-3 w-3" />
                Editing
              </Badge>
            )}
          </div>

          {/* Delete — hover-reveal, neutral at rest */}
          <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onDelete}
                  disabled={isLocked}
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  aria-label="Delete cell"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Delete cell</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>

      <Suspense
        fallback={
          <div
            className="h-[60px]"
            style={{ backgroundColor: resolvedTheme === 'dark' ? '#000000' : '#ffffff' }}
          />
        }
      >
        <Editor
          path={`cell-${cell.cellId}.py`}
          height={Math.max(60, localContent.split('\n').length * 20 + 20)}
          language="python"
          value={localContent}
          onChange={handleContentChange}
          onMount={handleEditorMount}
          options={{
            fixedOverflowWidgets: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
            lineNumbers: 'on',
            lineNumbersMinChars: 3,
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 8,
            renderLineHighlight: 'line',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              vertical: 'hidden',
              horizontal: 'hidden',
              alwaysConsumeMouseWheel: false
            },
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            readOnly: isLocked,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true
          }}
          theme={resolvedTheme === 'dark' ? 'python-dark' : 'python-light'}
          beforeMount={handleBeforeMount}
        />
      </Suspense>

      {richOutputs.length > 0 && (
        <div className="border-t bg-muted/30">
          <div className="flex min-h-[32px] items-center justify-between border-b px-3 py-1.5">
            <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">OUTPUT</span>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-6 w-6"
                onClick={handleCopyOutput}
                title="Copy output"
                aria-label="Copy output"
                type="button"
              >
                <Copy className="h-3 w-3" />
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                className="h-6 w-6"
                onClick={() => setShowOutput((previous) => !previous)}
                title={showOutput ? 'Collapse output' : 'Expand output'}
                aria-label={showOutput ? 'Collapse output' : 'Expand output'}
                type="button"
              >
                {showOutput ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {showOutput && (
            <div className="p-3">
              <CellOutputRenderer outputs={richOutputs} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
