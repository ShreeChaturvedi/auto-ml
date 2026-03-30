import { useMemo, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/components/theme-provider';

/** Direct color-name → hex mapping, matching Tailwind's palette. */
const PROJECT_COLOR_HEX: Record<string, { light: string; dark: string }> = {
  blue:   { light: '#1d4ed8', dark: '#60a5fa' },
  green:  { light: '#15803d', dark: '#4ade80' },
  purple: { light: '#7e22ce', dark: '#c084fc' },
  pink:   { light: '#be185d', dark: '#f472b6' },
  orange: { light: '#c2410c', dark: '#fb923c' },
  red:    { light: '#b91c1c', dark: '#f87171' },
  yellow: { light: '#a16207', dark: '#facc15' },
  indigo: { light: '#4338ca', dark: '#818cf8' },
  teal:   { light: '#0f766e', dark: '#2dd4bf' },
  cyan:   { light: '#0e7490', dark: '#22d3ee' },
};

/** Hue angles for each project color — used for OKLCH accent derivation. */
const PROJECT_COLOR_HUES: Record<string, number> = {
  blue: 240, green: 145, purple: 280, pink: 340,
  orange: 40, red: 15, yellow: 80, indigo: 260,
  teal: 180, cyan: 200, custom: 220,
};

/** Extract hue from a hex color string. */
function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}

/**
 * Convert OKLCH-like values to HSL for CSS variable output.
 * We use a simplified mapping: hue passes through, chroma maps to saturation,
 * lightness maps directly. This gives us perceptually-motivated accent shades
 * that plug into the existing hsl(var(--...)) pipeline.
 */
function oklchToHsl(l: number, c: number, h: number): string {
  const saturation = Math.min(Math.round(c * 500), 100);
  const lightness = Math.round(l * 100);
  return `${Math.round(h)} ${saturation}% ${lightness}%`;
}

interface AccentShade {
  token: string;
  darkL: number; darkC: number;
  lightL: number; lightC: number;
}

const ACCENT_SHADES: AccentShade[] = [
  { token: 'accent-bg',          darkL: 0.20, darkC: 0.04, lightL: 0.95, lightC: 0.03 },
  { token: 'accent-bg-hover',    darkL: 0.25, darkC: 0.05, lightL: 0.91, lightC: 0.05 },
  { token: 'accent-bg-active',   darkL: 0.28, darkC: 0.06, lightL: 0.87, lightC: 0.07 },
  { token: 'accent-border',      darkL: 0.35, darkC: 0.07, lightL: 0.82, lightC: 0.08 },
  { token: 'accent-ring',        darkL: 0.70, darkC: 0.18, lightL: 0.55, lightC: 0.18 },
  { token: 'accent-fill',        darkL: 0.70, darkC: 0.18, lightL: 0.55, lightC: 0.20 },
  { token: 'accent-fill-hover',  darkL: 0.76, darkC: 0.16, lightL: 0.48, lightC: 0.20 },
  { token: 'accent-text',        darkL: 0.75, darkC: 0.15, lightL: 0.45, lightC: 0.15 },
  { token: 'accent-text-strong', darkL: 0.85, darkC: 0.13, lightL: 0.35, lightC: 0.13 },
  { token: 'accent-on-fill',     darkL: 0.15, darkC: 0.03, lightL: 0.98, lightC: 0.01 },
];

/**
 * Returns the active project's theme color as Tailwind classes and a CSS hex string.
 * Uses activeProjectId from the store — the same path as IconModeToggle, sidebar, etc.
 *
 * Side effect: sets 10 --accent-* HSL CSS variables on documentElement for the
 * dynamic accent color system. These are consumed via Tailwind's accent-* utilities.
 */
export function useProjectThemeColor() {
  const { color, customColor } = useProjectStore(
    useShallow((s) => {
      const id = s.activeProjectId;
      const p = id ? s.projects.find((p) => p.id === id) : undefined;
      return { color: p?.color, customColor: p?.customColor };
    }),
  );
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const themeColor = useMemo(() => {
    if (customColor) return customColor;
    const hex = PROJECT_COLOR_HEX[color ?? ''];
    if (!hex) return undefined;
    return isDark ? hex.dark : hex.light;
  }, [customColor, color, isDark]);

  // Derive the hue for accent computation
  const hue = useMemo(() => {
    if (color === 'custom' && customColor) {
      return hexToHue(customColor);
    }
    return PROJECT_COLOR_HUES[color ?? ''] ?? 220;
  }, [color, customColor]);

  // Set accent CSS variables on documentElement
  useEffect(() => {
    const root = document.documentElement;
    if (!color) {
      for (const shade of ACCENT_SHADES) {
        root.style.removeProperty(`--${shade.token}`);
      }
      return;
    }
    for (const shade of ACCENT_SHADES) {
      const l = isDark ? shade.darkL : shade.lightL;
      const c = isDark ? shade.darkC : shade.lightC;
      root.style.setProperty(`--${shade.token}`, oklchToHsl(l, c, hue));
    }
    return () => {
      for (const shade of ACCENT_SHADES) {
        root.style.removeProperty(`--${shade.token}`);
      }
    };
  }, [hue, isDark, color]);

  return { themeColor };
}
