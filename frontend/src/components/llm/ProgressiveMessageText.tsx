import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ProgressiveMessageTextProps {
  messageId: string;
  text: string;
  isLive: boolean;
  animateOnMount?: boolean;
  plainClassName?: string;
  finalClassName?: string;
  renderProgressive?: (visibleText: string) => ReactNode;
  renderFinal?: (fullText: string) => ReactNode;
}

const FRAME_MS = 16;
const LIVE_CHARS_PER_TICK = 1;
const CATCHUP_CHARS_PER_TICK = 3;

function ProgressiveMessageText({
  messageId,
  text,
  isLive,
  animateOnMount = true,
  plainClassName,
  finalClassName,
  renderProgressive,
  renderFinal,
}: ProgressiveMessageTextProps) {
  const [visibleChars, setVisibleChars] = useState(() =>
    !animateOnMount && !isLive ? text.length : 0
  );
  const [showFinal, setShowFinal] = useState(() => !animateOnMount && !isLive);

  useEffect(() => {
    if (!animateOnMount) {
      setVisibleChars(text.length);
      setShowFinal(!isLive);
      return;
    }

    setVisibleChars(0);
    setShowFinal(false);
  }, [messageId, animateOnMount]);

  useEffect(() => {
    if (showFinal) {
      return;
    }

    const interval = setInterval(() => {
      setVisibleChars((prev) => {
        const target = text.length;
        const clampedPrev = Math.min(prev, target);

        if (clampedPrev >= target) {
          return clampedPrev;
        }

        const step = isLive ? LIVE_CHARS_PER_TICK : CATCHUP_CHARS_PER_TICK;
        return Math.min(clampedPrev + step, target);
      });
    }, FRAME_MS);

    return () => {
      clearInterval(interval);
    };
  }, [isLive, showFinal, text.length]);

  useEffect(() => {
    if (!isLive && !showFinal && visibleChars >= text.length) {
      setShowFinal(true);
    }
  }, [isLive, showFinal, text.length, visibleChars]);

  const revealedText = useMemo(() => text.slice(0, visibleChars), [text, visibleChars]);

  if (showFinal) {
    return (
      <div className={cn(finalClassName)}>
        {renderFinal ? renderFinal(text) : text}
      </div>
    );
  }

  return (
    <div className={cn(plainClassName)} aria-live={isLive ? 'polite' : 'off'}>
      {renderProgressive
        ? renderProgressive(revealedText)
        : Array.from(revealedText).map((char, index) => (
          <span key={`${messageId}-${index}`} className="llm-char-enter">
            {char}
          </span>
        ))}
    </div>
  );
}

export { ProgressiveMessageText };
export type { ProgressiveMessageTextProps };
