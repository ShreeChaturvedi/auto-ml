import * as LucideIcons from 'lucide-react';

type IconComponent = React.ComponentType<{ className?: string }>;
const registry = LucideIcons as unknown as Record<string, IconComponent>;

/** Look up a Lucide icon by name. Returns undefined if not found. */
export function getLucideIcon(name: string): IconComponent | undefined {
  return registry[name];
}
