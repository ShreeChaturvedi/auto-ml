import type { NotebookCellFixture, NotebookOutputFixture } from '@/preview/fixtures/notebooks';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import styles from '@/preview/tabs/AgenticShell.module.css';

function RenderOutput({ out }: { out: NotebookOutputFixture }) {
  if (out.type === 'text') {
    return <div className={styles.notebookCellOutput}>{out.text}</div>;
  }
  if (out.type === 'table') {
    return (
      <div className={styles.notebookCellOutput} style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {out.columns.map((c) => (
                <th key={c} style={{ textAlign: 'left', padding: '8px 16px', color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', borderBottom: '0.8px solid var(--border)' }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {out.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '8px 16px', color: 'var(--text)', borderBottom: '0.8px solid var(--border)' }}>
                    {typeof cell === 'number' ? cell.toLocaleString() : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (out.type === 'chart') {
    return (
      <div className={styles.notebookCellOutput} style={{ height: 220, padding: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={out.data} layout="vertical" margin={{ left: 40 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={140} />
            <Bar dataKey="value" fill="#F7F8F8" radius={[0, 2, 2, 0]} />
            <RTooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: 'var(--surface-2)', border: '0.8px solid var(--border)', fontSize: 11 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return null;
}

export function NotebookColumn({ cells }: { cells: NotebookCellFixture[] }) {
  return (
    <div className={styles.notebookColumn}>
      {cells.map((cell) => (
        <div key={cell.id} className={styles.notebookCell}>
          {cell.kind === 'markdown' && (
            <div className={styles.notebookCellMarkdown}>
              <h3>{cell.source.replace(/^##\s*/, '')}</h3>
            </div>
          )}
          {cell.kind === 'code' && (
            <>
              <pre className={styles.notebookCellCode}>{cell.source}</pre>
              {cell.outputs?.map((out, i) => <RenderOutput key={i} out={out} />)}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
