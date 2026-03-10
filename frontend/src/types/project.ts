/**
 * Project type definitions for the AI-Augmented AutoML Toolchain
 *
 * Projects are the top-level organizational unit containing:
 * - Chats with LLM
 * - Data files (CSVs, JSON, etc.)
 * - Experiments and models
 * - Training jobs
 */

import type React from 'react';
import type { Phase } from './phase';

export interface Project {
  id: string;
  title: string;
  description?: string;
  icon: string; // lucide-react icon name
  color: ProjectColor; // Predefined color for icon background
  customColor?: string; // Hex color when color === 'custom'
  createdAt: Date;
  updatedAt: Date;

  // Phase progression tracking
  unlockedPhases: Phase[]; // Phases unlocked in workflow progression
  currentPhase: Phase; // Current active phase
  completedPhases: Phase[]; // Phases marked as complete

  metadata?: Record<string, unknown>; // Extensible metadata
}

/**
 * Predefined color palette for project icons
 * Using Tailwind color classes for consistency
 */
export type ProjectColor =
  | 'blue'
  | 'green'
  | 'purple'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'indigo'
  | 'teal'
  | 'cyan'
  | 'custom';

/**
 * Form data for creating/editing projects
 */
export interface ProjectFormData {
  title: string;
  description?: string;
  icon: string;
  color: ProjectColor;
  customColor?: string;
}

/**
 * Project color mapping to Tailwind classes
 * Used for consistent styling across light/dark modes
 * Higher opacity for better visibility in both themes
 */
export const projectColorClasses: Record<ProjectColor, {
  bg: string;
  text: string;
  hover: string;
  /** Faint border for card/container outlines */
  border: string;
  /** Saturated border matching `text` intensity — use for selection indicators (tab underlines, active left-borders, etc.) */
  borderAccent: string;
}> = {
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-500/20',
    text: 'text-blue-700 dark:text-blue-400',
    hover: 'hover:bg-blue-200 dark:hover:bg-blue-500/30',
    border: 'border-blue-300 dark:border-blue-500/40',
    borderAccent: 'border-blue-700 dark:border-blue-400'
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-500/20',
    text: 'text-green-700 dark:text-green-400',
    hover: 'hover:bg-green-200 dark:hover:bg-green-500/30',
    border: 'border-green-300 dark:border-green-500/40',
    borderAccent: 'border-green-700 dark:border-green-400'
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-500/20',
    text: 'text-purple-700 dark:text-purple-400',
    hover: 'hover:bg-purple-200 dark:hover:bg-purple-500/30',
    border: 'border-purple-300 dark:border-purple-500/40',
    borderAccent: 'border-purple-700 dark:border-purple-400'
  },
  pink: {
    bg: 'bg-pink-100 dark:bg-pink-500/20',
    text: 'text-pink-700 dark:text-pink-400',
    hover: 'hover:bg-pink-200 dark:hover:bg-pink-500/30',
    border: 'border-pink-300 dark:border-pink-500/40',
    borderAccent: 'border-pink-700 dark:border-pink-400'
  },
  orange: {
    bg: 'bg-orange-100 dark:bg-orange-500/20',
    text: 'text-orange-700 dark:text-orange-400',
    hover: 'hover:bg-orange-200 dark:hover:bg-orange-500/30',
    border: 'border-orange-300 dark:border-orange-500/40',
    borderAccent: 'border-orange-700 dark:border-orange-400'
  },
  red: {
    bg: 'bg-red-100 dark:bg-red-500/20',
    text: 'text-red-700 dark:text-red-400',
    hover: 'hover:bg-red-200 dark:hover:bg-red-500/30',
    border: 'border-red-300 dark:border-red-500/40',
    borderAccent: 'border-red-700 dark:border-red-400'
  },
  yellow: {
    bg: 'bg-yellow-100 dark:bg-yellow-500/20',
    text: 'text-yellow-700 dark:text-yellow-400',
    hover: 'hover:bg-yellow-200 dark:hover:bg-yellow-500/30',
    border: 'border-yellow-300 dark:border-yellow-500/40',
    borderAccent: 'border-yellow-700 dark:border-yellow-400'
  },
  indigo: {
    bg: 'bg-indigo-100 dark:bg-indigo-500/20',
    text: 'text-indigo-700 dark:text-indigo-400',
    hover: 'hover:bg-indigo-200 dark:hover:bg-indigo-500/30',
    border: 'border-indigo-300 dark:border-indigo-500/40',
    borderAccent: 'border-indigo-700 dark:border-indigo-400'
  },
  teal: {
    bg: 'bg-teal-100 dark:bg-teal-500/20',
    text: 'text-teal-700 dark:text-teal-400',
    hover: 'hover:bg-teal-200 dark:hover:bg-teal-500/30',
    border: 'border-teal-300 dark:border-teal-500/40',
    borderAccent: 'border-teal-700 dark:border-teal-400'
  },
  cyan: {
    bg: 'bg-cyan-100 dark:bg-cyan-500/20',
    text: 'text-cyan-700 dark:text-cyan-400',
    hover: 'hover:bg-cyan-200 dark:hover:bg-cyan-500/30',
    border: 'border-cyan-300 dark:border-cyan-500/40',
    borderAccent: 'border-cyan-700 dark:border-cyan-400'
  },
  custom: {
    bg: 'bg-muted',
    text: 'text-foreground',
    hover: 'hover:bg-muted',
    border: 'border-border',
    borderAccent: 'border-foreground'
  }
};

/**
 * Resolve project color classes, returning inline styles for custom hex colors.
 * For preset colors, returns the Tailwind classes from `projectColorClasses`.
 * For custom colors, returns neutral fallback classes plus a `style` object
 * with the custom hex color applied as background (12% opacity) and border (40% opacity).
 */
export function resolveProjectColor(
  color: ProjectColor,
  customColor?: string
): {
  bg: string;
  text: string;
  hover: string;
  border: string;
  borderAccent: string;
  style?: React.CSSProperties;
} {
  if (color !== 'custom' || !customColor) {
    return projectColorClasses[color];
  }

  return {
    ...projectColorClasses.custom,
    style: {
      backgroundColor: `${customColor}1F`, // ~12% opacity
      color: customColor,
      borderColor: `${customColor}66`, // ~40% opacity
    }
  };
}