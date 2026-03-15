/**
 * edaTheme — centralized Plotly layout theme, lazy-loaded Plot component,
 * and dark-mode hook for all EDA chart components.
 *
 * IMPORTANT: All color values are derived from the `isDark` boolean, NOT
 * from CSS variable reads (getComputedStyle). CSS variables change via a
 * class toggle in the ThemeProvider's useLayoutEffect, but child component
 * useMemo blocks execute BEFORE that effect fires (React renders children
 * before parent effects). This means getComputedStyle() returns stale
 * values during the render that follows a theme change.
 *
 * The fix: hardcode light/dark color pairs here (mirroring index.css values)
 * and select via the isDark boolean, which IS correct during render because
 * it's derived from React context state, not DOM state.
 */

import React from 'react';
import { useTheme } from '@/components/theme-provider';

/**
 * Resolves whether the app is in dark mode, handling 'system' theme.
 */
export function useIsDark(): boolean {
  const { theme } = useTheme();
  return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/* ------------------------------------------------------------------ */
/*  Color palettes — hardcoded to avoid CSS variable timing issues     */
/* ------------------------------------------------------------------ */

/** EDA palette: light and dark variants (mirrors --eda-* in index.css) */
const EDA_PALETTE = {
  light: {
    blue:     'hsl(210, 60%, 65%)',
    copper:   'hsl(25, 70%, 60%)',
    emerald:  'hsl(155, 55%, 55%)',
    amber:    'hsl(38, 80%, 62%)',
    rose:     'hsl(345, 50%, 62%)',
    lavender: 'hsl(270, 45%, 65%)',
  },
  dark: {
    blue:     'hsl(210, 65%, 70%)',
    copper:   'hsl(25, 75%, 65%)',
    emerald:  'hsl(155, 60%, 60%)',
    amber:    'hsl(38, 85%, 67%)',
    rose:     'hsl(345, 55%, 67%)',
    lavender: 'hsl(270, 50%, 72%)',
  },
} as const;

/** Theme-dependent UI colors (mirrors --foreground etc. in index.css) */
const UI_COLORS = {
  light: {
    fg:       'hsl(222.2, 47.4%, 11.2%)',
    mutedFg:  'hsl(215.4, 16.3%, 46.9%)',
    popover:  'hsl(0, 0%, 100%)',
  },
  dark: {
    fg:       'hsl(0, 0%, 98%)',
    mutedFg:  'hsl(0, 0%, 64%)',
    popover:  'hsl(0, 0%, 9%)',
  },
} as const;

/**
 * Returns the 6-color branded EDA categorical palette.
 * Must accept isDark to select the correct variant synchronously.
 */
export function getEdaColors(isDark: boolean): string[] {
  const p = isDark ? EDA_PALETTE.dark : EDA_PALETTE.light;
  return [p.blue, p.copper, p.emerald, p.amber, p.rose, p.lavender];
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
 * Factory that returns a Plotly Layout object themed for the current mode.
 *
 * Scientific layout preset:
 * - Left/bottom axis lines visible, top/right hidden
 * - Subtle grid with low opacity
 * - Zeroline off
 * - EDA branded colorway
 */
export function getPlotlyLayout(isDark: boolean): Record<string, unknown> {
  const ui = isDark ? UI_COLORS.dark : UI_COLORS.light;
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)';

  return {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: {
      family: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      color: ui.fg,
      size: 11,
    },
    margin: { l: 48, r: 16, t: 24, b: 40 },
    xaxis: {
      gridcolor: gridColor,
      zeroline: false,
      showline: true,
      linecolor: ui.mutedFg,
      mirror: false,
      tickfont: { color: ui.mutedFg, size: 10 },
    },
    yaxis: {
      gridcolor: gridColor,
      zeroline: false,
      showline: true,
      linecolor: ui.mutedFg,
      mirror: false,
      tickfont: { color: ui.mutedFg, size: 10 },
    },
    colorway: getEdaColors(isDark),
    hoverlabel: {
      bgcolor: ui.popover,
      font: { family: 'inherit', size: 12, color: ui.fg },
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
