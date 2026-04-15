import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { fileURLToPath } from 'node:url';
import { importerAwareAtAlias } from './config/importerAwareAtAlias.mjs';

const frontendSrc = fileURLToPath(new URL('../frontend/src', import.meta.url));
const removeScrollBarConstants = fileURLToPath(
  new URL('./node_modules/react-remove-scroll-bar/dist/es2019/constants.js', import.meta.url),
);

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
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react-router', 'react-router-dom'],
      alias: {
        '@frontend': frontendSrc,
        'react-remove-scroll-bar/constants': removeScrollBarConstants,
      },
    },
    ssr: {
      noExternal: [
        /^@frontend\//,
        'recharts',
        'react-dropzone',
        'react-resizable-panels',
        'streamdown',
        'react-router',
        'react-router-dom',
      ],
    },
  },
});
