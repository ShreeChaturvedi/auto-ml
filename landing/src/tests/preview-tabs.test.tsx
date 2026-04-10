import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewShell } from '@/preview/PreviewShell';
import { usePreviewStore } from '@/preview/previewStore';

describe('PreviewShell tab navigation', () => {
  beforeEach(() => {
    usePreviewStore.setState(usePreviewStore.getInitialState());
  });

  it('renders the Data Viewer tab by default', () => {
    render(<PreviewShell />);
    // Data Viewer shows the mock English query in the query panel
    expect(screen.getByText(/which customers churned in Q2/i)).toBeInTheDocument();
  });

  it('switches to Experiments when that sidebar button is clicked', () => {
    render(<PreviewShell />);
    const expButton = screen.getByRole('tab', { name: /experiments/i });
    fireEvent.click(expButton);
    expect(screen.getByText(/4 MODELS · SORTED BY F1/i)).toBeInTheDocument();
  });

  it('Deployment sub-tab navigation works', () => {
    usePreviewStore.getState().setActiveTab('deployment');
    render(<PreviewShell />);
    const logsTab = screen.getByRole('tab', { name: /logs/i });
    fireEvent.click(logsTab);
    // Logs panel renders the deployment logs
    expect(screen.getByRole('log')).toBeInTheDocument();
  });
});
