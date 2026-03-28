/**
 * DataTableControls - Compact toolbar with search, export, save, query info, and view toggle
 */

import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Download, Save, X, TableIcon, ChartPie } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { IconModeToggle } from './IconModeToggle';
import { QueryInfoDialog } from './QueryInfoDialog';
import type { QueryInfo } from './QueryInfoDialog';

interface DataTableControlsProps {
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  searchExpanded: boolean;
  onSearchExpandedChange: (expanded: boolean) => void;
  onExport: () => void;
  onSave?: () => void;
  queryInfo?: QueryInfo;
  hasEda: boolean;
  edaView: 'table' | 'eda';
  onEdaViewChange: (view: 'table' | 'eda') => void;
  controlsPortalTarget?: HTMLElement | null;
}

export function DataTableControls({
  globalFilter,
  onGlobalFilterChange,
  searchExpanded,
  onSearchExpandedChange,
  onExport,
  onSave,
  queryInfo,
  hasEda,
  edaView,
  onEdaViewChange,
  controlsPortalTarget
}: DataTableControlsProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchExpanded) {
      searchInputRef.current?.focus();
    }
  }, [searchExpanded]);

  const queryInfoDialog = queryInfo ? (
    <QueryInfoDialog queryInfo={queryInfo} hasEda={hasEda} />
  ) : null;

  const compactControls = (
    <div className="relative flex h-7 w-full min-w-0 items-center overflow-hidden" data-testid="datatable-compact-controls">
      <div
        className={cn(
          'flex max-w-full min-w-0 items-center gap-1 overflow-hidden transition-opacity duration-150 ease-out',
          searchExpanded ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
        data-testid="datatable-controls-default"
      >
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSearchExpandedChange(true)}
                className="h-7 w-7 shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                aria-label="Search"
              >
                <Search className={cn('h-3.5 w-3.5', globalFilter ? 'text-accent-text' : 'text-muted-foreground')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Search</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onExport}
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                aria-label="Export"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Export</TooltipContent>
          </Tooltip>

          {onSave && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onSave}
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  aria-label="Save"
                >
                  <Save className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Save</TooltipContent>
            </Tooltip>
          )}

          {queryInfoDialog}
        </div>

        {hasEda && (
          <IconModeToggle
            value={edaView}
            onValueChange={(val) => {
              if (val === 'table' || val === 'eda') onEdaViewChange(val);
            }}
            className="ml-auto shrink-0"
            options={[
              {
                value: 'table',
                ariaLabel: 'Table view',
                icon: TableIcon,
                tooltip: 'Table'
              },
              {
                value: 'eda',
                ariaLabel: 'Analysis view',
                icon: ChartPie,
                tooltip: 'Analysis'
              }
            ]}
          />
        )}
      </div>

      <div
        className={cn(
          'absolute inset-0 flex items-center transition-opacity duration-150 ease-out',
          searchExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        data-testid="datatable-controls-search-overlay"
      >
        <div
          className="flex h-7 w-full items-center gap-1 rounded-md bg-muted/50 pl-0 pr-1"
          onBlur={(event) => {
            const relatedTarget = event.relatedTarget as Node | null;
            if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
              onSearchExpandedChange(false);
            }
          }}
        >
          <div className="grid h-7 w-7 shrink-0 place-items-center">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <input
            ref={searchInputRef}
            placeholder="Search rows..."
            value={globalFilter}
            onChange={(e) => onGlobalFilterChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onSearchExpandedChange(false);
              }
            }}
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onGlobalFilterChange('');
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

  if (controlsPortalTarget) {
    return createPortal(
      <TooltipProvider delayDuration={300}>{compactControls}</TooltipProvider>,
      controlsPortalTarget
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="shrink-0 border-b bg-muted/30 px-4 py-2.5 dark:shadow-none">
        {compactControls}
      </div>
    </TooltipProvider>
  );
}
