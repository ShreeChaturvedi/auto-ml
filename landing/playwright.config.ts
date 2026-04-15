import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the landing site.
 *
 * The a11y audit (`src/tests/a11y.spec.ts`) runs against the built static
 * output served by `astro preview` on a dedicated port so it does not clash
 * with the dev server on 4321.
 */
export default defineConfig({
  testDir: './src/tests',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4322',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4322',
    url: 'http://localhost:4322',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
