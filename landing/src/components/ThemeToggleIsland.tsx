/**
 * Nav-hosted theme toggle island.
 *
 * Bundles the shared `ThemeProvider` and `ThemeToggle` from the frontend
 * bundle so the Astro nav can mount a single `client:only="react"` island
 * and get both. The provider reads `localStorage` during its initializer,
 * which is why we use `client:only` (SSR would throw); the pre-hydration
 * script in `Root.astro` has already flipped the `<html>` class by the
 * time this island hydrates, so there is no FOUC.
 *
 * Storage key `automl-ui-theme` is shared with the main app so a toggle
 * on the landing page propagates to open app tabs via the `storage`
 * event listener in `theme-provider.tsx`.
 */
import { ThemeProvider } from '@frontend/components/theme-provider';
import { ThemeToggle } from '@frontend/components/theme-toggle';

export default function ThemeToggleIsland() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="automl-ui-theme">
      <ThemeToggle />
    </ThemeProvider>
  );
}
