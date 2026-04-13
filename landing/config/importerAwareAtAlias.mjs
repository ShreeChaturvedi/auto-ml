import { createRequire, builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const landingSrc = fileURLToPath(new URL('../src', import.meta.url));
const frontendSrc = fileURLToPath(new URL('../../frontend/src', import.meta.url));
const landingRequire = createRequire(new URL('../package.json', import.meta.url));
const builtins = new Set(builtinModules);

function isBareSpecifier(source) {
  return (
    !source.startsWith('.') &&
    !source.startsWith('/') &&
    !source.startsWith('\0') &&
    !source.startsWith('virtual:') &&
    !source.startsWith('node:') &&
    !source.startsWith('@/') &&
    !source.startsWith('@frontend/')
  );
}

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
      const importerIsFrontend =
        importer && importer.includes(`${path.sep}frontend${path.sep}`);

      if (source.startsWith('@/')) {
        const rel = source.slice(2);
        const base = importerIsFrontend ? frontendSrc : landingSrc;
        const absolute = path.join(base, rel);
        const resolved = await this.resolve(absolute, importer, { skipSelf: true });
        return resolved?.id ?? absolute;
      }

      if (!importerIsFrontend || !isBareSpecifier(source) || builtins.has(source)) {
        return null;
      }

      try {
        const resolved = landingRequire.resolve(source);
        const viteResolved = await this.resolve(resolved, importer, { skipSelf: true });
        return viteResolved?.id ?? resolved;
      } catch {
        return null;
      }
    },
  };
}
