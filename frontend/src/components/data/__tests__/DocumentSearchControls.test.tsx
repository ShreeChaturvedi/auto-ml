import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, within, fireEvent } from '@testing-library/react';
import { DocumentSearchControls } from '../DocumentSearchControls';

describe('DocumentSearchControls', () => {
  let portalTarget: HTMLDivElement;

  beforeEach(() => {
    portalTarget = document.createElement('div');
    document.body.appendChild(portalTarget);
  });

  afterEach(() => {
    document.body.removeChild(portalTarget);
  });

  function renderControls(overrides = {}) {
    const props = {
      searchQuery: '',
      onSearchQueryChange: vi.fn(),
      searchExpanded: false,
      onSearchExpandedChange: vi.fn(),
      matchCount: 0,
      onDownload: vi.fn(),
      downloadDisabled: false,
      controlsPortalTarget: portalTarget,
      ...overrides,
    };
    render(<DocumentSearchControls {...props} />);
    return { portal: within(portalTarget), ...props };
  }

  it('renders into portal target', () => {
    renderControls();
    expect(portalTarget.querySelector('button')).not.toBeNull();
  });

  it('search icon click expands search overlay', () => {
    const { portal, onSearchExpandedChange } = renderControls();
    const searchBtn = portal.getByRole('button', { name: 'Search' });
    fireEvent.click(searchBtn);
    expect(onSearchExpandedChange).toHaveBeenCalledWith(true);
  });

  it('escape key collapses search', () => {
    const { portal, onSearchExpandedChange } = renderControls({ searchExpanded: true });
    const input = portal.getByPlaceholderText('Search document...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSearchExpandedChange).toHaveBeenCalledWith(false);
  });

  it('match counter shows correct singular format', () => {
    const { portal } = renderControls({
      searchExpanded: true,
      searchQuery: 'test',
      matchCount: 1,
    });
    expect(portal.getByText('1 match')).toBeTruthy();
  });

  it('match counter shows correct plural format', () => {
    const { portal } = renderControls({
      searchExpanded: true,
      searchQuery: 'test',
      matchCount: 5,
    });
    expect(portal.getByText('5 matches')).toBeTruthy();
  });

  it('download button present and fires callback', () => {
    const { portal, onDownload } = renderControls();
    const downloadBtn = portal.getByRole('button', { name: 'Download' });
    fireEvent.click(downloadBtn);
    expect(onDownload).toHaveBeenCalled();
  });

  it('download button disabled when downloadDisabled is true', () => {
    const { portal } = renderControls({ downloadDisabled: true });
    const downloadBtn = portal.getByRole('button', { name: 'Download' });
    expect(downloadBtn).toHaveProperty('disabled', true);
  });

  it('hides download button when onDownload is not provided', () => {
    const { portal } = renderControls({ onDownload: undefined });
    expect(portal.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('shows amber color on zero-match counter', () => {
    renderControls({
      searchExpanded: true,
      searchQuery: 'xyz',
      matchCount: 0,
    });
    const counter = portalTarget.querySelector('.tabular-nums');
    expect(counter?.textContent).toBe('0 matches');
    expect(counter?.className).toContain('text-amber-');
  });

  it('shows muted color on positive match counter', () => {
    renderControls({
      searchExpanded: true,
      searchQuery: 'test',
      matchCount: 3,
    });
    const counter = portalTarget.querySelector('.tabular-nums');
    expect(counter?.textContent).toBe('3 matches');
    expect(counter?.className).toContain('text-muted-foreground');
  });
});
