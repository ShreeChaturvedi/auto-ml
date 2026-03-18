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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

import { Eye, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DataPreview } from '@/types/file';
import { EDAPanel, type EdaTab } from './eda/EDAPanel';
import { EDAToolbar } from './eda/EDAToolbar';
import type { DistributionMode, CorrViewMode } from './eda/edaConstants';
import type { InsightAction } from './eda/edaInsights';
import { DataTableControls } from './DataTableControls';
import type { QueryInfo } from './QueryInfoDialog';
import Papa from 'papaparse';
import { DataTableHeaderCell } from './DataTableHeader';
import { useColumnTypeEditor } from './useColumnTypeEditor';

export type { QueryInfo };

const ROW_HEIGHT = 40;

interface DataTableProps {
  preview: DataPreview;
  onSave?: () => void;
  columnTypes?: Record<string, import('@/types/file').ColumnDataType>;
  onColumnTypeChange?: (columnName: string, nextType: import('@/types/file').ColumnDataType) => Promise<void> | void;
  typeColorClassName?: string;
  queryInfo?: QueryInfo;
  className?: string;
  controlsPortalTarget?: HTMLElement | null;
  onInsightAction?: (action: InsightAction) => void;
}

export function DataTable({
  preview,
  onSave,
  columnTypes,
  onColumnTypeChange,
  typeColorClassName,
  queryInfo,
  className,
  controlsPortalTarget,
  onInsightAction
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [edaView, setEdaView] = useState<'table' | 'eda'>('table');
  const eda = preview.eda ?? queryInfo?.eda;
  const hasEda = Boolean(eda);

  // EDA lifted state
  const [edaActiveTab, setEdaActiveTab] = useState<EdaTab>('overview');
  const [distSelectedColumn, setDistSelectedColumn] = useState<string | null>(null);
  const [distCompareColumns, setDistCompareColumns] = useState<string[]>([]);
  const [distMode, setDistMode] = useState<DistributionMode>('histogram');
  const [corrSelectedCell, setCorrSelectedCell] = useState<{ a: string; b: string } | null>(null);
  const [corrViewMode, setCorrViewMode] = useState<CorrViewMode>('heatmap');

  const { updatingColumnName, handleColumnTypeSelect } = useColumnTypeEditor({ onColumnTypeChange });

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      preview.headers.map((header) => ({
        accessorKey: header,
        header: ({ column }) => {
          const currentType = columnTypes?.[header] ?? 'unknown';
          const isUpdatingType = updatingColumnName === header;
          return (
            <DataTableHeaderCell
              header={header}
              column={column}
              currentType={currentType}
              isUpdatingType={isUpdatingType}
              onColumnTypeChange={onColumnTypeChange}
              handleColumnTypeSelect={handleColumnTypeSelect}
              typeColorClassName={typeColorClassName}
            />
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
    URL.revokeObjectURL(url);
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
        <div className="flex items-center px-4 py-1.5">
          {totalRows > 0 ? (
            <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
              <span className="flex items-center gap-1.5" title="Visible rows">
                <Eye className="h-3 w-3 shrink-0 opacity-60" />
                {visibleStart}–{visibleEnd}
                <span className="opacity-50">/</span>
                {totalRows.toLocaleString()}
              </span>
              {preview.previewRows < preview.totalRows && (
                <>
                  <span className="opacity-30">·</span>
                  <span className="flex items-center gap-1.5 opacity-70" title="Total dataset rows">
                    <Database className="h-3 w-3 shrink-0" />
                    {preview.totalRows.toLocaleString()}
                  </span>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground font-mono">No rows</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Always render DataTableControls */}
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
          <EDAToolbar
            eda={eda!}
            activeTab={edaActiveTab}
            onActiveTabChange={setEdaActiveTab}
            distSelectedColumn={distSelectedColumn}
            onDistSelectedColumnChange={setDistSelectedColumn}
            distMode={distMode}
            onDistModeChange={setDistMode}
            distCompareColumns={distCompareColumns}
            onDistCompareColumnsChange={setDistCompareColumns}
            corrViewMode={corrViewMode}
            onCorrViewModeChange={setCorrViewMode}
          />
          {eda && (
            <EDAPanel
              eda={eda}
              rows={preview.rows}
              columnTypes={columnTypes}
              activeTab={edaActiveTab}
              setActiveTab={setEdaActiveTab}
              distSelectedColumn={distSelectedColumn}
              onDistSelectedColumnChange={setDistSelectedColumn}
              distCompareColumns={distCompareColumns}
              distMode={distMode}
              corrSelectedCell={corrSelectedCell}
              onCorrSelectedCellChange={setCorrSelectedCell}
              corrViewMode={corrViewMode}
              onInsightAction={onInsightAction}
            />
          )}
        </div>
      ) : (
        tableView
      )}
    </div>
  );
}
