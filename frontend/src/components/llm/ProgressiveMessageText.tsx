import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useProgressiveReveal } from '@/hooks/useProgressiveReveal';
import { cn } from '@/lib/utils';
import { StreamdownMessage } from '@/components/llm/streamdown/StreamdownMessage';

interface ProgressiveMessageTextProps {
  messageId: string;
  text: string;
  isLive: boolean;
  mode: 'markdown' | 'plain';
  animateOnMount?: boolean;
  className?: string;
  showStreamingCaret?: boolean;
}

function ProgressiveMessageText({
  messageId,
  text,
  isLive,
  mode,
  animateOnMount = true,
  className,
  showStreamingCaret = true,
}: ProgressiveMessageTextProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const { visibleText, visibleSegments, visibleCharCount, isCatchup, isFullyRevealed } = useProgressiveReveal({
    text,
    isLive,
    animateOnMount,
    prefersReducedMotion,
  });

  if (mode === 'markdown') {
    return (
      <StreamdownMessage
        text={visibleText}
        className={className}
        isAnimating={!prefersReducedMotion && (isLive || isCatchup)}
        showCaret={showStreamingCaret && !isFullyRevealed}
      />
    );
  }

  if (isFullyRevealed) {
    return <div className={cn(className)}>{text}</div>;
  }

  return (
    <div className={cn(className)} aria-live={isLive ? 'polite' : 'off'}>
      {visibleSegments.map((char, index) => (
        <span key={`${messageId}-${index}`} className="llm-char-enter">
          {char}
        </span>
      ))}
    </div>
  );
}

export { ProgressiveMessageText };
export type { ProgressiveMessageTextProps };
