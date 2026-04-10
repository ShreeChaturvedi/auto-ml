import { fileURLToPath } from 'node:url';
import path from 'node:path';

const landingSrc = fileURLToPath(new URL('../src', import.meta.url));
const frontendSrc = fileURLToPath(new URL('../../frontend/src', import.meta.url));

/**
 * Importer-aware resolver for the `@/*` alias.
 *
 * Landing and the frontend workspace both use `@/*` → `<workspace>/src/*`.
 * When landing pulls a frontend component via `@frontend/*`, downstream
 * `@/*` imports inside that file must keep resolving to `frontend/src/*`,
 * not leak back into `landing/src/*`. A single static alias can't express
 * that, so this Vite plugin uses the importer path to disambiguate.
 *
 * Shared between `landing/astro.config.mjs` and `landing/vitest.config.ts`.
 *
 * @returns {import('vite').Plugin}
 */
export function importerAwareAtAlias() {
  return {
    name: 'landing-importer-aware-at-alias',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!source.startsWith('@/')) return null;
      const rel = source.slice(2);
      const base =
        importer && importer.includes(`${path.sep}frontend${path.sep}`)
          ? frontendSrc
          : landingSrc;
      const absolute = path.join(base, rel);
      const resolved = await this.resolve(absolute, importer, { skipSelf: true });
      return resolved?.id ?? absolute;
    },
  };
}
