import { useMemo } from 'react';
import {
  CHAR_ANIM_DURATION_MS,
  CHAR_STAGGER_MS,
} from '@/components/ui/useInsightTicker';
import { tokenizeSql } from './sqlTokenize';
import { TOKEN_INLINE_COLORS } from './sqlRevealUtils';
import type { SqlTokenType } from './sqlTokenize';

interface SqlPlaceholderOverlayProps {
  currentSql: string;
  nextSql: string;
  isAnimating: boolean;
  outgoingTransition: string;
  incomingTransition: string;
  animateChars: boolean;
  editorLeftOffset: number;
}

function TokenizedLine({ sql, animate }: { sql: string; animate: boolean }) {
  const tokens = useMemo(() => tokenizeSql(sql), [sql]);

  let charIndex = 0;
  return (
    <span className="whitespace-pre-wrap break-words">
      {tokens.map((token, ti) => {
        const color = TOKEN_INLINE_COLORS[token.type as SqlTokenType];
        const fontWeight = token.type === 'keyword' ? 600 : undefined;
        if (!animate || token.type === 'whitespace') {
          const startIdx = charIndex;
          charIndex += token.text.length;
          return (
            <span key={`${ti}-${startIdx}`} style={{ color, fontWeight }}>
              {token.text}
            </span>
          );
        }
        return Array.from(token.text).map((char) => {
          const idx = charIndex++;
          return (
            <span
              key={`${ti}-${idx}`}
              style={{
                color,
                fontWeight,
                display: 'inline',
                animation: `sql-placeholder-char-in ${CHAR_ANIM_DURATION_MS}ms ease-out both`,
                animationDelay: `${idx * CHAR_STAGGER_MS}ms`,
              }}
            >
              {char}
            </span>
          );
        });
      })}
    </span>
  );
}

export function SqlPlaceholderOverlay({
  currentSql,
  nextSql,
  isAnimating,
  outgoingTransition,
  incomingTransition,
  animateChars,
  editorLeftOffset,
}: SqlPlaceholderOverlayProps) {
  if (!currentSql) return null;

  return (
    <div
      className="absolute top-0 bottom-0 right-0 z-[5] pointer-events-none"
      style={{
        left: editorLeftOffset,
        paddingTop: 8,
        fontFamily: '"Monaspace Neon", "JetBrains Mono", monospace',
        fontSize: 13,
        lineHeight: '18px',
      }}
      aria-hidden="true"
    >
      <div className="relative overflow-hidden">
        <span
          className="block"
          style={{
            transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)',
            opacity: isAnimating ? 0 : 1,
            transition: outgoingTransition,
          }}
        >
          <TokenizedLine sql={currentSql} animate={false} />
        </span>
        <span
          className="absolute inset-x-0 top-0 block"
          style={{
            transform: isAnimating ? 'translateY(0)' : 'translateY(100%)',
            opacity: isAnimating ? 1 : 0,
            transition: incomingTransition,
          }}
        >
          <TokenizedLine sql={nextSql} animate={animateChars} />
        </span>
      </div>
    </div>
  );
}
