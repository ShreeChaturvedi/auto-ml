import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest configuration.
 *
 * The only aliases we still need here are the React/react-dom/jsx-runtime pins:
 * primitive tests import from `remotion`, whose esbuild transform injects
 * `react/jsx-dev-runtime` — Vite's default resolver can't find it without
 * these pins, so resolution breaks without them.
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "react/jsx-dev-runtime",
        replacement: path.resolve(
          __dirname,
          "./node_modules/react/jsx-dev-runtime.js",
        ),
      },
      {
        find: "react/jsx-runtime",
        replacement: path.resolve(
          __dirname,
          "./node_modules/react/jsx-runtime.js",
        ),
      },
      {
        find: /^react$/,
        replacement: path.resolve(__dirname, "./node_modules/react/index.js"),
      },
      {
        find: /^react-dom$/,
        replacement: path.resolve(
          __dirname,
          "./node_modules/react-dom/index.js",
        ),
      },
      {
        find: "react-dom/server",
        replacement: path.resolve(
          __dirname,
          "./node_modules/react-dom/server.js",
        ),
      },
    ],
  },
  test: {
    server: {
      deps: {
        inline: true,
      },
    },
  },
});
