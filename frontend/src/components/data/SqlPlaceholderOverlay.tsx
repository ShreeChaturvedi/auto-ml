import React, { useMemo } from 'react';
import {
  CHAR_ANIM_DURATION_MS,
  computeCharDelay,
} from '@/components/ui/useAnimatedPlaceholder';
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
  contentWidth: number;
}

function TokenizedLine({ sql, animate }: { sql: string; animate: boolean }) {
  const tokens = useMemo(() => tokenizeSql(sql), [sql]);

  // Only count visible (non-whitespace) characters for delay distribution.
  // Whitespace tokens render instantly — they shouldn't consume delay budget,
  // which would create dead zones followed by catch-up bursts.
  let animIdx = 0;
  return (
    <span className="whitespace-pre-wrap break-words">
      {tokens.map((token, ti) => {
        const color = TOKEN_INLINE_COLORS[token.type as SqlTokenType];
        if (!animate || token.type === 'whitespace') {
          return (
            <span key={ti} style={{ color }}>
              {token.text}
            </span>
          );
        }
        return Array.from(token.text).map((char, ci) => {
          const delay = computeCharDelay(animIdx++);
          return (
            <span
              key={`${ti}-${ci}`}
              style={{
                '--sql-token-color': color,
                display: 'inline',
                animation: `sql-placeholder-char-in ${CHAR_ANIM_DURATION_MS}ms ease-out both`,
                animationDelay: `${delay}ms`,
              } as React.CSSProperties}
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
  contentWidth,
}: SqlPlaceholderOverlayProps) {
  if (!currentSql) return null;

  return (
    <div
      className="absolute top-0 bottom-0 z-[5] pointer-events-none"
      style={{
        left: editorLeftOffset,
        width: contentWidth || undefined,
        paddingTop: 8,
        fontFamily: '"Monaspace Neon", "JetBrains Mono", monospace',
        fontSize: 13,
        lineHeight: '18px',
        fontFeatureSettings: '"liga" off, "calt" off',
        fontVariantNumeric: 'normal',
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
