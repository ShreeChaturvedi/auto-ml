/**
 * SettingsRow — A single row inside a SettingsSection card.
 *
 * Default layout: label + optional description on the left,
 * an arbitrary control (`children`) on the right.
 *
 * When `slider` is true the right side gets a wider flex wrapper
 * so sliders have room to breathe alongside their value readout.
 */

import { cn } from '@/lib/utils';

interface SettingsRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  htmlFor?: string;
  slider?: boolean;
}

export function SettingsRow({ label, description, children, htmlFor, slider }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="min-w-0 mr-4">
        <label htmlFor={htmlFor} className="text-[13px] font-medium">
          {label}
        </label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className={cn('shrink-0', slider && 'flex items-center gap-3 w-48')}>
        {children}
      </div>
    </div>
  );
}
