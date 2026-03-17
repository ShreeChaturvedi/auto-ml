/**
 * PlotSuspense — Suspense wrapper with pulse skeleton fallback
 * and optional loading label for heavy chart components.
 *
 * Extracted from edaTheme.ts into its own .tsx file so JSX can be
 * used instead of raw React.createElement, and the non-component
 * exports in edaTheme.ts don't trigger react-refresh/only-export-components.
 */

import { Suspense } from 'react';
import type { ReactNode } from 'react';

export function PlotSuspense({
  height,
  loadingLabel,
  children,
}: {
  height: number;
  loadingLabel?: string;
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="animate-pulse bg-muted/50 rounded-md flex items-center justify-center"
          style={{ height }}
        >
          {loadingLabel && (
            <span className="text-xs text-muted-foreground">{loadingLabel}</span>
          )}
        </div>
      }
    >
      <div className="animate-in fade-in duration-300">{children}</div>
    </Suspense>
  );
}
