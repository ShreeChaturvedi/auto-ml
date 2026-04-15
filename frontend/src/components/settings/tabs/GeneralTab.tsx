import { useSyncExternalStore } from 'react';
import { Palette, PanelLeft, Zap, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getAdaptiveSyntaxPref,
  setAdaptiveSyntaxPref,
  subscribeAdaptivePref,
} from '@/lib/color/syntaxPalette';
import {
  getReduceMotionPref,
  setReduceMotionPref,
  subscribeReduceMotionPref,
  getRestoreProjectPref,
  setRestoreProjectPref,
  subscribeRestoreProjectPref,
  getShowTipsPref,
  setShowTipsPref,
  subscribeShowTipsPref,
} from '@/lib/generalPrefs';
import {
  getSidebarAccordionPref,
  setSidebarAccordionPref,
  subscribeSidebarAccordionPref,
  getSidebarCollapsedPref,
  setSidebarCollapsedPref,
  subscribeSidebarCollapsedPref,
} from '@/lib/sidebarPrefs';

export function GeneralTab() {
  const { theme, setTheme } = useTheme();

  const adaptiveSyntax = useSyncExternalStore(subscribeAdaptivePref, getAdaptiveSyntaxPref);
  const reduceMotion = useSyncExternalStore(subscribeReduceMotionPref, getReduceMotionPref);
  const sidebarAccordion = useSyncExternalStore(subscribeSidebarAccordionPref, getSidebarAccordionPref);
  const sidebarCollapsed = useSyncExternalStore(subscribeSidebarCollapsedPref, getSidebarCollapsedPref);
  const restoreProject = useSyncExternalStore(subscribeRestoreProjectPref, getRestoreProjectPref);
  const showTips = useSyncExternalStore(subscribeShowTipsPref, getShowTipsPref);

  return (
    <div>
      <div className="mb-8">
        <SettingsSection icon={Palette} title="Appearance">
          <SettingsRow
            label="Theme mode"
            description="Choose between dark, light, or system-matched appearance"
          >
            <Select value={theme} onValueChange={v => setTheme(v as 'dark' | 'light' | 'system')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  <span className="flex items-center gap-2">
                    <Sun className="h-3.5 w-3.5" />
                    Light
                  </span>
                </SelectItem>
                <SelectItem value="dark">
                  <span className="flex items-center gap-2">
                    <Moon className="h-3.5 w-3.5" />
                    Dark
                  </span>
                </SelectItem>
                <SelectItem value="system">
                  <span className="flex items-center gap-2">
                    <Monitor className="h-3.5 w-3.5" />
                    System
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>

          <SettingsRow
            label="Adaptive syntax colors"
            description="Syntax highlighting shifts hue to complement your project's accent color"
            htmlFor="adaptive-syntax"
          >
            <Switch
              id="adaptive-syntax"
              checked={adaptiveSyntax}
              onCheckedChange={setAdaptiveSyntaxPref}
            />
          </SettingsRow>

          <SettingsRow
            label="Reduce motion"
            description="Minimize animations and transitions throughout the interface"
            htmlFor="reduce-motion"
          >
            <Switch
              id="reduce-motion"
              checked={reduceMotion}
              onCheckedChange={setReduceMotionPref}
            />
          </SettingsRow>
        </SettingsSection>
      </div>

      <div className="mb-8">
        <SettingsSection icon={PanelLeft} title="Navigation">
          <SettingsRow
            label="Accordion navigation"
            description="Collapse other phases when expanding a new one in the sidebar"
            htmlFor="sidebar-accordion"
          >
            <Switch
              id="sidebar-accordion"
              checked={sidebarAccordion}
              onCheckedChange={setSidebarAccordionPref}
            />
          </SettingsRow>

          <SettingsRow
            label="Start sidebar collapsed"
            description="Hide the sidebar by default when the application loads"
            htmlFor="sidebar-collapsed"
          >
            <Switch
              id="sidebar-collapsed"
              checked={sidebarCollapsed}
              onCheckedChange={setSidebarCollapsedPref}
            />
          </SettingsRow>
        </SettingsSection>
      </div>

      <div className="mb-8">
        <SettingsSection icon={Zap} title="Behavior">
          <SettingsRow
            label="Open last project on login"
            description="Automatically reopen your most recently active project on launch"
            htmlFor="restore-project"
          >
            <Switch
              id="restore-project"
              checked={restoreProject}
              onCheckedChange={setRestoreProjectPref}
            />
          </SettingsRow>

          <SettingsRow
            label="Contextual tips"
            description="Show helpful hints and guidance relevant to your current workflow step"
            htmlFor="show-tips"
          >
            <Switch
              id="show-tips"
              checked={showTips}
              onCheckedChange={setShowTipsPref}
            />
          </SettingsRow>
        </SettingsSection>
      </div>
    </div>
  );
}
