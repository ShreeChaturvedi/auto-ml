/**
 * CodeCell - Compact code cell with Monaco editor and autosave
 *
 * Features:
 * - Autosave on blur/change (no save button)
 * - Compact header with minimal icons
 * - Custom Monaco theme (pre-loaded via @/lib/monaco/preloader)
 * - Always editable (no click-to-edit mode)
 * - No loading flash due to Monaco pre-loading
 */

import { Suspense, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Play,
  Trash2,
  Copy,
  Check,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2,
  ArrowUp,
  CornerDownLeft
} from 'lucide-react';
import type { Cell } from '@/types/cell';
import { cn } from '@/lib/utils';
import type { RichOutput } from '@/lib/api/execution';
import { usePythonEditor } from '@/hooks/usePythonEditor';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { LazyMonacoEditor } from '@/lib/monaco/LazyMonacoEditor';
import { CodeCellOutput } from './CodeCellOutput';

const PLACEHOLDER = '# Enter Python code...';

interface CodeCellProps {
  cell: Cell;
  cellNumber: number;
  onRun?: () => void;
  onDelete?: () => void;
  onContentChange?: (content: string) => void;
  isRunning?: boolean;
  datasetFiles?: string[];
}

export function CodeCell({
  cell,
  cellNumber,
  onRun,
  onDelete,
  onContentChange,
  isRunning,
  datasetFiles = []
}: CodeCellProps) {
  const [copied, copy] = useCopyToClipboard();

  const completionOptions = useMemo(
    () => ({ datasetFiles }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(datasetFiles)]
  );

  const {
    localContent,
    resolvedTheme,
    handleContentChange,
    handleEditorMount
  } = usePythonEditor({
    content: cell.content,
    onContentChange: onContentChange ?? (() => {}),
    onRun: onRun ?? (() => {}),
    autosaveDelay: 500,
    alwaysSync: true,
    ignoreSaveContent: PLACEHOLDER,
    completionOptions,
    preloadMonaco: false
  });

  const richOutputs: RichOutput[] = cell.output?.data
    ? (Array.isArray(cell.output.data) ? cell.output.data : [cell.output])
    : cell.output
      ? [{ type: cell.output.type as RichOutput['type'], content: cell.output.content }]
      : [];

  const getStatusIcon = () => {
    switch (cell.status) {
      case 'running':
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  const lineCount = (localContent || PLACEHOLDER).split('\n').length;
  const editorHeight = Math.max(60, Math.min(300, lineCount * 18 + 16));

  return (
    <div className={cn(
      'border rounded-md overflow-hidden transition-all',
      cell.status === 'running' && 'ring-1 ring-blue-500/50',
      cell.status === 'error' && 'border-red-500/50'
    )}>
      {/* Compact header */}
      <div className="flex items-center justify-between px-2 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-muted-foreground">
            [{cellNumber}]
          </span>
          {getStatusIcon()}
          {cell.executionDurationMs && cell.status === 'success' && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {cell.executionDurationMs}ms
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void copy(localContent)}
                >
                  {copied ? (
                    <Check className="h-2.5 w-2.5 text-green-500" />
                  ) : (
                    <Copy className="h-2.5 w-2.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Copy</TooltipContent>
            </Tooltip>

            {onRun && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className={cn(
                      !isRunning && 'hover:bg-green-500/10 hover:text-green-600'
                    )}
                    onClick={onRun}
                    disabled={isRunning}
                  >
                    {isRunning ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Play className="h-2.5 w-2.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="flex items-center gap-2 text-xs">
                  <span>Run</span>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <kbd className="inline-flex h-5 w-5 items-center justify-center rounded border bg-muted/50">
                      <ArrowUp className="h-3 w-3" />
                      <span className="sr-only">Shift</span>
                    </kbd>
                    <span>+</span>
                    <kbd className="inline-flex h-5 w-5 items-center justify-center rounded border bg-muted/50">
                      <CornerDownLeft className="h-3 w-3" />
                      <span className="sr-only">Enter</span>
                    </kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}

            {onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="hover:bg-red-500/10 hover:text-red-500"
                    onClick={onDelete}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      </div>

      {/* Editor - always editable */}
      <div style={{ height: editorHeight }} className="transition-opacity duration-150">
        <Suspense fallback={
          <div
            className="h-full animate-pulse"
            style={{ backgroundColor: resolvedTheme === 'dark' ? '#000000' : '#ffffff' }}
          />
        }>
          <LazyMonacoEditor
            height="100%"
            defaultLanguage="python"
            value={localContent}
            onChange={handleContentChange}
            theme={resolvedTheme === 'dark' ? 'python-dark' : 'python-light'}
            onMount={handleEditorMount}
            options={{
              fixedOverflowWidgets: true,
              minimap: { enabled: false },
              lineNumbers: 'on',
              lineNumbersMinChars: 3,
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 8,
              scrollBeyondLastLine: false,
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              wordWrap: 'on',
              automaticLayout: true,
              padding: { top: 6, bottom: 6 },
              renderLineHighlight: 'none',
              overviewRulerBorder: false,
              scrollbar: {
                vertical: 'hidden',
                horizontal: 'hidden',
                alwaysConsumeMouseWheel: false
              },
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
            }}
          />
        </Suspense>
      </div>

      {/* Output */}
      <CodeCellOutput richOutputs={richOutputs} />
    </div>
  );
}
