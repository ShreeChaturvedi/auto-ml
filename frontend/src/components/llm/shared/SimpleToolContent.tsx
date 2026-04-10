/**
 * SimpleToolContent — wrapper used inside `ToolIndicator`'s expanded rows.
 * Deliberately chrome-less: no background, no border, no rounded corners —
 * indentation is the only hierarchy cue. Scroll containment via
 * `maxHeight` keeps long tool outputs from blowing out the chat scroll.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SimpleToolContentProps {
  children: React.ReactNode;
  /** Max height in px; pass `null` to disable scroll containment. */
  maxHeight?: number | null;
  className?: string;
}

export function SimpleToolContent({
  children,
  maxHeight = 320,
  className,
}: SimpleToolContentProps) {
  return (
    <div
      className={cn(
        'ml-6 mt-1 py-1 text-[13px] text-foreground',
        maxHeight != null && 'overflow-y-auto',
        className,
      )}
      style={maxHeight != null ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}
