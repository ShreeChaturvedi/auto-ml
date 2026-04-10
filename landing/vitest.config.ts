import { defineConfig, type PluginOption } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { importerAwareAtAlias } from './config/importerAwareAtAlias.mjs';

const frontendSrc = fileURLToPath(new URL('../frontend/src', import.meta.url));

export default defineConfig({
  plugins: [importerAwareAtAlias() as PluginOption, react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    // Only .test.ts(x) is run by vitest. `.spec.ts` files are Playwright
    // E2E tests (see landing/playwright.config.ts) and must not be loaded
    // under jsdom.
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.spec.{ts,tsx}'],
    // Force cross-workspace React consumers through Vite's module graph so
    // `resolve.dedupe` below actually hits them. Without this, CJS copies of
    // zustand / @radix-ui from `frontend/node_modules` bypass Vite and load
    // their own `react`, causing "Cannot read properties of null" hook errors
    // when landing tests render reused frontend components.
    server: {
      deps: {
        inline: [/zustand/, /@radix-ui\//],
      },
    },
  },
  resolve: {
    // Force a single React copy across landing + @frontend imports. Without
    // this, vitest resolves one React from landing/node_modules and another
    // from frontend/node_modules, causing duplicate-React errors when
    // rendering imported frontend components under jsdom.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: {
      '@frontend': frontendSrc,
    },
  },
});
