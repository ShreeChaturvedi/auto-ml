import { Streamdown } from 'streamdown';

import { cn } from '@/lib/utils';

import {
  streamdownSharedProps,
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
        {...streamdownSharedProps}
        isAnimating={isAnimating}
        caret={showCaret ? 'block' : undefined}
      >
        {text}
      </Streamdown>
    </div>
  );
}

export type { StreamdownMessageProps };
