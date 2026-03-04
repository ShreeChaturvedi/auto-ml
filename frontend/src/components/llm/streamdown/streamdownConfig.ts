import { createCodePlugin } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { createMermaidPlugin } from '@streamdown/mermaid';
import type { PluginConfig, StreamdownProps } from 'streamdown';

const streamdownMermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'neutral',
} as const;

const streamdownControls: NonNullable<StreamdownProps['controls']> = {
  table: true,
  code: true,
  mermaid: {
    copy: true,
    download: true,
    fullscreen: true,
    panZoom: true,
  },
};

const streamdownPlugins: PluginConfig = {
  code: createCodePlugin({
    themes: ['github-light', 'github-dark'],
  }),
  math: createMathPlugin({
    singleDollarTextMath: true,
  }),
  mermaid: createMermaidPlugin({
    config: streamdownMermaidConfig,
  }),
};

const streamdownAnimated: NonNullable<StreamdownProps['animated']> = {
  animation: 'slideUp',
  sep: 'char',
  duration: 260,
  easing: 'ease-out',
};

export { streamdownAnimated, streamdownControls, streamdownMermaidConfig, streamdownPlugins };
