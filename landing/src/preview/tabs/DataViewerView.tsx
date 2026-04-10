import { lazy, Suspense } from 'react';
import { FileText, FileCode, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePreviewStore } from '@/preview/previewStore';
import {
  mockFileTabs,
  mockCustomersColumns,
  mockCustomersRows,
  mockSqlResultRows,
} from '@/preview/fixtures/query';
import styles from './DataViewerView.module.css';

const PdfViewer = lazy(() => import('@frontend/components/data/PdfViewer'));

const ICONS = {
  csv: FileSpreadsheet,
  sql: FileCode,
  pdf: FileText,
} as const;

export function DataViewerView() {
  const activeFileTabId = usePreviewStore((s) => s.dataViewer.activeFileTabId);
  const setFileTab = usePreviewStore((s) => s.setDataViewerFileTab);
  const query = usePreviewStore((s) => s.dataViewer.queryResult);

  const rows = activeFileTabId === 'sql_q2_churn' ? mockSqlResultRows : mockCustomersRows;
  const showPdf = activeFileTabId === 'pdf_business_context';

  return (
    <div className={styles.root}>
      <div className={styles.fileTabs} role="tablist" aria-label="Open files">
        {mockFileTabs.map((tab) => {
          const Icon = ICONS[tab.type];
          const isActive = activeFileTabId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={cn(styles.fileTab, isActive && styles.fileTabActive)}
              onClick={() => setFileTab(tab.id)}
            >
              <Icon size={12} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.body}>
        <div className={styles.mainPanel}>
          {showPdf ? (
            <Suspense
              fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
                  Loading PDF…
                </div>
              }
            >
              <PdfViewer url="/assets/novacraft_business_context.pdf" fileName="novacraft_business_context.pdf" />
            </Suspense>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  {mockCustomersColumns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.customer_id}</td>
                    <td>{row.company_name}</td>
                    <td>{row.industry}</td>
                    <td>{row.plan_tier}</td>
                    <td>${row.annual_revenue.toLocaleString()}</td>
                    <td>{row.is_active ? 'true' : 'false'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className={styles.queryPanel}>
          <div className={styles.queryLabel}>English query</div>
          <p className={styles.queryEnglish}>{query.english}</p>
          <hr className={styles.querySeparator} />
          <pre className={styles.querySql}>{query.sql}</pre>
          <div className={styles.queryResult}>
            → {query.rowCount.toLocaleString()} rows returned · {(query.durationMs / 1000).toFixed(2)}s
          </div>
        </aside>
      </div>
    </div>
  );
}
