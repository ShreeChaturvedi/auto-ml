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
 * Resolves a project's theme color as both a Tailwind class and a CSS hex string.
 * Handles customColor override, standard palette lookup, and dark/light mode.
 */
export function useProjectThemeColor(projectId: string) {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const { theme } = useTheme();
  const themeColorClass = project ? projectColorClasses[project.color]?.text : undefined;

  const themeColor = useMemo(() => {
    if (project?.customColor) return project.customColor;
    const hex = PROJECT_COLOR_HEX[project?.color ?? ''];
    if (!hex) return undefined;
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    return isDark ? hex.dark : hex.light;
  }, [project?.customColor, project?.color, theme]);

  return { themeColor, themeColorClass };
}
