import { useEffect } from 'react';
import { getLandingUrl } from '@/lib/landingUrl';

/**
 * Replaces the old in-app README `/docs` route: sends users to the marketing landing.
 */
export function LandingRedirectPage() {
  useEffect(() => {
    window.location.replace(getLandingUrl());
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Redirecting…</p>
    </div>
  );
}
