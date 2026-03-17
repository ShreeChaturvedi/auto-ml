import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FileCode } from 'lucide-react';

export interface CellSummary {
  cellId?: string;
  id?: string;
  title?: string;
  cellType?: string;
  status?: string;
  position?: number;
}

export interface ListCellsOutput {
  notebookId?: string;
  cells?: CellSummary[];
}

export function ListCellsResult({ data }: { data: ListCellsOutput }) {
  const cells = data.cells ?? [];
  if (cells.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Notebook is empty.</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">
        {cells.length} cell{cells.length !== 1 ? 's' : ''}
      </p>
      {cells.map((cell, i) => (
        <div
          key={cell.cellId ?? cell.id ?? i}
          className="flex items-center gap-2 rounded-md px-2 py-1 bg-card/40 border border-border/30"
        >
          <FileCode className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-foreground truncate flex-1">
            {cell.title || `Cell ${(cell.position ?? i) + 1}`}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {cell.cellType && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                {cell.cellType}
              </Badge>
            )}
            {cell.status && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px] px-1 py-0',
                  cell.status === 'success' && 'border-emerald-500/40 text-emerald-600',
                  cell.status === 'error' && 'border-destructive/40 text-destructive',
                  cell.status === 'running' && 'border-amber-500/40 text-amber-600'
                )}
              >
                {cell.status}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
