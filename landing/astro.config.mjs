import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { fileURLToPath } from 'node:url';
import { importerAwareAtAlias } from './config/importerAwareAtAlias.mjs';

const frontendSrc = fileURLToPath(new URL('../frontend/src', import.meta.url));

export default defineConfig({
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
  ],
  site: 'https://agentic-automl.dev',
  output: 'static',
  server: { port: 4321 },
  vite: {
    plugins: [importerAwareAtAlias()],
    resolve: {
      alias: {
        '@frontend': frontendSrc,
      },
    },
    ssr: {
      noExternal: [/^@frontend\//, 'recharts', 'streamdown'],
    },
  },
});
