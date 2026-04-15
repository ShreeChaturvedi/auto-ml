import { useCallback, useMemo } from 'react';
import { Check, Copy, Download, List, Search, X } from 'lucide-react';
import { downloadMarkdownFile } from '@/lib/exportMarkdown';

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
import { cn } from '@/lib/utils';
import {
  COMPACT_TOOLBAR_GROUP_CLASS,
  COMPACT_TOOLBAR_ICON_BUTTON_CLASS,
} from '@/components/agentic/toolbarStyles';
import type { TocHeading } from '@/lib/markdown/tocUtils';
import { escapeRegExp } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

interface PlanViewerToolbarProps {
  planContent: string;
  planName: string;
  searchQuery: string;
  searchExpanded: boolean;
  onSearchQueryChange: (query: string) => void;
  onSearchExpandedChange: (expanded: boolean) => void;
  headings: TocHeading[];
  scrollToHeading: (slug: string) => void;
}

export function PlanViewerToolbar({
  planContent,
  planName,
  searchQuery,
  searchExpanded,
  onSearchQueryChange,
  onSearchExpandedChange,
  headings,
  scrollToHeading,
}: PlanViewerToolbarProps) {
  const [copied, copy] = useCopyToClipboard();

  const handleCopy = useCallback(() => {
    void copy(planContent);
  }, [copy, planContent]);

  const handleExport = useCallback(() => {
    downloadMarkdownFile(planName, planContent);
  }, [planContent, planName]);

  const matchCount = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return 0;
    return planContent.match(new RegExp(escapeRegExp(q), 'gi'))?.length ?? 0;
  }, [searchQuery, planContent]);

  return (
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
          </div>

          {/* Search overlay layer */}
          <div
            className={cn(
              'absolute inset-y-0 right-0 w-72 flex items-center transition-opacity duration-150 ease-out',
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
                id="plan-search-input"
                name="planSearch"
                placeholder="Search plan..."
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
  );
}
