/**
 * edaTheme — centralized Plotly layout theme, lazy-loaded Plot component,
 * and dark-mode hook for all EDA chart components.
 */

import React, { Suspense } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '@/components/theme-provider';

/**
 * Resolves whether the app is in dark mode, handling 'system' theme.
 * Extracts the duplicated pattern from HistogramChart/ScatterChart.
 */
export function useIsDark(): boolean {
  const { theme } = useTheme();
  return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/** Read a CSS custom property value at call time */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Build an `hsl(...)` string from a CSS variable holding H S L values */
function hsl(varName: string): string {
  return `hsl(${cssVar(varName)})`;
}

/**
 * Factory that returns a Plotly Layout object themed from CSS variables.
 * Called inside render so it picks up current theme.
 */
export function getPlotlyLayout(isDark: boolean): Record<string, unknown> {
  const fg = hsl('--foreground');
  const mutedFg = hsl('--muted-foreground');
  const gridColor = isDark ? 'hsl(var(--muted))' : 'hsl(var(--border))';

  return {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: {
      family: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      color: fg,
      size: 11,
    },
    margin: { l: 48, r: 16, t: 24, b: 40 },
    xaxis: {
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      tickfont: { color: mutedFg, size: 10 },
    },
    yaxis: {
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      tickfont: { color: mutedFg, size: 10 },
    },
    colorway: [
      hsl('--primary'),
      hsl('--chart-2'),
      hsl('--chart-3'),
      hsl('--chart-4'),
      hsl('--chart-5'),
    ],
    hoverlabel: {
      bgcolor: hsl('--popover'),
      font: { family: 'inherit', size: 12, color: fg },
    },
  };
}

/** Shared Plotly config — no modebar by default */
export const PLOTLY_CONFIG: Record<string, unknown> = {
  responsive: true,
  displayModeBar: false,
};

/** Lazy-loaded Plot component (singleton — shared across all chart components) */
export const LazyPlot = React.lazy(() => import('react-plotly.js'));

/** Suspense wrapper with pulse skeleton fallback */
export function PlotSuspense({ height, children }: { height: number; children: ReactNode }) {
  return React.createElement(
    Suspense,
    {
      fallback: React.createElement('div', {
        className: 'animate-pulse bg-muted/50 rounded-md',
        style: { height },
      }),
    },
    children,
  );
}
