import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DataTable } from '../DataTable';
import type { DataPreview } from '@/types/file';

describe('DataTable query details', () => {
  it('opens query details dialog when info button is clicked', async () => {
    const user = userEvent.setup();

    const preview: DataPreview = {
      fileId: 'customers.csv',
      headers: ['name', 'revenue'],
      rows: [{ name: 'Acme', revenue: 1200 }],
      totalRows: 1,
      previewRows: 1
    };

    render(
      <DataTable
        preview={preview}
        queryInfo={{
          query: 'Show customer revenue',
          mode: 'sql',
          timestamp: new Date('2026-01-02T10:30:00Z'),
          executionMs: 42
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: /query details/i }));

    expect(await screen.findByRole('heading', { name: /query information/i })).toBeInTheDocument();
    expect(screen.getByText('Show customer revenue')).toBeInTheDocument();
  });
});
