/**
 * DataViewerView — interactive Data Viewer tab clone for the landing preview.
 *
 * Rebuilt to match the real frontend `DataViewerTab` (see
 * `frontend/src/components/data/DataViewerTab.tsx`) so the first thing a
 * visitor sees looks indistinguishable from the shipping product:
 *
 *   • Real TanStack Table v8 grid (headless, sortable, memoized columns)
 *   • FileTabBar with per-file icons + active underline (violet accent)
 *   • Right-side QueryPanel in English-mode completed state (English + SQL
 *     + duration/row count) per spec §5.6
 *   • PDF tab mounts the real `<PdfViewer>` from frontend/ via React.lazy
 *
 * Per spec §5.5 we do NOT import the real phase panel — only leaf
 * components. Everything else is reconstructed locally to keep the
 * landing bundle lean and isolated from the frontend's data stores.
 */

import { lazy, Suspense, useMemo, useState } from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Database,
  Eye,
  FileSpreadsheet,
  FileText,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePreviewStore } from '@/preview/previewStore';
import {
  type ColumnType,
  type DataViewerFileTab,
  type FileTabType,
  type MockColumn,
  type MockDataset,
  datasetsByTabId,
  mockFileTabs,
} from '@/preview/fixtures/query';
import styles from './DataViewerView.module.css';

// Lazy-load the real frontend PdfViewer so react-pdf only lands in the
// chunk when the PDF tab is actually opened.
const PdfViewer = lazy(() => import('@frontend/components/data/PdfViewer'));

// --- Cell formatting --------------------------------------------------------

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const NUMBER = new Intl.NumberFormat('en-US');

function formatCell(value: unknown, type: ColumnType): React.ReactNode {
  if (value == null || value === '') {
    return <span className={styles.cellNull}>—</span>;
  }
  switch (type) {
    case 'currency':
      return (
        <span className={styles.cellNumeric}>
          {CURRENCY.format(Number(value))}
        </span>
      );
    case 'number':
      return (
        <span className={styles.cellNumeric}>{NUMBER.format(Number(value))}</span>
      );
    case 'boolean': {
      const bool = Boolean(value);
      return (
        <span className={styles.cellBoolean}>
          <span
            className={cn(
              styles.cellBooleanDot,
              bool ? styles.cellBooleanDotTrue : styles.cellBooleanDotFalse,
            )}
            aria-hidden="true"
          />
          <span className={styles.cellBooleanLabel}>{bool ? 'true' : 'false'}</span>
        </span>
      );
    }
    case 'date':
      return <span className={styles.cellMono}>{String(value)}</span>;
    default:
      return <span className={styles.cellText}>{String(value)}</span>;
  }
}

const TYPE_CHIP_LABEL: Record<ColumnType, string> = {
  string: 'str',
  number: 'num',
  currency: 'usd',
  boolean: 'bool',
  date: 'date',
};

// --- File tab icons ---------------------------------------------------------

const FILE_TAB_ICON: Record<FileTabType, typeof FileText> = {
  csv: FileSpreadsheet,
  sql: Database,
  pdf: FileText,
};

// --- TanStack Table column factory ------------------------------------------

type Row = Record<string, unknown>;

function buildColumns(columns: MockColumn[]): ColumnDef<Row>[] {
  return columns.map((col) => ({
    id: col.key,
    accessorKey: col.key,
    header: col.label,
    cell: (info) => formatCell(info.getValue(), col.type),
    meta: { type: col.type },
  }));
}

function isNumericType(type: ColumnType): boolean {
  return type === 'number' || type === 'currency';
}

// --- Data grid --------------------------------------------------------------

interface DataGridProps {
  dataset: MockDataset;
}

