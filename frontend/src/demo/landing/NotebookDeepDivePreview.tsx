import { NotebookCellComponent } from '@/components/notebook/NotebookCell';

import type { NotebookCell } from '@/types/notebook';

const NOW = '2026-04-13T15:30:00.000Z';
const NOTEBOOK_ID = 'landing-standalone-notebook';
const PROJECT_ID = 'landing-demo-project';

const DESCRIBE_TABLE = {
  columns: ['stat', 'mrr_usd', 'avg_session_minutes', 'api_calls'],
  rows: [
    { stat: 'count', mrr_usd: '2,530', avg_session_minutes: '2,280', api_calls: '2,530' },
    { stat: 'mean', mrr_usd: '2,142', avg_session_minutes: '18.4', api_calls: '12,004' },
    { stat: 'std', mrr_usd: '1,854', avg_session_minutes: '12.7', api_calls: '28,312' },
    { stat: 'min', mrr_usd: '0', avg_session_minutes: '0.3', api_calls: '0' },
    { stat: '50%', mrr_usd: '1,620', avg_session_minutes: '15.2', api_calls: '3,412' },
    { stat: 'max', mrr_usd: '24,180', avg_session_minutes: '84.1', api_calls: '892,448' },
  ],
};

const CELLS: NotebookCell[] = [
  {
    cellId: 'landing-notebook-cell-1',
    notebookId: NOTEBOOK_ID,
    cellType: 'code',
    content: [
      'import pandas as pd',
      '',
      "df = pd.read_csv('customers.csv')",
      '',
      "summary = df[['mrr_usd', 'avg_session_minutes', 'api_calls']].describe()",
      'summary',
    ].join('\n'),
    position: 0,
    metadata: {},
    executionCount: 1,
    executionOrder: 1,
    executionStatus: 'success',
    executionDurationMs: 210,
    executedAt: NOW,
    isDirty: false,
    output: [
      {
        type: 'table',
        content: 'describe() summary',
        data: DESCRIBE_TABLE,
      },
    ],
    outputRefs: [],
    lockedBy: null,
    lockedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    cellId: 'landing-notebook-cell-2',
    notebookId: NOTEBOOK_ID,
    cellType: 'code',
    content: [
      "top_segments = df.groupby('account_tier')['mrr_usd'].mean().sort_values(ascending=False)",
      'top_segments.head(3)',
    ].join('\n'),
    position: 1,
    metadata: {},
    executionCount: 1,
    executionOrder: 2,
    executionStatus: 'success',
    executionDurationMs: 96,
    executedAt: NOW,
    isDirty: false,
    output: [
      {
        type: 'text',
        content: [
          'account_tier',
          'enterprise    8420.3',
          'pro           2311.8',
          'starter        284.6',
        ].join('\n'),
      },
    ],
    outputRefs: [],
    lockedBy: null,
    lockedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const NOOP = () => {};

export function NotebookDeepDivePreview() {
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto bg-background p-4">
      {CELLS.map((cell, index) => (
        <NotebookCellComponent
          key={cell.cellId}
          cell={cell}
          isLocked={false}
          lockOwner={null}
          projectId={PROJECT_ID}
          onContentChange={NOOP}
          onDelete={NOOP}
          onRun={NOOP}
          onInterrupt={NOOP}
          onMoveUp={NOOP}
          onMoveDown={NOOP}
          canMoveUp={index > 0}
          canMoveDown={index < CELLS.length - 1}
        />
      ))}
    </div>
  );
}
