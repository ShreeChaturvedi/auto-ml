/**
 * Public marketing site (Astro `landing/`). Override per deploy with VITE_LANDING_URL.
 */
const DEFAULT_LANDING_URL = 'https://agentic-automl.vercel.app';

export function getLandingUrl(): string {
  const fromEnv = import.meta.env.VITE_LANDING_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return fromEnv.replace(/\/$/, '');
  }
  return DEFAULT_LANDING_URL;
}
