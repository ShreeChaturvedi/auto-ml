import { useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useTheme } from '@/components/theme-provider';
import { projectColorClasses } from '@/types/project';

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

/**
 * Returns the active project's theme color as Tailwind classes and a CSS hex string.
 * Uses activeProjectId from the store — the same path as IconModeToggle, sidebar, etc.
 * The hex value is only for CSS custom properties (e.g. --voice-theme-color);
 * prefer projectColorClasses Tailwind fields for all other styling.
 */
export function useProjectThemeColor() {
  const project = useProjectStore((s) => {
    const id = s.activeProjectId;
    return id ? s.projects.find((p) => p.id === id) : undefined;
  });
  const { theme } = useTheme();
  const colorClasses = project ? projectColorClasses[project.color] : undefined;
  const themeColorClass = colorClasses?.text;

  const themeColor = useMemo(() => {
    if (project?.customColor) return project.customColor;
    const hex = PROJECT_COLOR_HEX[project?.color ?? ''];
    if (!hex) return undefined;
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    return isDark ? hex.dark : hex.light;
  }, [project?.customColor, project?.color, theme]);

  return { themeColor, themeColorClass, colorClasses };
}
