import { FileCode, Hash, Type } from 'lucide-react';
import { StatusPill } from '@/components/llm/shared/StatusPill';
import { normalizeStatus } from './shared';

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

function iconForCellType(cellType?: string) {
  if (cellType === 'markdown') return Hash;
  if (cellType === 'raw') return Type;
  return FileCode;
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
      {cells.map((cell, i) => {
        const Icon = iconForCellType(cell.cellType);
        return (
          <div key={cell.cellId ?? cell.id ?? i} className="flex items-center gap-2 py-1">
            <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-foreground truncate flex-1">
              {cell.title || `Cell ${(cell.position ?? i) + 1}`}
            </span>
            {cell.status && (
              <StatusPill status={normalizeStatus(cell.status)} label={cell.status} />
            )}
          </div>
        );
      })}
    </div>
  );
}
