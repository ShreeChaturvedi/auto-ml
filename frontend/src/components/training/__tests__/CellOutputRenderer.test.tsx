import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CellOutputRenderer } from '../CellOutputRenderer';
import { buildOutputCopyText } from '../cellOutputUtils';

describe('CellOutputRenderer', () => {
  it('renders multiple outputs without per-output action controls', () => {
    render(
      <CellOutputRenderer
        outputs={[
          {
            type: 'text',
            content: 'first line',
          },
          {
            type: 'text',
            content: 'second line',
          },
        ]}
      />
    );

    expect(screen.getByText('first line')).toBeInTheDocument();
    expect(screen.getByText('second line')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy output/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expand output/i })).not.toBeInTheDocument();
  });

  it('builds copy text for mixed outputs and table data', () => {
    const outputText = buildOutputCopyText([
      {
        type: 'text',
        content: 'header',
      },
      {
        type: 'table',
        content: 'DataFrame: 2 rows x 2 columns',
        data: {
          columns: ['name', 'score'],
          rows: [
            { name: 'alpha', score: 1.23456 },
            { name: 'beta', score: true },
          ],
        },
      },
      {
        type: 'text',
        content: 'footer',
      },
    ]);

    expect(outputText).toBe(
      [
        'header',
        'name\tscore',
        'alpha\t1.2346',
        'beta\tTrue',
        'footer',
      ].join('\n')
    );
  });

  it('falls back to plain content for malformed table data', () => {
    const outputText = buildOutputCopyText([
      {
        type: 'table',
        content: 'fallback table content',
        data: {
          columns: ['name'],
          rows: 'not-an-array',
        } as unknown as {
          columns: string[];
          rows: Record<string, unknown>[];
        },
      },
    ]);

    expect(outputText).toBe('fallback table content');
  });
});
