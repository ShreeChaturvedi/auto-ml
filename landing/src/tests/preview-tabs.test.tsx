import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DemoWorkspace, resetLandingDemoState } from '@frontend/demo/landing';
import { useProjectStore } from '@frontend/stores/projectStore';
import { useDataStore } from '@frontend/stores/dataStore';

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

  it('overrides stale persisted explorer tabs with the seeded demo file view', async () => {
    window.localStorage.setItem(
      'automl-data-viewer-tabs-v1',
      JSON.stringify({
        state: {
          openFileTabs: [{ id: 'artifact-stale', type: 'artifact' }],
          activeFileTabId: 'artifact-stale',
          fileTabType: 'artifact',
        },
        version: 1,
      }),
    );

    resetLandingDemoState();
    render(<DemoWorkspace initialPhase="data-viewer" />);

    expect(await screen.findByTestId('workflow-phase-button-data-viewer')).toBeInTheDocument();
    await waitFor(() => {
      expect(useDataStore.getState().fileTabType).toBe('file');
      expect(useDataStore.getState().activeFileTabId).toBe('landing-demo-file');
    });
  });

  it('defaults the landing demo to the data upload phase', async () => {
    render(<DemoWorkspace />);

    expect(await screen.findByTestId('workflow-phase-button-upload')).toBeInTheDocument();
    await waitFor(() => {
      expect(useProjectStore.getState().getActiveProject()?.currentPhase).toBe('upload');
    });
  });

  it('renders the training surface through the real app shell', async () => {
    render(<DemoWorkspace initialPhase="training" />);
    expect(await screen.findByText(/NovaCraft Growth/i)).toBeInTheDocument();
    expect(screen.getByTestId('workflow-phase-button-training')).toBeInTheDocument();
    await waitFor(() => {
      expect(useProjectStore.getState().getActiveProject()?.currentPhase).toBe('training');
    });
  });

  it('does not stall feature engineering on notebook preparation in demo mode', async () => {
    render(<DemoWorkspace initialPhase="feature-engineering" />);

    expect(await screen.findByTestId('workflow-phase-button-feature-engineering')).toBeInTheDocument();
    await waitFor(() => {
      expect(useProjectStore.getState().getActiveProject()?.currentPhase).toBe('feature-engineering');
      expect(screen.queryByText(/Preparing feature notebook/i)).not.toBeInTheDocument();
    });
  });

  it('does not stall training on notebook preparation in demo mode', async () => {
    render(<DemoWorkspace initialPhase="training" />);

    expect(await screen.findByTestId('workflow-phase-button-training')).toBeInTheDocument();
    await waitFor(() => {
      expect(useProjectStore.getState().getActiveProject()?.currentPhase).toBe('training');
      expect(screen.queryByText(/Preparing training notebook/i)).not.toBeInTheDocument();
    });
  });

  it('renders the landing demo as an inert preview shell', async () => {
    render(<DemoWorkspace initialPhase="data-viewer" />);

    const demoRoot = await screen.findByTestId('landing-demo-workspace');
    expect(demoRoot).toHaveStyle({ pointerEvents: 'none' });
    expect(await screen.findByTestId('workflow-phase-button-data-viewer')).toBeInTheDocument();
    await waitFor(() => {
      expect(useProjectStore.getState().getActiveProject()?.currentPhase).toBe('data-viewer');
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
