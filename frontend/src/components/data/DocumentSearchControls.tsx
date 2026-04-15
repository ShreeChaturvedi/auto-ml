import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface DocumentSearchControlsProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchExpanded: boolean;
  onSearchExpandedChange: (expanded: boolean) => void;
  matchCount: number;
  onDownload?: () => void;
  downloadDisabled?: boolean;
  controlsPortalTarget: HTMLElement;
}

export function DocumentSearchControls({
  searchQuery,
  onSearchQueryChange,
  searchExpanded,
  onSearchExpandedChange,
  matchCount,
  onDownload,
  downloadDisabled,
  controlsPortalTarget,
}: DocumentSearchControlsProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchExpanded) {
      searchInputRef.current?.focus();
    }
  }, [searchExpanded]);

  const controls = (
    <div className="relative flex h-7 w-full min-w-0 items-center overflow-hidden">
      {/* Default layer: search + download icons */}
      <div
        className={cn(
          'flex max-w-full min-w-0 items-center gap-1 overflow-hidden transition-opacity duration-150 ease-out',
          searchExpanded ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSearchExpandedChange(true)}
              className="h-7 w-7 shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="Search"
            >
              <Search className={cn('h-3.5 w-3.5', searchQuery ? 'text-accent-text' : 'text-muted-foreground')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Search</TooltipContent>
        </Tooltip>

        {onDownload && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDownload}
                disabled={downloadDisabled}
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                aria-label="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Download</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Expanded layer: search input with match counter */}
      <div
        className={cn(
          'absolute inset-0 flex items-center transition-opacity duration-150 ease-out',
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
            ref={searchInputRef}
            id="document-search-input"
            name="documentSearch"
            placeholder="Search document..."
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
            <span className={cn(
              'shrink-0 text-xs tabular-nums',
              matchCount === 0 ? 'text-amber-500 dark:text-amber-400' : 'text-muted-foreground'
            )}>
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
            className="h-7 w-7 shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="Close search"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <TooltipProvider delayDuration={300}>{controls}</TooltipProvider>,
    controlsPortalTarget
  );
}
