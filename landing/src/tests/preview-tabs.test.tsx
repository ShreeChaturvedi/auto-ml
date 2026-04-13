import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DemoWorkspace, resetLandingDemoState } from '@frontend/demo/landing';

describe('DemoWorkspace navigation', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetLandingDemoState();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the training surface through the real app shell', async () => {
    render(<DemoWorkspace initialPhase="training" />);
    expect(await screen.findByText(/training in progress/i)).toBeInTheDocument();
    expect(screen.getAllByText(/NovaForest Classifier/i).length).toBeGreaterThan(0);
  });

  it('navigates between phases without issuing backend fetches', async () => {
    render(<DemoWorkspace initialPhase="data-viewer" />);

    expect(await screen.findByText(/column overview/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('workflow-phase-button-feature-engineering'));
    expect(await screen.findByText(/Build Enabled Features/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('workflow-phase-button-experiments'));
    expect(await screen.findByText(/NovaForest Classifier/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
