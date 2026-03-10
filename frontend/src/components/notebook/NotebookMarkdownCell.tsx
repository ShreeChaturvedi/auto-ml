import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Code,
  Eye,
  Lock,
  Trash2
} from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import type { LockOwner, NotebookCell } from '@/types/notebook';
import { initMonaco } from '@/lib/monaco/preloader';
import 'katex/dist/katex.min.css';
import { Markdown } from '@/components/ui/Markdown';

const Editor = lazy(() =>
  import('@monaco-editor/react').then((module) => ({
    default: module.default
  }))
);

function getSectionLabel(content: string): string {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return 'Untitled section';
  }

  const heading = lines.find((line) => /^#{1,6}\s+/.test(line));
  if (heading) {
    return heading.replace(/^#{1,6}\s+/, '');
  }

  return lines[0];
}

interface NotebookMarkdownCellProps {
  cell: NotebookCell;
  isLocked: boolean;
  lockOwner: LockOwner | null;
  isCollapsed: boolean;
  hiddenCodeCount: number;
  onToggleCollapsed: () => void;
  onContentChange: (content: string) => void;
  onDelete: () => void;
}

export function NotebookMarkdownCell({
  cell,
  isLocked,
  lockOwner,
  isCollapsed,
  hiddenCodeCount,
  onToggleCollapsed,
  onContentChange,
  onDelete
}: NotebookMarkdownCellProps) {
  const { theme } = useTheme();
  const resolvedTheme = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  const [localContent, setLocalContent] = useState(cell.content);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      setLocalContent(cell.content);
    }
  }, [cell.content, hasUnsavedChanges]);

  const handleContentChange = useCallback(
    (value: string | undefined) => {
      const content = value ?? '';
      setLocalContent(content);
      setHasUnsavedChanges(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        onContentChange(content);
        setHasUnsavedChanges(false);
      }, 1000);
    },
    [onContentChange]
  );

  const handleFlushSave = useCallback(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    onContentChange(localContent);
    setHasUnsavedChanges(false);
  }, [hasUnsavedChanges, localContent, onContentChange]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const sectionLabel = getSectionLabel(localContent);

  return (
    <div
      className={cn(
        'group rounded-md px-2 py-1 transition-colors',
        isCollapsed && 'bg-muted/20',
        isLocked && lockOwner === 'ai' && 'bg-purple-50/40 dark:bg-purple-950/20'
      )}
    >
      <div className="flex items-start gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          className="mt-1 h-6 w-6 shrink-0"
          aria-label={isCollapsed ? 'Expand markdown section' : 'Collapse markdown section'}
          onClick={() => {
            handleFlushSave();
            onToggleCollapsed();
          }}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>

        <div className="min-w-0 flex-1">
          {isCollapsed ? (
            <button
              type="button"
              className="w-full truncate pt-1 text-left text-sm font-medium text-foreground/90"
              onClick={onToggleCollapsed}
              aria-label="Expand markdown section"
            >
              {sectionLabel}
            </button>
          ) : isPreviewMode ? (
            <div
              className="cursor-pointer px-2 py-2 text-sm"
              onClick={() => !isLocked && setIsPreviewMode(false)}
            >
              {localContent.trim() ? (
                <Markdown
                  components={{
                    p: ({ children }) => <p className="mb-2 text-sm leading-relaxed last:mb-0">{children}</p>,
                    h1: ({ children }) => <h1 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-base font-semibold">{children}</h2>,
                    h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>,
                    ul: ({ children }) => <ul className="mb-2 list-disc pl-4 text-sm">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 text-sm">{children}</ol>,
                    li: ({ children }) => <li className="mb-0.5 text-sm">{children}</li>,
                    code: ({ className, children }) => {
                      const isInline = !className;
                      if (isInline) {
                        return (
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">
                            {children}
                          </code>
                        );
                      }
                      return (
                        <pre className="my-2 overflow-x-auto rounded-md bg-zinc-900 p-3 font-mono text-[13px] text-zinc-100 dark:bg-zinc-950">
                          <code>{children}</code>
                        </pre>
                      );
                    }
                  }}
                >
                  {localContent}
                </Markdown>
              ) : (
                <span className="italic text-muted-foreground">Write section notes...</span>
              )}
            </div>
          ) : (
            <Suspense
              fallback={
                <div
                  className="h-[60px]"
                  style={{ backgroundColor: resolvedTheme === 'dark' ? '#000000' : '#ffffff' }}
                />
              }
            >
              <Editor
                height={Math.max(60, localContent.split('\n').length * 20 + 20)}
                language="markdown"
                value={localContent}
                onChange={handleContentChange}
                onMount={(editor) => {
                  editor.onDidBlurEditorWidget(handleFlushSave);
                }}
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                  lineNumbers: 'off',
                  glyphMargin: false,
                  folding: false,
                  lineDecorationsWidth: 0,
                  renderLineHighlight: 'none',
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
                  wordWrap: 'on'
                }}
                theme={resolvedTheme === 'dark' ? 'python-dark' : 'python-light'}
                beforeMount={async () => {
                  await initMonaco();
                }}
              />
            </Suspense>
          )}
        </div>

        <div className="flex items-center gap-1 pt-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          {!isCollapsed && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="h-6 w-6"
                    onClick={() => setIsPreviewMode(!isPreviewMode)}
                    aria-label={isPreviewMode ? 'Edit markdown source' : 'Preview markdown'}
                  >
                    {isPreviewMode ? (
                      <Code className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isPreviewMode ? 'Edit source' : 'Preview'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={onDelete}
                  disabled={isLocked}
                  aria-label="Delete cell"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete cell</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="ml-7 mt-1 flex items-center gap-2">
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
        {isCollapsed && hiddenCodeCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {hiddenCodeCount} code {hiddenCodeCount === 1 ? 'cell' : 'cells'} hidden
          </span>
        )}
      </div>
    </div>
  );
}
