/**
 * Theme Toggle Button
 *
 * Flips between light and dark themes. Icon always reflects
 * what the user actually sees (resolved theme), not the stored preference.
 */

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      className="grid place-items-center"
    >
      <span
        key={resolvedTheme}
        className="animate-in spin-in-90 zoom-in-75 duration-200"
      >
        {resolvedTheme === 'light' ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </span>
    </Button>
  );
}
