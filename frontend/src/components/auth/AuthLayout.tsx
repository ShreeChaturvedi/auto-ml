/**
 * AuthLayout - Shared layout for all auth pages
 *
 * The background (grid, spotlight) persists across auth page navigation
 * to prevent animation restarts and provide visual continuity.
 */

import { Outlet } from 'react-router-dom';
import { Spotlight } from '@/components/ui/spotlight';
import { Logo } from '@/components/ui/logo';

export function AuthLayout() {
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-neutral-950 overflow-hidden">
      {/* Brand logo - top left */}
      <div className="absolute top-6 left-6 md:top-8 md:left-8 z-20">
        <Logo size="md" className="text-white" />
      </div>

      {/* Grid pattern on the page background */}
      <div
        className="pointer-events-none absolute inset-0 select-none"
        style={{
          backgroundSize: '40px 40px',
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
        }}
      />

      {/* Spotlight effect on the page - persists across auth pages */}
      <Spotlight
        className="-top-40 left-0 md:-top-20 md:left-60"
        fill="white"
      />

      {/* Auth page content */}
      <div className="relative z-10">
        <Outlet />
      </div>
    </div>
  );
}
