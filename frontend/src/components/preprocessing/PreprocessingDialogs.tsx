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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { AvailableTable } from '@/types/preprocessing';

interface DatasetChooserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasetSearch: string;
  onDatasetSearchChange: (value: string) => void;
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
  filteredTables,
  candidateDatasetId,
  onCandidateDatasetChange,
  onStart
}: DatasetChooserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select a dataset to start preprocessing</DialogTitle>
          <DialogDescription>
            Choose which dataset you'd like to preprocess. You can search by filename or ID.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={datasetSearch}
            onChange={(event) => onDatasetSearchChange(event.target.value)}
            placeholder="Search datasets by filename or id..."
          />

          <ScrollArea className="h-64 rounded-md border">
            <div className="space-y-2 p-2">
              {filteredTables.map((table) => {
                const selected = candidateDatasetId === table.datasetId;
                const previewRows = table.previewRows ?? [];
                const previewColumns = Object.keys(previewRows[0] ?? {}).slice(0, 4);
                return (
                  <button
                    type="button"
                    key={table.datasetId}
                    onClick={() => onCandidateDatasetChange(table.datasetId)}
                    className={cn(
                      'w-full rounded-md border p-3 text-left transition-colors',
                      selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{table.filename}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {table.nRows ?? 0} x {table.nCols ?? 0}
                      </Badge>
                    </div>
                    {table.columns?.length ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        Columns: {table.columns.slice(0, 4).map((column) => column.name).join(', ')}
                      </p>
                    ) : null}
                    {previewRows.length > 0 ? (
                      <div className="mt-2 overflow-x-auto rounded-md border bg-background/70">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="border-b border-border/40 text-muted-foreground">
                              {previewColumns.map((columnName) => (
                                <th key={columnName} className="px-2 py-1 text-left font-medium">
                                  {columnName}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.slice(0, 3).map((previewRow, rowIndex) => (
                              <tr key={rowIndex} className="border-b border-border/20 last:border-0">
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
