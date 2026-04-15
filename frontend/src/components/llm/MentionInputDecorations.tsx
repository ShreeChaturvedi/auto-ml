import {
  CHAR_ANIM_DURATION_MS,
  computeCharDelay,
  type UseAnimatedPlaceholderResult,
} from '@/components/ui/useAnimatedPlaceholder';

interface MentionInputDecorationsProps {
  value: string;
  placeholder?: string;
  placeholders?: string[];
  voiceActive?: boolean;
  hasAnimatedPlaceholders: boolean;
  animState: UseAnimatedPlaceholderResult;
}

function AnimatedMentionPlaceholder({ anim }: { anim: UseAnimatedPlaceholderResult }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-2.5 overflow-hidden" aria-hidden="true">
      <div className="relative overflow-hidden">
        <span
          className="block text-base text-muted-foreground md:text-sm whitespace-pre-wrap break-words"
          style={{
            transform: anim.isAnimating ? 'translateY(-100%)' : 'translateY(0)',
            opacity: anim.isAnimating ? 0 : 1,
            transition: anim.outgoingTransition,
          }}
        >
          {anim.currentPlaceholder}
        </span>
        <span
          className="absolute inset-x-0 top-0 text-base text-muted-foreground md:text-sm whitespace-pre-wrap break-words"
          style={{
            transform: anim.isAnimating ? 'translateY(0)' : 'translateY(100%)',
            opacity: anim.isAnimating ? 1 : 0,
            transition: anim.incomingTransition,
          }}
        >
          {anim.isAnimating
            ? Array.from(anim.nextPlaceholder).map((char, index) => (
                <span
                  key={index}
                  style={{
                    display: 'inline',
                    animation: `placeholder-char-in ${CHAR_ANIM_DURATION_MS}ms ease-out both`,
                    animationDelay: `${computeCharDelay(index)}ms`,
                  }}
                >
                  {char}
                </span>
              ))
            : anim.nextPlaceholder}
        </span>
      </div>
    </div>
  );
}

export function MentionInputDecorations({
  value,
  placeholder,
  placeholders,
  voiceActive,
  hasAnimatedPlaceholders,
  animState,
}: MentionInputDecorationsProps) {
  const hasValue = value.length > 0;
  const staticText = placeholders?.[0] ?? placeholder;

  return (
    <>
      {hasValue
        ? null
        : hasAnimatedPlaceholders
          ? <AnimatedMentionPlaceholder anim={animState} />
          : staticText
            ? (
                <span
                  aria-hidden="true"
                  className="mention-input-placeholder pointer-events-none absolute inset-x-3 top-2.5 text-base text-muted-foreground md:text-sm"
                >
                  {staticText}
                </span>
              )
            : null}

      {voiceActive && !hasValue ? (
        <span
          aria-hidden="true"
          className="mention-input-voice-caret pointer-events-none absolute left-3 top-2.5"
        />
      ) : null}
    </>
  );
}
