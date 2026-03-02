import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CellOutputRenderer } from '../CellOutputRenderer';

describe('CellOutputRenderer', () => {
  it('starts long text output in collapsed mode and allows expansion', () => {
    const longOutput = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n');

    render(
      <CellOutputRenderer
        outputs={[
          {
            type: 'text',
            content: longOutput,
          },
        ]}
      />
    );

    expect(screen.queryByText('line 12')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand output' }));

    expect(screen.getByText(/line 12/)).toBeInTheDocument();
  });

  it('copies table output as tab-separated text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <CellOutputRenderer
        outputs={[
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
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy output' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('name\tscore\nalpha\t1.2346\nbeta\tTrue');
    });
  });
});
