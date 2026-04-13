import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import type { PluginOption } from 'vite';
import { importerAwareAtAlias } from './config/importerAwareAtAlias.mjs';

const frontendSrc = fileURLToPath(new URL('../frontend/src', import.meta.url));
const landingReact = fileURLToPath(new URL('./node_modules/react', import.meta.url));
const landingReactDom = fileURLToPath(new URL('./node_modules/react-dom', import.meta.url));
const landingReactJsxRuntime = fileURLToPath(
  new URL('./node_modules/react/jsx-runtime.js', import.meta.url),
);
const removeScrollBarConstants = fileURLToPath(
  new URL('./node_modules/react-remove-scroll-bar/dist/es2019/constants.js', import.meta.url),
);

export default defineConfig({
  plugins: [importerAwareAtAlias({ resolveBareSpecifiersFromLanding: true }) as PluginOption, react()],
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
        inline: [
          /zustand/,
          /@radix-ui\//,
          /@tanstack\/react-table/,
          /@tanstack\/react-virtual/,
          /recharts/,
          /react-router/,
          /react-router-dom/,
        ],
      },
    },
  },
  resolve: {
    // Force a single React copy across landing + @frontend imports.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react-router', 'react-router-dom'],
    alias: {
      '@frontend': frontendSrc,
      react: landingReact,
      'react-dom': landingReactDom,
      'react/jsx-runtime': landingReactJsxRuntime,
      'react-remove-scroll-bar/constants': removeScrollBarConstants,
    },
  },
});
