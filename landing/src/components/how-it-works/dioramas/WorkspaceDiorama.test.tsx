import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WORKSPACE_PREVIEW_READY_MESSAGE_TYPE } from '@/lib/workspacePreviewMessaging';
import { WorkspaceDiorama } from './WorkspaceDiorama';

describe('WorkspaceDiorama', () => {
  it('keeps how-it-works pinned mode on a single iframe preview', () => {
    const { container } = render(
      <WorkspaceDiorama
        label="1.0 INGEST — real workspace preview"
        phase="upload"
        preloadAll
      />,
    );

    expect(container.querySelectorAll('iframe')).toHaveLength(1);
    expect(container.querySelector('iframe')).toHaveAttribute(
      'src',
      '/workspace-preview?phase=upload',
    );
  });

  it('posts a phase-change message into the existing iframe after it is ready', () => {
    const { container, rerender } = render(
      <WorkspaceDiorama
        label="1.0 INGEST — real workspace preview"
        phase="upload"
        preloadAll
      />,
    );

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const postMessage = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: iframe.contentWindow as MessageEventSource,
          data: { type: WORKSPACE_PREVIEW_READY_MESSAGE_TYPE },
        }),
      );
    });

    rerender(
      <WorkspaceDiorama
        label="1.0 INGEST — real workspace preview"
        phase="experiments"
        preloadAll
      />,
    );

    expect(container.querySelectorAll('iframe')).toHaveLength(1);
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'landing-workspace-preview:set-phase',
        phase: 'experiments',
      },
      '*',
    );
  });
});
