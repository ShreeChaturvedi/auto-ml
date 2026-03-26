import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DataPreview } from '@/types/file';

import { DataTable } from '../DataTable';

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

describe('DataTable virtual scrolling', () => {
  it('renders <table> directly inside the scroll container without an extra overflow wrapper', () => {
    const preview: DataPreview = {
      fileId: 'test.csv',
      headers: ['id', 'value'],
      rows: [{ id: 1, value: 'a' }],
      totalRows: 1,
      previewRows: 1
    };

    render(<DataTable preview={preview} />);

    const tableEl = document.querySelector('table');
    expect(tableEl).toBeTruthy();

    // Walk up from <table> and count ancestors that have the overflow-auto class.
    // With the fix there should be exactly one (tableContainerRef).
    // The old shadcn <Table> wrapper would have inserted a second overflow-auto
    // div immediately above <table>, breaking sticky headers and scroll observation.
    let overflowAutoCount = 0;
    let node: HTMLElement | null = tableEl!.parentElement;
    while (node && node !== document.body) {
      if (node.classList.contains('overflow-auto')) overflowAutoCount++;
      node = node.parentElement;
    }

    expect(overflowAutoCount).toBe(1);
  });

  it('does not render all rows for a large dataset (virtual scrolling is active)', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));
    const preview: DataPreview = {
      fileId: 'large.csv',
      headers: ['id', 'name'],
      rows,
      totalRows: 500,
      previewRows: 500
    };

    render(<DataTable preview={preview} />);

    // The virtualizer only renders a small window of rows into the DOM.
    // data-index is set exclusively on virtual <tr> elements.
    const renderedDataRows = document.querySelectorAll('[data-index]');
    expect(renderedDataRows.length).toBeLessThan(500);
  });

  it('shows the total row count in the status ribbon for a large dataset', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));
    const preview: DataPreview = {
      fileId: 'large.csv',
      headers: ['id', 'name'],
      rows,
      totalRows: 500,
      previewRows: 500
    };

    render(<DataTable preview={preview} />);

    // The status ribbon uses icon + number segments; "500" appears as the loaded row count
    const statusRibbon = document.querySelector('[title="Visible rows"]');
    expect(statusRibbon).toBeInTheDocument();
    expect(statusRibbon!.textContent).toMatch(/500/);
  });

  it('requests more rows when incremental loading reaches the end of the scroll container', () => {
    const onReachEnd = vi.fn();
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));
    const preview: DataPreview = {
      fileId: 'paged.csv',
      headers: ['id', 'name'],
      rows,
      totalRows: 200,
      previewRows: 20
    };

    render(
      <DataTable
        preview={preview}
        incrementalLoad={{
          hasMore: true,
          isLoading: false,
          onReachEnd
        }}
      />
    );

    const scrollContainer = document.querySelector('.overflow-auto') as HTMLDivElement;
    Object.defineProperty(scrollContainer, 'clientHeight', {
      configurable: true,
      value: 240
    });
    Object.defineProperty(scrollContainer, 'scrollHeight', {
      configurable: true,
      value: 800
    });
    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 530
    });

    fireEvent.scroll(scrollContainer);

    expect(onReachEnd).toHaveBeenCalledTimes(1);
  });
});
