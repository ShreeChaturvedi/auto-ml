/**
 * Settings tab registry — drives both the sidebar navigation and
 * the page shell so every tab is declared in exactly one place.
 */

import { Settings, Brain, Code2, Database, Play, UserCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface SettingsTab {
  id: string;
  label: string;
  icon: LucideIcon;
  group: string;
}

export const SETTINGS_TABS: SettingsTab[] = [
  { id: 'general',   label: 'General',        icon: Settings,   group: 'WORKSPACE' },
  { id: 'ai-models', label: 'AI & Models',    icon: Brain,      group: 'WORKSPACE' },
  { id: 'editor',    label: 'Editor',         icon: Code2,      group: 'WORKSPACE' },
  { id: 'data',      label: 'Data & Queries', icon: Database,   group: 'WORKSPACE' },
  { id: 'execution', label: 'Execution',      icon: Play,       group: 'WORKSPACE' },
  { id: 'profile',   label: 'Profile',        icon: UserCircle, group: 'ACCOUNT' },
];

export const SETTINGS_TAB_IDS = SETTINGS_TABS.map((t) => t.id);
export const DEFAULT_SETTINGS_TAB = 'general';
