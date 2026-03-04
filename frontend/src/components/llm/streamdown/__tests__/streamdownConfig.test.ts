import { describe, expect, it } from 'vitest';

import {
  streamdownAnimated,
  streamdownControls,
  streamdownMermaidConfig,
  streamdownPlugins,
  streamdownSharedProps,
} from '../streamdownConfig';

describe('streamdownConfig', () => {
  it('enables code, math, and mermaid plugins', () => {
    expect(streamdownPlugins.code?.name).toBe('shiki');
    expect(streamdownPlugins.math?.name).toBe('katex');
    expect(streamdownPlugins.mermaid?.name).toBe('mermaid');
  });

  it('configures character-level slide-up animation', () => {
    if (typeof streamdownAnimated !== 'object') {
      throw new Error('Expected streamdownAnimated to be an animation object.');
    }

    expect(streamdownAnimated.sep).toBe('char');
    expect(streamdownAnimated.animation).toBe('slideUp');
    expect(streamdownAnimated.duration).toBe(260);
    expect(streamdownAnimated.easing).toBe('ease-out');
  });

  it('enables markdown interaction controls', () => {
    expect(typeof streamdownControls).toBe('object');
    expect((streamdownControls as { table?: boolean }).table).toBe(true);
    expect((streamdownControls as { code?: boolean }).code).toBe(true);
    const mermaidControls = (streamdownControls as { mermaid?: { fullscreen?: boolean; panZoom?: boolean } }).mermaid;
    expect(mermaidControls?.fullscreen).toBe(true);
    expect(mermaidControls?.panZoom).toBe(true);
  });

  it('uses secure mermaid defaults and shared streamdown props', () => {
    expect(streamdownMermaidConfig.securityLevel).toBe('strict');
    expect(streamdownMermaidConfig.theme).toBe('neutral');
    expect(streamdownMermaidConfig.startOnLoad).toBe(false);
    expect(streamdownSharedProps.parseIncompleteMarkdown).toBe(true);
  });
});
