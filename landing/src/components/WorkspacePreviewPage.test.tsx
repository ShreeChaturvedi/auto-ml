import { act } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const demoWorkspaceMock = vi.hoisted(() => vi.fn(() => null));
const enableDemoModeMock = vi.hoisted(() => vi.fn());
const preloadPhaseMock = vi.hoisted(() => vi.fn());

vi.mock('@frontend/demo/landing', () => ({
  DemoWorkspace: (props: { initialPhase?: string; phase?: string }) => {
    demoWorkspaceMock(props);
    return null;
  },
}));

vi.mock('@frontend/lib/demoMode', () => ({
  enableDemoMode: enableDemoModeMock,
}));

vi.mock('@frontend/pages/projectWorkspacePhaseLoaders', () => ({
  preloadProjectWorkspacePhase: preloadPhaseMock,
}));

import WorkspacePreviewPage from './WorkspacePreviewPage';

describe('WorkspacePreviewPage', () => {
  beforeEach(() => {
    demoWorkspaceMock.mockClear();
    enableDemoModeMock.mockClear();
    preloadPhaseMock.mockClear();
    window.history.replaceState({}, '', '/workspace-preview?phase=upload');
  });

  it('updates the preview phase when the parent posts a change message', () => {
    render(<WorkspacePreviewPage />);

    expect(demoWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialPhase: 'upload',
        phase: 'upload',
      }),
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'landing-workspace-preview:set-phase',
            phase: 'deployment',
          },
        }),
      );
    });

    expect(demoWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialPhase: 'upload',
        phase: 'deployment',
      }),
    );
  });
});
