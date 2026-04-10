import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronDown, ChevronUp, Crown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  championReport,
  mockModels,
  type ModelFixture,
} from '@/preview/fixtures/experiments';
import styles from './ExperimentsView.module.css';

/* ── Column definitions ───────────────────────────────── */

const columnHelper = createColumnHelper<ModelFixture>();

const fmt = (value: number, digits = 4): string =>
  Number.isFinite(value) ? value.toFixed(digits) : '—';

const fmtSeconds = (ms: number): string => {
  if (!Number.isFinite(ms)) return '—';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
};

const columns = [
  columnHelper.accessor('rank', {
    id: 'rank',
    header: '#',
    cell: (info) => <span className={styles.rank}>{info.getValue()}</span>,
    enableSorting: true,
  }),
  columnHelper.accessor('name', {
    id: 'name',
    header: 'Model',
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className={styles.nameCell}>
          <span className={styles.modelName}>{info.getValue()}</span>
          {row.isChampion && (
            <Crown
              size={12}
              className={styles.championIcon}
              aria-label="champion"
            />
          )}
          <span className={styles.algorithmTag}>{row.algorithm}</span>
        </div>
      );
    },
  }),
  columnHelper.accessor((row) => row.metrics.auc, {
    id: 'auc',
    header: 'AUC',
    cell: (info) => <span className={styles.metricCell}>{fmt(info.getValue())}</span>,
  }),
  columnHelper.accessor((row) => row.metrics.f1, {
    id: 'f1',
    header: 'F1',
    cell: (info) => <span className={styles.metricCell}>{fmt(info.getValue())}</span>,
  }),
  columnHelper.accessor((row) => row.metrics.accuracy, {
    id: 'accuracy',
    header: 'Accuracy',
    cell: (info) => <span className={styles.metricCell}>{fmt(info.getValue())}</span>,
  }),
  columnHelper.accessor((row) => row.metrics.cv_std, {
    id: 'cv_std',
    header: 'CV σ',
    cell: (info) => <span className={styles.metricCellDim}>±{fmt(info.getValue(), 3)}</span>,
  }),
  columnHelper.accessor('trainingMs', {
    id: 'elapsed',
    header: 'Elapsed',
    cell: (info) => <span className={styles.metricCellDim}>{fmtSeconds(info.getValue())}</span>,
  }),
  columnHelper.accessor('status', {
    id: 'status',
    header: 'Status',
    cell: (info) => {
      const value = info.getValue();
      return (
        <span
          className={cn(
            styles.statusPill,
            value === 'completed' ? styles.statusOk : styles.statusFail,
          )}
        >
          {value === 'completed' ? 'SUCCESS' : 'FAILED'}
        </span>
      );
    },
  }),
];

/* ── Main view ────────────────────────────────────────── */

