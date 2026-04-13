import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const landingSrc = fileURLToPath(new URL('../src', import.meta.url));
const frontendSrc = fileURLToPath(new URL('../../frontend/src', import.meta.url));
const builtins = new Set(builtinModules);

function isBareSpecifier(source) {
  return (
    !source.startsWith('.') &&
    !source.startsWith('/') &&
    !source.startsWith('\0') &&
    !source.startsWith('virtual:') &&
    !source.startsWith('node:')
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
 * @param {{ resolveBareSpecifiersFromLanding?: boolean }} [options]
 * @returns {import('vite').Plugin}
 */
export function importerAwareAtAlias(options = {}) {
  const { resolveBareSpecifiersFromLanding = false } = options;

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

      if (
        resolveBareSpecifiersFromLanding &&
        importerIsFrontend &&
        isBareSpecifier(source) &&
        !builtins.has(source)
      ) {
        const syntheticLandingImporter = path.join(landingSrc, '__resolver__.ts');
        const resolved = await this.resolve(source, syntheticLandingImporter, { skipSelf: true });
        return resolved?.id ?? null;
      }

      return null;
    },
  };
}
