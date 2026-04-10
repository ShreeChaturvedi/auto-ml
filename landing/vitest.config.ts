import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const landingSrc = fileURLToPath(new URL('./src', import.meta.url));
const frontendSrc = fileURLToPath(new URL('../frontend/src', import.meta.url));

/**
 * Importer-aware resolver for the `@/*` alias.
 *
 * The landing workspace uses `@/*` → `landing/src/*`, while the frontend
 * workspace uses `@/*` → `frontend/src/*`. When a landing file imports a
 * frontend file via `@frontend/*`, downstream `@/*` imports inside the
 * frontend tree must keep resolving to `frontend/src/*`, not leak into
 * `landing/src/*`. A single static alias can't express that — so we use a
 * Vite plugin `resolveId` hook that branches on the importer path.
 */
function importerAwareAtAlias() {
  return {
    name: 'landing-importer-aware-at-alias',
    enforce: 'pre' as const,
    async resolveId(this: { resolve: (s: string, i?: string, o?: { skipSelf: boolean }) => Promise<{ id: string } | null> }, source: string, importer: string | undefined) {
      if (!source.startsWith('@/')) return null;
      const rel = source.slice(2);
      const base = importer && importer.includes(`${path.sep}frontend${path.sep}`)
        ? frontendSrc
        : landingSrc;
      const absolute = path.join(base, rel);
      const resolved = await this.resolve(absolute, importer, { skipSelf: true });
      return resolved?.id ?? absolute;
    },
  };
}

export default defineConfig({
  plugins: [importerAwareAtAlias(), react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@frontend': frontendSrc,
    },
  },
});