function DataGrid({ dataset }: DataGridProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(() => buildColumns(dataset.columns), [dataset.columns]);
  const columnTypes = useMemo(
    () => Object.fromEntries(dataset.columns.map((c) => [c.key, c.type] as const)),
    [dataset.columns],
  );

  const table = useReactTable<Row>({
    data: dataset.rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const loadedRows = dataset.rows.length;

  return (
    <div className={styles.gridRoot}>
      <div className={styles.gridScroll}>
        <table className={styles.grid} role="table">
          <thead className={styles.gridHead}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const type = columnTypes[header.column.id] ?? 'string';
                  const sortDir = header.column.getIsSorted();
                  const numeric = isNumericType(type);
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        styles.gridTh,
                        numeric && styles.gridThNumeric,
                      )}
                      scope="col"
                      aria-sort={
                        sortDir === 'asc'
                          ? 'ascending'
                          : sortDir === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                    >
                      <button
                        type="button"
                        className={styles.gridThButton}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span className={styles.gridThLabel}>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </span>
                        <span className={styles.gridThType}>
                          {TYPE_CHIP_LABEL[type]}
                        </span>
                        <span className={styles.gridThSort} aria-hidden="true">
                          {sortDir === 'asc' ? (
                            <ArrowUp size={11} />
                          ) : sortDir === 'desc' ? (
                            <ArrowDown size={11} />
                          ) : (
                            <ArrowUpDown size={11} className={styles.gridThSortIdle} />
                          )}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                className={cn(
                  styles.gridTr,
                  i % 2 === 1 && styles.gridTrStripe,
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const type = columnTypes[cell.column.id] ?? 'string';
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        styles.gridTd,
                        isNumericType(type) && styles.gridTdNumeric,
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status ribbon, mirroring the real DataTable footer. */}
      <div className={styles.gridStatus}>
        <span className={styles.gridStatusItem}>
          <Eye size={12} aria-hidden="true" />
          1–{loadedRows}
          <span className={styles.gridStatusDim}>/</span>
          {loadedRows.toLocaleString()} loaded rows
        </span>
        <span className={styles.gridStatusDot} aria-hidden="true">·</span>
        <span className={styles.gridStatusItem}>
          <Database size={12} aria-hidden="true" />
          {dataset.totalRows.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// --- File tab strip ---------------------------------------------------------

interface FileTabStripProps {
  tabs: DataViewerFileTab[];
  activeId: string;
  onSelect: (id: string) => void;
}

function FileTabStrip({ tabs, activeId, onSelect }: FileTabStripProps) {
  return (
    <div className={styles.fileTabs} role="tablist" aria-label="Open files">
      {tabs.map((tab) => {
        const Icon = FILE_TAB_ICON[tab.type];
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={cn(styles.fileTab, isActive && styles.fileTabActive)}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(tab.id);
              }
            }}
          >
            <Icon
              size={14}
              className={cn(
                styles.fileTabIcon,
                tab.type === 'sql' && styles.fileTabIconAccent,
              )}
              aria-hidden="true"
            />
            <span className={styles.fileTabLabel} title={tab.label}>
              {tab.label}
            </span>
            <button
              type="button"
              className={styles.fileTabClose}
              aria-label={`Close ${tab.label}`}
              tabIndex={-1}
              onClick={(e) => {
                // Close is visual-only in the demo per the spec. Stop the
                // click so it doesn't also activate the tab.
                e.stopPropagation();
              }}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// --- Query panel (right rail) ----------------------------------------------

interface QueryPanelProps {
  english: string;
  sql: string;
  rowCount: number;
  durationMs: number;
}

function QueryPanel({ english, sql, rowCount, durationMs }: QueryPanelProps) {
  return (
    <aside className={styles.queryPanel} aria-label="Query panel">
      <div className={styles.queryPanelHeader}>
        <span className={styles.queryPanelEyebrow}>QUERY · ENGLISH</span>
        <span className={styles.queryPanelBadge}>completed</span>
      </div>
      <div className={styles.queryPanelSection}>
        <div className={styles.queryPanelLabel}>English query</div>
        <p className={styles.queryPanelEnglish}>{english}</p>
      </div>
      <div className={styles.queryPanelDivider} />
      <div className={styles.queryPanelSection}>
        <div className={styles.queryPanelLabel}>Generated SQL</div>
        <pre className={styles.queryPanelSql}>
          <code>{sql}</code>
        </pre>
      </div>
      <div className={styles.queryPanelDivider} />
      <div className={styles.queryPanelResult}>
        <span className={styles.queryPanelArrow}>→</span>
        <span className={styles.queryPanelResultText}>
          {rowCount.toLocaleString()} rows returned
        </span>
        <span className={styles.queryPanelDot}>·</span>
        <span className={styles.queryPanelResultDuration}>
          {(durationMs / 1000).toFixed(2)}s
        </span>
      </div>
    </aside>
  );
}

// --- Root view --------------------------------------------------------------

export function DataViewerView() {
  const activeFileTabId = usePreviewStore((s) => s.dataViewer.activeFileTabId);
  const setFileTab = usePreviewStore((s) => s.setDataViewerFileTab);
  const query = usePreviewStore((s) => s.dataViewer.queryResult);

  const activeTab = mockFileTabs.find((t) => t.id === activeFileTabId) ?? mockFileTabs[0];
  const dataset = datasetsByTabId[activeFileTabId];

  return (
    <div className={styles.root}>
      <FileTabStrip
        tabs={mockFileTabs}
        activeId={activeFileTabId}
        onSelect={setFileTab}
      />

      <div className={styles.body}>
        <div className={styles.mainPanel}>
          {activeTab.type === 'pdf' ? (
            <Suspense
              fallback={
                <div className={styles.pdfFallback}>Loading PDF…</div>
              }
            >
              <PdfViewer
                url="/assets/novacraft_business_context.pdf"
                fileName="novacraft_business_context.pdf"
              />
            </Suspense>
          ) : dataset ? (
            <DataGrid dataset={dataset} />
          ) : (
            <div className={styles.pdfFallback}>No dataset available.</div>
          )}
        </div>

        <QueryPanel
          english={query.english}
          sql={query.sql}
          rowCount={query.rowCount}
          durationMs={query.durationMs}
        />
      </div>
    </div>
  );
}
