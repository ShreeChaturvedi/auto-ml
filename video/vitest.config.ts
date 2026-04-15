import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest configuration.
 *
 * Mirrors the path aliases from `remotion.config.ts` + `tsconfig.json` so
 * smoke tests that import real frontend components (e.g. `@/pages/HomePage`)
 * resolve the same way they do under Remotion's webpack bundle. Specific
 * alias entries redirect stores + APIs to frontend-bridge shims, keeping
 * renders deterministic under test.
 *
 * If a new shim lands, add it here AND in `remotion.config.ts` AND in
 * `tsconfig.json` paths — three-way sync is required.
 */
export default defineConfig({
  resolve: {
    alias: [
      // Specific shim aliases must be listed BEFORE the `@` fallback so Vite's
      // resolver prefers them (Vite matches array aliases in order).
      {
        find: "@/stores/authStore",
        replacement: path.resolve(
          __dirname,
          "./src/frontend-bridge/mockAuthStore.ts",
        ),
      },
      {
        find: "@/stores/projectStore",
        replacement: path.resolve(
          __dirname,
          "./src/frontend-bridge/mockProjectStore.ts",
        ),
      },
      {
        find: "@/stores/notebookStore",
        replacement: path.resolve(
          __dirname,
          "./src/frontend-bridge/mockNotebookStore.ts",
        ),
      },
      {
        find: "@/lib/api/auth",
        replacement: path.resolve(
          __dirname,
          "./src/frontend-bridge/mockAuthApi.ts",
        ),
      },
      {
        find: "@/lib/api/projects",
        replacement: path.resolve(
          __dirname,
          "./src/frontend-bridge/mockProjectApi.ts",
        ),
      },
      {
        find: "@/components/ui/shooting-stars",
        replacement: path.resolve(
          __dirname,
          "./src/frontend-bridge/stars/ShootingStars.tsx",
        ),
      },
      {
        find: "@/components/ui/stars-background",
        replacement: path.resolve(
          __dirname,
          "./src/frontend-bridge/stars/StarsBackground.tsx",
        ),
      },
      {
        find: "@/components/projects/ProjectDialog",
        replacement: path.resolve(
          __dirname,
          "./src/frontend-bridge/mockProjectDialog.tsx",
        ),
      },
      {
        find: "sonner",
        replacement: path.resolve(
          __dirname,
          "./src/frontend-bridge/silentSonner.ts",
        ),
      },
      // Generic `@` fallback — must come last.
      {
        find: /^@\/(.*)$/,
        replacement: path.resolve(__dirname, "../frontend/src/$1"),
      },
      // Pin React's auto-inserted jsx-runtime imports to this workspace's
      // `node_modules/react/...` files. Without these, a frontend/src/ file
      // imports `react/jsx-dev-runtime` at its esbuild-transformed jsx
      // callsite and Vite's `tryNodeResolve` fails (no node_modules on
      // frontend/'s walk-up path). The alias points bare React specifiers
      // at absolute filesystem paths so resolution succeeds regardless of
      // importer location.
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
      // react-router dedupe: mirrors the webpack aliases in remotion.config.ts.
      // `video/` ships 7.14.1 and `frontend/` ships 7.13.1, and the two
      // copies carry distinct Router context singletons. Pinning both
      // package names to video's copy ensures `StaticRouterAdapter` and the
      // real `useNavigate()` in frontend forms thread the same context —
      // without this, tests crash with "useNavigate() may be used only in
      // the context of a <Router> component".
      //
      // `react-router-dom` only ships a top-level dist/index.mjs, while
      // `react-router` ships development/production variants. Point each
      // specifier at the concrete ESM entry Vite should resolve.
      {
        find: /^react-router-dom$/,
        replacement: path.resolve(
          __dirname,
          "./node_modules/react-router-dom/dist/index.mjs",
        ),
      },
      {
        find: /^react-router$/,
        replacement: path.resolve(
          __dirname,
          "./node_modules/react-router/dist/development/index.mjs",
        ),
      },
    ],
  },
  // Vitest uses Vite's dev server under the hood. By default its root is
  // `video/`, and the resolver refuses to serve files outside that root
  // unless listed in `server.fs.allow`. We add `..` so tests can import
  // real frontend components from `../frontend/src/...`.
  server: {
    fs: {
      allow: [path.resolve(__dirname, ".."), __dirname],
    },
  },
  test: {
    server: {
      deps: {
        // Force every dep through Vite's transform pipeline. Vitest's
        // default externalization path returns a "fake module id" for
        // packages under node_modules when the importer lives outside
        // the vitest root (`../frontend/src/...`), and React's CJS
        // shim (`node_modules/react/jsx-dev-runtime.js`) then fails to
        // resolve its own relative `require('./cjs/...')`. `inline: true`
        // sets `ssr.noExternal = true`, keeping everything inlined.
        inline: true,
      },
    },
  },
});
