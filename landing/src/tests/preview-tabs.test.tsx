import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewShell } from '@/preview/PreviewShell';
import { usePreviewStore } from '@/preview/previewStore';

describe('PreviewShell tab navigation', () => {
  beforeEach(() => {
    usePreviewStore.setState(usePreviewStore.getInitialState());
  });

  it('renders the Data Viewer tab by default', async () => {
    render(<PreviewShell />);
    // Data Viewer shows the mock English query in the query panel.
    // Views are lazy-loaded via React.lazy, so await resolution.
    expect(
      await screen.findByText(/which customers churned in Q2/i),
    ).toBeInTheDocument();
  });

  it('switches to Experiments when that sidebar button is clicked', async () => {
    render(<PreviewShell />);
    const expButton = screen.getByRole('tab', { name: /experiments/i });
    fireEvent.click(expButton);
    expect(
      await screen.findByText(/4 MODELS · SORTED BY F1/i),
    ).toBeInTheDocument();
  });

  it('Deployment sub-tab navigation works', async () => {
    usePreviewStore.getState().setActiveTab('deployment');
    render(<PreviewShell />);
    const logsTab = await screen.findByRole('tab', { name: /logs/i });
    fireEvent.click(logsTab);
    // Logs panel renders the deployment logs
    expect(screen.getByRole('log')).toBeInTheDocument();
  });
});
