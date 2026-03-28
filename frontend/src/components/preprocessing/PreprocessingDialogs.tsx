import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { AnimatedPlaceholderInput } from '@/components/ui/animated-placeholder-input';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { AvailableTable } from '@/types/preprocessing';
import { Check, Columns3, Rows3, Search, X } from 'lucide-react';
import { buildDatasetSearchPlaceholders } from './datasetSearchPlaceholders';

/* ------------------------------------------------------------------ */
/*  Dimension pill – matches column-pill styling with a multiply icon */
/* ------------------------------------------------------------------ */

function DimensionPill({ rows, cols, selected }: { rows: number; cols: number; selected: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tabular-nums',
        selected ? 'border-primary/25 bg-primary/10' : 'border-border/70 bg-muted/30'
      )}
    >
      <Rows3 className="h-3 w-3 text-muted-foreground" />
      <span>{rows}</span>
      <X className="h-2.5 w-2.5 text-muted-foreground/70" />
      <span>{cols}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Column pill                                                       */
/* ------------------------------------------------------------------ */

function ColumnPill({ name, selected }: { name: string; selected: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
        selected ? 'border-primary/25 bg-primary/10' : 'border-border/70 bg-muted/30'
      )}
    >
      <Columns3 className="h-3 w-3 text-muted-foreground" />
      <span className="max-w-[9rem] truncate">{name}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Dataset card                                                      */
/* ------------------------------------------------------------------ */

function DatasetCard({
  table,
  selected,
  onSelect
}: {
  table: AvailableTable;
  selected: boolean;
  onSelect: () => void;
}) {
  const previewRows = table.previewRows ?? [];
  const previewColumns = table.columns?.length
    ? table.columns.slice(0, 4).map((c) => c.name)
    : Object.keys(previewRows[0] ?? {}).slice(0, 4);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        selected
          ? 'border-primary/60 bg-primary/[0.06] shadow-sm dark:shadow-none'
          : 'border-border/70 bg-card hover:bg-muted/30'
      )}
    >
      {/* Header row: filename + dimension pill */}
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{table.filename}</p>
        <DimensionPill rows={table.nRows ?? 0} cols={table.nCols ?? 0} selected={selected} />
      </div>

      {/* Column pills */}
      {table.columns?.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {table.columns.slice(0, 5).map((column) => (
            <ColumnPill key={column.name} name={column.name} selected={selected} />
          ))}
          {table.columns.length > 5 && (
            <span className="text-[10px] text-muted-foreground">
              +{table.columns.length - 5} more
            </span>
          )}
        </div>
      ) : null}

      {/* Expandable preview table */}
      {previewRows.length > 0 && (
        <div
          className={cn(
            'grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out',
            selected ? 'mt-3 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="min-h-0">
            <div className="overflow-x-auto rounded-md bg-background/70">
              <table className="w-full text-[10px]">
                <thead className="bg-muted/30">
                  <tr className="text-muted-foreground">
                    {previewColumns.map((col) => (
                      <th key={col} className="px-2 py-1.5 text-left font-medium">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-t border-border/30">
                      {previewColumns.map((col) => (
                        <td key={`${i}-${col}`} className="px-2 py-1 font-mono text-muted-foreground">
                          {row[col] == null ? 'null' : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Dataset chooser dialog                                            */
/* ------------------------------------------------------------------ */

interface DatasetChooserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasetSearch: string;
  onDatasetSearchChange: (value: string) => void;
  allTables: AvailableTable[];
  filteredTables: AvailableTable[];
  candidateDatasetId: string | null;
  onCandidateDatasetChange: (datasetId: string) => void;
  onStart: () => void;
}

export function DatasetChooserDialog({
  open,
  onOpenChange,
  datasetSearch,
  onDatasetSearchChange,
  allTables,
  filteredTables,
  candidateDatasetId,
  onCandidateDatasetChange,
  onStart
}: DatasetChooserDialogProps) {
  const searchPlaceholders = useMemo(
    () => buildDatasetSearchPlaceholders(allTables),
    [allTables]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select a dataset</DialogTitle>
          <DialogDescription>
            Choose which dataset you'd like to preprocess. You can search by filename or ID.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0">
          {/* Search bar */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <AnimatedPlaceholderInput
              placeholders={searchPlaceholders}
              interval={2600}
              leftPadding={2.25}
              value={datasetSearch}
              onChange={(event) => onDatasetSearchChange(event.target.value)}
              className="pl-9"
            />
          </div>

          {/* Dataset list */}
          <ScrollArea className="h-72 max-h-full">
            <div className="space-y-2 p-2">
              {filteredTables.map((table) => (
                <DatasetCard
                  key={table.datasetId}
                  table={table}
                  selected={candidateDatasetId === table.datasetId}
                  onSelect={() => onCandidateDatasetChange(table.datasetId)}
                />
              ))}

              {filteredTables.length === 0 && (
                <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No datasets match your search.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer – icon buttons */}
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full transition-[transform,border-color,background-color,color,box-shadow] duration-200 hover:scale-110 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close dialog</span>
          </Button>

          <Button
            variant="outline"
            size="icon"
            className={cn(
              'group rounded-full border-white bg-white text-black transition-[transform,box-shadow] duration-200 hover:scale-110 hover:shadow-lg active:scale-[0.98] disabled:hover:scale-100 disabled:hover:shadow-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'hover:bg-accent-bg-hover hover:border-accent-border'
            )}
            disabled={!candidateDatasetId}
            onClick={onStart}
          >
            <span className="relative inline-flex h-4 w-4 items-center justify-center">
              <Check className="h-4 w-4 text-black transition-opacity group-hover:opacity-0" />
              <Check
                className={cn(
                  'absolute h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100',
                  'text-accent-text'
                )}
              />
            </span>
            <span className="sr-only">Start with this dataset</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RenameTabDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  onSave: () => void;
  title?: string;
  description?: string;
}

export function RenameTabDialog({
  open,
  onOpenChange,
  value,
  onValueChange,
  onSave,
  title = 'Rename processing tab',
  description = 'Update the name of the current processing tab.'
}: RenameTabDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSave();
          }}
          placeholder="Tab name"
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!value.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
