/**
 * DataTable - Enhanced table with virtual scrolling, search, export
 */

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useState, useMemo, useCallback, useRef } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Type,
  Hash,
  Calculator,
  ToggleLeft,
  Calendar,
  CircleHelp,
  Check
} from 'lucide-react';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

import { cn } from '@/lib/utils';
import type { ColumnDataType, DataPreview } from '@/types/file';
import { EDAPanel } from './EDAPanel';
import { DataTableControls } from './DataTableControls';
import type { QueryInfo } from './QueryInfoDialog';
import Papa from 'papaparse';

export type { QueryInfo };

interface DataTableProps {
  preview: DataPreview;
  onSave?: () => void;
  columnTypes?: Record<string, ColumnDataType>;
  onColumnTypeChange?: (columnName: string, nextType: ColumnDataType) => Promise<void> | void;
  typeColorClassName?: string;
  queryInfo?: QueryInfo;
  className?: string;
  controlsPortalTarget?: HTMLElement | null;
}

const TYPE_OPTIONS: ColumnDataType[] = ['string', 'integer', 'float', 'boolean', 'date'];

function getTypeLabel(type: ColumnDataType): string {
  switch (type) {
    case 'string':
      return 'String';
    case 'integer':
      return 'Integer';
    case 'float':
      return 'Float';
    case 'boolean':
      return 'Boolean';
    case 'date':
      return 'Date';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function TypeIcon({ type, className }: { type: ColumnDataType; className?: string }) {
  switch (type) {
    case 'string':
      return <Type className={className} />;
    case 'integer':
      return <Hash className={className} />;
    case 'float':
      return <Calculator className={className} />;
    case 'boolean':
      return <ToggleLeft className={className} />;
    case 'date':
      return <Calendar className={className} />;
    case 'unknown':
    default:
      return <CircleHelp className={className} />;
  }
}

export function DataTable({
  preview,
  onSave,
  columnTypes,
  onColumnTypeChange,
  typeColorClassName,
  queryInfo,
  className,
  controlsPortalTarget
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [updatingColumnName, setUpdatingColumnName] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [edaView, setEdaView] = useState<'table' | 'eda'>('table');
  const eda = preview.eda ?? queryInfo?.eda;
  const hasEda = Boolean(eda);

  const handleColumnTypeSelect = useCallback(
    async (columnName: string, nextType: ColumnDataType) => {
      if (!onColumnTypeChange) {
        return;
      }
      setUpdatingColumnName(columnName);
      try {
        await onColumnTypeChange(columnName, nextType);
      } finally {
        setUpdatingColumnName((current) => (current === columnName ? null : current));
      }
    },
    [onColumnTypeChange]
  );

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      preview.headers.map((header) => ({
        accessorKey: header,
        header: ({ column }) => {
          const isSorted = column.getIsSorted();
          const currentType = columnTypes?.[header] ?? 'unknown';
          const isUpdatingType = updatingColumnName === header;
          return (
            <div className="-ml-3 flex items-center gap-1">
              {onColumnTypeChange ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-7 w-7 bg-transparent transition-colors',
                        typeColorClassName ?? 'text-primary',
                        'hover:bg-accent/70 focus-visible:bg-accent/70 data-[state=open]:bg-accent/70 active:bg-accent/70'
                      )}
                      disabled={isUpdatingType}
                      title={`Column type: ${getTypeLabel(currentType)}`}
                    >
                      <TypeIcon type={currentType} className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    {TYPE_OPTIONS.map((typeOption) => {
                      const selected = currentType === typeOption;
                      return (
                        <DropdownMenuItem
                          key={`${header}-${typeOption}`}
                          onClick={() => {
                            if (!selected) {
                              void handleColumnTypeSelect(header, typeOption);
                            }
                          }}
                          className={cn(
                            'flex items-center justify-between gap-2'
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <TypeIcon
                              type={typeOption}
                              className={cn(
                                'h-3.5 w-3.5',
                                selected
                                  ? (typeColorClassName ?? 'text-primary')
                                  : 'text-muted-foreground'
                              )}
                            />
                            {getTypeLabel(typeOption)}
                          </span>
                          {selected ? (
                            <Check
                              className={cn('h-3.5 w-3.5', typeColorClassName ?? 'text-primary')}
                            />
                          ) : null}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span
                  className={cn(typeColorClassName ?? 'text-primary')}
                  title={`Column type: ${getTypeLabel(currentType)}`}
                >
                  <TypeIcon type={currentType} className="h-3.5 w-3.5" />
                </span>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 font-medium"
                onClick={() => column.toggleSorting()}
              >
                {header}
                {isSorted === 'asc' ? (
                  <ArrowUp className="ml-2 h-3 w-3" />
                ) : isSorted === 'desc' ? (
                  <ArrowDown className="ml-2 h-3 w-3" />
                ) : (
                  <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />
                )}
              </Button>
            </div>
          );
        },
        cell: ({ getValue }) => {
          const value = getValue();
          return <span className="font-mono text-sm">{String(value ?? '')}</span>;
        }
      })),
    [
      columnTypes,
      handleColumnTypeSelect,
      onColumnTypeChange,
      preview.headers,
      typeColorClassName,
      updatingColumnName
    ]
  );

  const table = useReactTable({
    data: preview.rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  });

  const { rows } = table.getRowModel();

  const ROW_HEIGHT = 40;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10
  });

  const handleExport = useCallback(() => {
    const visibleRows = table.getFilteredRowModel().rows.map((row) => row.original);
    const csv = Papa.unparse({ fields: preview.headers, data: visibleRows });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    link.setAttribute('href', url);
    link.setAttribute('download', `query_result_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [table, preview.headers]);

  const totalRows = table.getFilteredRowModel().rows.length;

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0;

  // Derive visible row range from the virtualizer for the status ribbon
  const visibleStart = virtualItems.length > 0 ? virtualItems[0].index + 1 : 0;
  const visibleEnd =
    virtualItems.length > 0
      ? virtualItems[virtualItems.length - 1].index + 1
      : 0;

  const tableView = (
    <div className="flex flex-col h-full">
      <div
        ref={tableContainerRef}
        className="flex-1 min-h-0 overflow-auto overscroll-none"
      >
        <table className="w-full caption-bottom text-xs">
          <TableHeader className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              <>
                {paddingTop > 0 && (
                  <tr>
                    <td colSpan={columns.length} style={{ height: `${paddingTop}px` }} />
                  </tr>
                )}
                {virtualItems.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <TableRow
                      key={row.id}
                      data-index={virtualRow.index}
                      ref={(node) => rowVirtualizer.measureElement(node)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr>
                    <td colSpan={columns.length} style={{ height: `${paddingBottom}px` }} />
                  </tr>
                )}
              </>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  {globalFilter ? 'No results found.' : 'No data'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>

      <div className="border-t bg-muted/30 shrink-0">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="text-xs text-muted-foreground font-mono">
            {totalRows > 0 ? (
              <>
                Showing {visibleStart}-{visibleEnd} of {totalRows.toLocaleString()}{' '}
                {totalRows === 1 ? 'row' : 'rows'}
                {preview.previewRows < preview.totalRows && (
                  <span className="text-muted-foreground/70">
                    {' '}
                    (dataset: {preview.totalRows.toLocaleString()} rows)
                  </span>
                )}
              </>
            ) : (
              'No rows'
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      <DataTableControls
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        searchExpanded={searchExpanded}
        onSearchExpandedChange={setSearchExpanded}
        onExport={handleExport}
        onSave={onSave}
        queryInfo={queryInfo}
        hasEda={hasEda}
        edaView={edaView}
        onEdaViewChange={setEdaView}
        controlsPortalTarget={controlsPortalTarget}
      />
      {hasEda && edaView === 'eda' ? (
        <div className="flex-1 min-h-0 overflow-auto">
          {eda && <EDAPanel eda={eda} />}
        </div>
      ) : (
        tableView
      )}
    </div>
  );
}