export function ExperimentsView() {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'f1', desc: true },
  ]);

  // Local selection — spec: "Use React state (no zustand for this).
  // Default selected = row 0 (the winner)."
  const initialSelection = useMemo(
    () => mockModels.find((m) => m.isChampion)?.modelId ?? mockModels[0].modelId,
    [],
  );
  const [selectedId, setSelectedId] = useState<string>(initialSelection);

  const table = useReactTable({
    data: mockModels,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const activeModel: ModelFixture =
    mockModels.find((m) => m.modelId === selectedId) ?? mockModels[0];

  return (
    <div className={styles.root}>
      {/* ── Leaderboard ─────────────────────────────────── */}
      <section className={styles.leaderboardPane} aria-label="Model leaderboard">
        <header className={styles.paneHeader}>
          <p className={styles.eyebrow}>4 MODELS · SORTED BY F1</p>
          <p className={styles.paneSubtitle}>
            Trained in parallel during the Train phase. Click a row to inspect.
          </p>
        </header>

        <div className={styles.tableWrap}>
          <table className={styles.table} role="grid">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={cn(canSort && styles.sortable)}
                        onClick={
                          canSort
                            ? header.column.getToggleSortingHandler()
                            : undefined
                        }
                        aria-sort={
                          sortDir === 'asc'
                            ? 'ascending'
                            : sortDir === 'desc'
                              ? 'descending'
                              : 'none'
                        }
                      >
                        <span className={styles.thInner}>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sortDir === 'asc' && <ChevronUp size={11} />}
                          {sortDir === 'desc' && <ChevronDown size={11} />}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const isSelected = row.original.modelId === selectedId;
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      styles.row,
                      isSelected && styles.rowSelected,
                    )}
                    onClick={() => setSelectedId(row.original.modelId)}
                    aria-selected={isSelected}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── AI report pane ─────────────────────────────── */}
        <section className={styles.reportPane} aria-label="AI report">
          <div className={styles.reportHeader}>
            <Sparkles size={12} />
            <span>AI REPORT — {championReport.modelName}</span>
          </div>
          {championReport.paragraphs.map((p, i) => (
            <p key={i} className={styles.reportParagraph}>
              {p}
            </p>
          ))}
        </section>
      </section>

      {/* ── Detail drawer ────────────────────────────────── */}
      <aside className={styles.detailDrawer} aria-label="Model detail">
        <header className={styles.drawerHeader}>
          <div className={styles.drawerTitleRow}>
            <h3 className={styles.drawerTitle}>{activeModel.name}</h3>
            {activeModel.isChampion && (
              <span className={styles.championBadge}>CHAMPION</span>
            )}
          </div>
          <p className={styles.drawerSubtitle}>
            {activeModel.algorithm} · {activeModel.library} ·{' '}
            {fmtSeconds(activeModel.trainingMs)}
          </p>
        </header>

        <div className={styles.metricsGrid}>
          <Metric label="AUC" value={fmt(activeModel.metrics.auc, 3)} />
          <Metric label="F1" value={fmt(activeModel.metrics.f1, 3)} />
          <Metric label="Accuracy" value={fmt(activeModel.metrics.accuracy, 3)} />
          <Metric label="Precision" value={fmt(activeModel.metrics.precision, 3)} />
          <Metric label="Recall" value={fmt(activeModel.metrics.recall, 3)} />
          <Metric label="CV σ" value={`±${fmt(activeModel.metrics.cv_std, 3)}`} />
        </div>

        <section className={styles.drawerSection}>
          <h4 className={styles.drawerSectionTitle}>FEATURE IMPORTANCE</h4>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={activeModel.featureImportances}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.05)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 10, fill: 'var(--text-dim)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="feature"
                  width={130}
                  tick={{
                    fontSize: 10,
                    fill: 'var(--text-muted)',
                    fontFamily: 'Geist Mono Variable, monospace',
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{
                    background: 'var(--surface-1)',
                    border: '0.8px solid var(--border-strong)',
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  formatter={(value: number) => [value.toFixed(2), 'importance']}
                />
                <Bar
                  dataKey="importance"
                  fill="rgba(247,248,248,0.72)"
                  radius={[0, 2, 2, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className={styles.drawerSection}>
          <h4 className={styles.drawerSectionTitle}>
            ROC CURVE · AUC {fmt(activeModel.metrics.auc, 3)}
          </h4>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart
                data={activeModel.rocCurve}
                margin={{ top: 4, right: 8, bottom: 4, left: 4 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="fpr"
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 9, fill: 'var(--text-dim)' }}
                  axisLine={false}
                  tickLine={false}
                  ticks={[0, 0.5, 1]}
                />
                <YAxis
                  dataKey="tpr"
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 9, fill: 'var(--text-dim)' }}
                  axisLine={false}
                  tickLine={false}
                  ticks={[0, 0.5, 1]}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-1)',
                    border: '0.8px solid var(--border-strong)',
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  formatter={(value: number, key: string) => [
                    value.toFixed(3),
                    key.toUpperCase(),
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="tpr"
                  stroke="rgba(247,248,248,0.88)"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className={styles.drawerSection}>
          <h4 className={styles.drawerSectionTitle}>HYPERPARAMETERS</h4>
          <dl className={styles.paramList}>
            {Object.entries(activeModel.parameters).map(([key, value]) => (
              <div key={key} className={styles.paramRow}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
    </div>
  );
}
