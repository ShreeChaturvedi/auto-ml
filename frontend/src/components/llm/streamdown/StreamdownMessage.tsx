import { Streamdown } from 'streamdown';

import { cn } from '@/lib/utils';

import {
  streamdownAnimated,
  streamdownControls,
  streamdownMermaidConfig,
  streamdownPlugins,
} from './streamdownConfig';

import 'katex/dist/katex.min.css';
import 'streamdown/styles.css';

interface StreamdownMessageProps {
  text: string;
  className?: string;
  isAnimating: boolean;
  showCaret?: boolean;
}

export function StreamdownMessage({
  text,
  className,
  isAnimating,
  showCaret = true,
}: StreamdownMessageProps) {
  return (
    <div className={cn('llm-streamdown-wrap', className)} aria-live={isAnimating ? 'polite' : 'off'}>
      <Streamdown
        className="llm-streamdown"
        parseIncompleteMarkdown
        plugins={streamdownPlugins}
        controls={streamdownControls}
        mermaid={{ config: streamdownMermaidConfig }}
        isAnimating={isAnimating}
        animated={streamdownAnimated}
        caret="block"
      >
        {text}
      </Streamdown>
      {showCaret ? <span className="llm-streaming-caret" aria-hidden="true" /> : null}
    </div>
  );
}

export type { StreamdownMessageProps };
