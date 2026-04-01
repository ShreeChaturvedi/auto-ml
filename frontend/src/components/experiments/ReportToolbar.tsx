import { useCallback, useMemo } from 'react';
import {
  Check,
  Copy,
  Download,
  LayoutDashboard,
  List,
  Loader2,
  RefreshCcw,
  Search,
  Table2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { IconModeToggle } from '@/components/data/IconModeToggle';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import {
  COMPACT_TOOLBAR_GROUP_CLASS,
  COMPACT_TOOLBAR_ICON_BUTTON_CLASS,
} from '@/components/agentic/toolbarStyles';
import type { TocHeading } from '@/lib/markdown/tocUtils';
import type { ExperimentView } from '@/types/experiments';
import { cn, escapeRegExp } from '@/lib/utils';

const VIEW_OPTIONS = [
  { value: 'overview', ariaLabel: 'Overview', icon: LayoutDashboard, tooltip: 'Overview' },
  { value: 'leaderboard', ariaLabel: 'Leaderboard', icon: Table2, tooltip: 'Leaderboard' },
] as const;

interface ReportToolbarProps {
  content: string;
  searchQuery: string;
  searchExpanded: boolean;
  onSearchQueryChange: (query: string) => void;
  onSearchExpandedChange: (expanded: boolean) => void;
  headings: TocHeading[];
  scrollToHeading: (slug: string) => void;
  isStreaming: boolean;
  onRegenerate: () => void;
  experimentView: ExperimentView;
  onViewChange: (view: ExperimentView) => void;
}

export function ReportToolbar({
  content,
  searchQuery,
  searchExpanded,
  onSearchQueryChange,
  onSearchExpandedChange,
  headings,
  scrollToHeading,
  isStreaming,
  onRegenerate,
  experimentView,
  onViewChange,
}: ReportToolbarProps) {
  const [copied, copy] = useCopyToClipboard();

  const handleCopy = useCallback(() => {
    void copy(content);
  }, [copy, content]);

  const handleExport = useCallback(() => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'experiment-report.md');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [content]);

  const matchCount = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return 0;
    return content.match(new RegExp(escapeRegExp(q), 'gi'))?.length ?? 0;
  }, [searchQuery, content]);

  return (
    <div className="flex h-14 items-center justify-between border-b px-3 shrink-0">
      {/* Left: tools */}
      <TooltipProvider delayDuration={300}>
        <div className="relative flex items-center gap-1.5">
          {/* Default buttons layer */}
          <div
            className={cn(
              COMPACT_TOOLBAR_GROUP_CLASS,
              'transition-opacity duration-150 ease-out',
              searchExpanded ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onSearchExpandedChange(true)}
                  className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                  aria-label="Search"
                >
                  <Search className={cn('h-3.5 w-3.5', searchQuery && 'text-primary')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Search</TooltipContent>
            </Tooltip>

            {headings.length > 0 && (
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
                      onClick={() => scrollToHeading(h.slug)}
                      className={cn('cursor-pointer truncate', h.level === 3 && 'pl-6')}
                    >
                      {h.text}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                  aria-label="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExport}
                  className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                  aria-label="Export as Markdown"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Export as Markdown</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRegenerate}
                  disabled={isStreaming}
                  className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                  aria-label="Regenerate report"
                >
                  {isStreaming ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isStreaming ? 'Generating...' : 'Regenerate report'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Search overlay layer */}
          <div
            className={cn(
              'absolute inset-y-0 left-0 w-72 flex items-center transition-opacity duration-150 ease-out',
              searchExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            <div
              className="flex h-7 w-full items-center gap-1 rounded-md bg-muted/50 pl-0 pr-1"
              onBlur={(e) => {
                const related = e.relatedTarget as Node | null;
                if (!related || !e.currentTarget.contains(related)) {
                  onSearchExpandedChange(false);
                }
              }}
            >
              <div className="grid h-7 w-7 shrink-0 place-items-center">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <input
                placeholder="Search report..."
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onSearchExpandedChange(false);
                  }
                }}
                className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                autoFocus={searchExpanded}
              />
              {searchQuery.trim() && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  onSearchQueryChange('');
                  onSearchExpandedChange(false);
                }}
                className="h-7 w-7 shrink-0"
                aria-label="Close search"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </TooltipProvider>

      {/* Right: view switcher */}
      <IconModeToggle<ExperimentView>
        value={experimentView}
        onValueChange={onViewChange}
        options={VIEW_OPTIONS}
      />
    </div>
  );
}
