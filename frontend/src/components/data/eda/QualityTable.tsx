/**
 * QualityTable — TanStack sortable table for per-column data quality.
 * Shows type (using user-set columnTypes with EDA fallback), completeness,
 * missing counts, and unique counts.
 */

import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ColumnDataType, DataQualitySummary } from '@/types/file';
import { TypeIcon } from '../TypeIcon';
import { getTypeLabel } from '../columnTypeUtils';
import { getSeverityLabel, mapEDATypeToColumnType } from './edaConstants';
import { formatPercentage } from './edaFormatters';

interface QualityTableProps {
  dataQuality: DataQualitySummary[];
  columnTypes?: Record<string, ColumnDataType>;
  onRowClick?: (column: string) => void;
  className?: string;
}

export function QualityTable({ dataQuality, columnTypes, onRowClick, className }: QualityTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'completeness', desc: false },
  ]);

  const columns = useMemo<ColumnDef<DataQualitySummary>[]>(() => [
    {
      accessorKey: 'column',
      header: 'Column',
      cell: ({ row }) => (
        <span className="text-sm font-medium truncate block max-w-[200px]" title={row.original.column}>
          {row.original.column}
        </span>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      accessorFn: (row) => columnTypes?.[row.column] ?? mapEDATypeToColumnType(row.dataType),
      cell: ({ getValue }) => {
        const type = getValue() as ColumnDataType;
        return (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TypeIcon type={type} className="h-3.5 w-3.5" />
            {getTypeLabel(type)}
          </span>
        );
      },
    },
    {
      id: 'completeness',
      header: 'Completeness',
      accessorFn: (row) => 100 - row.missingPercentage,
      cell: ({ getValue }) => {
        const completeness = getValue() as number;
        const severity = getSeverityLabel(completeness);
        return (
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="flex-1" style={{ '--severity-color': `hsl(var(${severity.colorVar}))` } as React.CSSProperties}>
              <Progress value={completeness} className="h-1.5 [&>div]:bg-[var(--severity-color)]" />
            </div>
            <span className={cn('text-xs font-mono tabular-nums w-12 text-right', severity.colorClass)}>
              {formatPercentage(completeness, true)}
            </span>
          </div>
        );
      },
      sortingFn: (rowA, rowB) => {
        const a = 100 - rowA.original.missingPercentage;
        const b = 100 - rowB.original.missingPercentage;
        return a - b;
      },
    },
    {
      id: 'missing',
      header: 'Missing',
      accessorFn: (row) => row.missingCount,
      cell: ({ row }) => {
        const { missingCount, missingPercentage } = row.original;
        return (
          <span className={cn('text-xs font-mono tabular-nums', missingCount === 0 && 'text-muted-foreground/50')}>
            {missingCount.toLocaleString()}
            <span className="text-muted-foreground ml-1">({formatPercentage(missingPercentage)})</span>
          </span>
        );
      },
    },
    {
      id: 'unique',
      header: 'Unique',
      accessorFn: (row) => row.uniqueCount,
      cell: ({ row }) => {
        const { uniqueCount, uniquePercentage } = row.original;
        return (
          <span className="text-xs font-mono tabular-nums">
            {uniqueCount.toLocaleString()}
            <span className="text-muted-foreground ml-1">({formatPercentage(uniquePercentage)})</span>
          </span>
        );
      },
    },
  ], [columnTypes]);

  const table = useReactTable({
    data: dataQuality,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className={cn('rounded-lg border', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'px-3 py-2 text-xs',
                    header.column.getCanSort() && 'cursor-pointer select-none hover:bg-muted/50',
                  )}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <span className="flex items-center gap-1">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(onRowClick && 'cursor-pointer hover:bg-muted/40')}
              onClick={onRowClick ? () => onRowClick(row.original.column) : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="px-3 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
