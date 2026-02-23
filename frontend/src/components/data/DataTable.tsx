/**
 * DataTable - Enhanced table with pagination, search, export
 */

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type PaginationState
} from '@tanstack/react-table';
import { useState, useMemo, useCallback } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Download,
  Save,
  ChevronLeft,
  ChevronRight,
  X,
  Info
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { DataPreview, QueryMode, EdaSummary } from '@/types/file';
import { EDAPanel } from './EDAPanel';
import Papa from 'papaparse';

interface DataTableProps {
  preview: DataPreview;
  onSave?: () => void;
  queryInfo?: QueryInfo;
  className?: string;
}

interface QueryInfo {
  query: string;
  mode: QueryMode;
  timestamp: Date;
  eda?: EdaSummary;
  cached?: boolean;
  cacheTimestamp?: string;
  executionMs?: number;
  generatedSql?: string;
  rationale?: string;
}

export function DataTable({ preview, onSave, queryInfo, className }: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25
  });
  const eda = preview.eda ?? queryInfo?.eda;
  const hasEda = Boolean(eda);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      preview.headers.map((header) => ({
        accessorKey: header,
        header: ({ column }) => {
          const isSorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8 font-medium"
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
          );
        },
        cell: ({ getValue }) => {
          const value = getValue();
          return <span className="font-mono text-sm">{String(value ?? '')}</span>;
        }
      })),
    [preview.headers]
  );

  const table = useReactTable({
    data: preview.rows,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel()
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
  const startRow = pagination.pageIndex * pagination.pageSize + 1;
  const endRow = Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalRows);

  const tableView = (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader>
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
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
        </Table>
      </div>

      <div className="border-t bg-muted/30 shrink-0">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="text-xs text-muted-foreground font-mono">
            {totalRows > 0 ? (
              <>
                Showing {startRow}-{endRow} of {totalRows.toLocaleString()}{' '}
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

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Per page</span>
              <Select
                value={String(pagination.pageSize)}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger className="h-7 w-[60px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-xs font-mono">
                {pagination.pageIndex + 1} of {table.getPageCount()}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {hasEda ? (
        <Tabs defaultValue="table" className="flex-1 flex flex-col min-h-0">
          {/* Unified header row with view toggle, search, and export */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-muted/30 shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              {/* View Toggle */}
              <TabsList className="h-8 p-1">
                <TabsTrigger value="table" className="text-xs h-6 px-3 py-0">Table</TabsTrigger>
                <TabsTrigger value="eda" className="text-xs h-6 px-3 py-0">Analysis</TabsTrigger>
              </TabsList>

              {queryInfo && (
                <div className="flex items-center gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 px-2">
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Query Information</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Executed</p>
                            <p className="text-sm font-mono">{queryInfo.timestamp.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Mode</p>
                            <span
                              className={cn(
                                'text-xs px-2 py-0.5 rounded-full font-mono',
                                queryInfo.mode === 'sql'
                                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                  : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                              )}
                            >
                              {queryInfo.mode.toUpperCase()}
                            </span>
                          </div>
                          {typeof queryInfo.executionMs === 'number' && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Execution Time</p>
                              <p className="text-sm font-mono">{Math.round(queryInfo.executionMs)} ms</p>
                            </div>
                          )}
                          {queryInfo.cached !== undefined && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Cache</p>
                              <p className="text-sm font-mono">
                                {queryInfo.cached ? 'Cache hit' : 'Miss'}
                                {queryInfo.cacheTimestamp ? ` (${queryInfo.cacheTimestamp})` : ''}
                              </p>
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground mb-1">User Query</p>
                          <pre className="text-xs font-mono p-3 bg-muted rounded-md overflow-x-auto max-h-64 scrollbar-thin">
                            {queryInfo.query}
                          </pre>
                        </div>

                        {queryInfo.generatedSql && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Generated SQL</p>
                            <pre className="text-xs font-mono p-3 bg-muted rounded-md overflow-x-auto max-h-64 scrollbar-thin">
                              {queryInfo.generatedSql}
                            </pre>
                          </div>
                        )}

                        {queryInfo.rationale && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Rationale</p>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {queryInfo.rationale}
                            </p>
                          </div>
                        )}

                        {eda && (
                          <p className="text-xs text-muted-foreground">
                            EDA summary available for this result. Use the Analysis tab to explore visuals.
                          </p>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  {typeof queryInfo.executionMs === 'number' && (
                    <Badge variant="outline" className="h-7 px-2 text-xs font-mono">
                      {Math.round(queryInfo.executionMs)} ms
                    </Badge>
                  )}
                  {queryInfo.cached !== undefined && (
                    <Badge variant={queryInfo.cached ? 'secondary' : 'outline'} className="h-7 px-2 text-xs font-mono">
                      {queryInfo.cached ? 'Cache hit' : 'Cache miss'}
                    </Badge>
                  )}
                </div>
              )}

              <div className="relative w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="pl-8 pr-8 h-8 text-sm"
                />
                {globalFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGlobalFilter('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} className="h-8">
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
              {onSave && (
                <Button variant="outline" size="sm" onClick={onSave} className="h-8">
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>
              )}
            </div>
          </div>

          <TabsContent value="table" className="flex-1 flex flex-col min-h-0 mt-0">
            {tableView}
          </TabsContent>
          <TabsContent value="eda" className="flex-1 min-h-0 mt-0 overflow-auto">
            {eda && <EDAPanel eda={eda} />}
          </TabsContent>
        </Tabs>
      ) : (
        <>
          {/* Header row for non-EDA view */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-muted/30 shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              {queryInfo && (
                <div className="flex items-center gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 px-2">
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Query Information</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Executed</p>
                            <p className="text-sm font-mono">{queryInfo.timestamp.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Mode</p>
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-mono', queryInfo.mode === 'sql' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400')}>
                              {queryInfo.mode.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}

              <div className="relative w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="pl-8 pr-8 h-8 text-sm"
                />
                {globalFilter && (
                  <Button variant="ghost" size="sm" onClick={() => setGlobalFilter('')} className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0">
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} className="h-8">
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
              {onSave && (
                <Button variant="outline" size="sm" onClick={onSave} className="h-8">
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>
              )}
            </div>
          </div>
          {tableView}
        </>
      )}
    </div>
  );
}
