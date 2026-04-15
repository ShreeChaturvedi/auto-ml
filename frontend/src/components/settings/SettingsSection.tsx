/**
 * SettingsSection — Reusable section wrapper for settings tabs.
 *
 * Renders a section heading (icon + title) followed by a card
 * group that divides children with subtle borders.
 * The parent is responsible for spacing between sections (`mb-8`).
 */

import type { LucideIcon } from 'lucide-react';

interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}

export function SettingsSection({ icon: Icon, title, children }: SettingsSectionProps) {
  return (
    <section>
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {title}
      </h2>
      <div className="rounded-lg border border-border bg-card/50 divide-y divide-border/50">
        {children}
      </div>
    </section>
  );
}
