/**
 * edaTheme — centralized Plotly layout theme, lazy-loaded Plot component,
 * and dark-mode hook for all EDA chart components.
 */

import React from 'react';
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
 * Returns the 6-color branded EDA categorical palette
 * reading from --eda-* CSS variables.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getEdaColors(isDark: boolean): string[] {
  return [
    hsl('--eda-blue'),
    hsl('--eda-copper'),
    hsl('--eda-emerald'),
    hsl('--eda-amber'),
    hsl('--eda-rose'),
    hsl('--eda-lavender'),
  ];
}

/** Diverging and sequential colorscales for heatmaps / correlation matrices */
export const EDA_COLORSCALES = {
  /** Red–Blue diverging colorscale with dark/light midpoint variants */
  rdbu: (isDark: boolean): [number, string][] => [
    [0, 'hsl(0, 70%, 55%)'],
    [0.25, 'hsl(15, 50%, 65%)'],
    [0.5, isDark ? 'hsl(0, 0%, 18%)' : 'hsl(0, 0%, 95%)'],
    [0.75, 'hsl(210, 50%, 65%)'],
    [1, 'hsl(220, 70%, 55%)'],
  ],
  /** Viridis-inspired sequential colorscale */
  viridis: [
    [0, '#440154'],
    [0.25, '#31688e'],
    [0.5, '#35b779'],
    [0.75, '#90d743'],
    [1, '#fde725'],
  ] as [number, string][],
};

/**
 * Factory that returns a Plotly Layout object themed from CSS variables.
 * Called inside render so it picks up current theme.
 *
 * Scientific layout preset:
 * - Left/bottom axis lines visible, top/right hidden
 * - Subtle grid with low opacity
 * - Zeroline off
 * - EDA branded colorway
 */
export function getPlotlyLayout(isDark: boolean): Record<string, unknown> {
  const fg = hsl('--foreground');
  const mutedFg = hsl('--muted-foreground');
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)';

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
      zeroline: false,
      showline: true,
      linecolor: mutedFg,
      mirror: false,
      tickfont: { color: mutedFg, size: 10 },
    },
    yaxis: {
      gridcolor: gridColor,
      zeroline: false,
      showline: true,
      linecolor: mutedFg,
      mirror: false,
      tickfont: { color: mutedFg, size: 10 },
    },
    colorway: getEdaColors(isDark),
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

/** Plotly config with modebar shown on hover — for interactive charts */
export const PLOTLY_CONFIG_INTERACTIVE: Record<string, unknown> = {
  ...PLOTLY_CONFIG,
  displayModeBar: 'hover' as const,
};

/** Lazy-loaded Plot component (singleton — shared across all chart components) */
export const LazyPlot = React.lazy(() => import('react-plotly.js'));

// PlotSuspense has been extracted to ./PlotSuspense.tsx for proper JSX support.
// Re-export for backwards compatibility with existing imports from './edaTheme'.
export { PlotSuspense } from './PlotSuspense';
