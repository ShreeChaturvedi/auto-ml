import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
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
import { Columns3, Search } from 'lucide-react';
import { buildDatasetSearchPlaceholders } from './datasetSearchPlaceholders';

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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select a dataset</DialogTitle>
          <DialogDescription>
            Choose which dataset you'd like to preprocess. You can search by filename or ID.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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

          <ScrollArea className="h-64">
            <div className="space-y-2 p-2">
              {filteredTables.map((table) => {
                const selected = candidateDatasetId === table.datasetId;
                const previewRows = table.previewRows ?? [];
                const previewColumns = table.columns?.length
                  ? table.columns.slice(0, 4).map((column) => column.name)
                  : Object.keys(previewRows[0] ?? {}).slice(0, 4);
                return (
                  <button
                    type="button"
                    key={table.datasetId}
                    onClick={() => onCandidateDatasetChange(table.datasetId)}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors',
                      selected
                        ? 'border-primary/60 bg-primary/[0.06] shadow-sm'
                        : 'border-border/70 bg-card hover:bg-muted/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{table.filename}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{table.datasetId}</p>
                      </div>
                      <Badge variant={selected ? 'default' : 'outline'} className="text-[10px]">
                        {table.nRows ?? 0} x {table.nCols ?? 0}
                      </Badge>
                    </div>
                    {table.columns?.length ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {table.columns.slice(0, 5).map((column) => (
                          <span
                            key={column.name}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
                              selected ? 'border-primary/25 bg-primary/10' : 'border-border/70 bg-muted/30'
                            )}
                          >
                            <Columns3 className="h-3 w-3 text-muted-foreground" />
                            <span className="max-w-[9rem] truncate">{column.name}</span>
                          </span>
                        ))}
                        {table.columns.length > 5 ? (
                          <span className="text-[10px] text-muted-foreground">
                            +{table.columns.length - 5} more
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {selected && previewRows.length > 0 ? (
                      <div className="mt-3 overflow-x-auto rounded-md bg-background/70">
                        <table className="w-full text-[10px]">
                          <thead className="bg-muted/30">
                            <tr className="text-muted-foreground">
                              {previewColumns.map((columnName) => (
                                <th key={columnName} className="px-2 py-1.5 text-left font-medium">
                                  {columnName}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.slice(0, 3).map((previewRow, rowIndex) => (
                              <tr key={rowIndex} className="border-t border-border/30">
                                {previewColumns.map((columnName) => (
                                  <td key={`${rowIndex}-${columnName}`} className="px-2 py-1 font-mono text-muted-foreground">
                                    {previewRow[columnName] == null ? 'null' : String(previewRow[columnName])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    {!selected && previewRows.length > 0 ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Select to preview sample rows.
                      </p>
                    ) : null}
                  </button>
                );
              })}

              {filteredTables.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No datasets match your search.
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onStart} disabled={!candidateDatasetId}>
            Start with this dataset
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
}

export function RenameTabDialog({
  open,
  onOpenChange,
  value,
  onValueChange,
  onSave
}: RenameTabDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename processing tab</DialogTitle>
          <DialogDescription>
            Update the name of the current processing tab.
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
