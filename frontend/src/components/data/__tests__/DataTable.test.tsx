import { render, screen, within } from '@testing-library/react';
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
      previewRows: 1,
      eda: { numericColumns: [], categoricalColumns: [], dataQuality: [] }
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

  it('uses compact toolbar controls in non-portal mode', () => {
    const preview: DataPreview = {
      fileId: 'customers.csv',
      headers: ['name', 'revenue'],
      rows: [{ name: 'Acme', revenue: 1200 }],
      totalRows: 1,
      previewRows: 1,
      eda: { numericColumns: [], categoricalColumns: [], dataQuality: [] }
    };

    render(
      <DataTable
        preview={preview}
        queryInfo={{
          query: 'Show customer revenue',
          mode: 'sql',
          timestamp: new Date('2026-01-02T10:30:00Z')
        }}
      />
    );

    expect(screen.getByTestId('datatable-compact-controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^search$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /table view/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /analysis view/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  it('keeps portal toolbar transitions stable during search expansion', async () => {
    const user = userEvent.setup();

    const preview: DataPreview = {
      fileId: 'customers.csv',
      headers: ['name', 'revenue'],
      rows: [{ name: 'Acme', revenue: 1200 }],
      totalRows: 1,
      previewRows: 1,
      eda: { numericColumns: [], categoricalColumns: [], dataQuality: [] }
    };

    const portalTarget = document.createElement('div');
    document.body.appendChild(portalTarget);

    render(
      <DataTable
        preview={preview}
        controlsPortalTarget={portalTarget}
      />
    );

    const portal = within(portalTarget);
    const compactControls = portal.getByTestId('datatable-compact-controls');
    const defaultLayer = portal.getByTestId('datatable-controls-default');
    const searchOverlay = portal.getByTestId('datatable-controls-search-overlay');

    expect(compactControls).toHaveClass('overflow-hidden');
    expect(defaultLayer).toHaveClass('transition-opacity');
    expect(defaultLayer.className).not.toContain('transition-all');
    expect(searchOverlay).toHaveClass('transition-opacity');
    expect(searchOverlay.className).not.toContain('translate-y');

    await user.click(portal.getByRole('button', { name: /^search$/i }));

    expect(portal.getByPlaceholderText(/search rows/i)).toBeInTheDocument();
    document.body.removeChild(portalTarget);
  });
});
