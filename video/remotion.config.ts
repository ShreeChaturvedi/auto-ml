import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind";
import path from "node:path";

// Remotion's CLI loads this config via a CJS transpile pass, so `import.meta`
// is empty here. The config always lives at `video/remotion.config.ts` and
// the Remotion CLI is always invoked with cwd === `video/`, so `process.cwd()`
// reliably gives us the workspace root for alias resolution.
const workspaceRoot = process.cwd();

// High-quality h264 render defaults for the final capstone deliverable.
// CRF 18 ≈ visually lossless; yuv420p ensures broad player compatibility.
// Concurrency null → Remotion auto-picks cores.
Config.setCodec("h264");
Config.setCrf(18);
Config.setPixelFormat("yuv420p");
Config.setConcurrency(null);
Config.setOverwriteOutput(true);
Config.setVideoImageFormat("jpeg");
Config.setAskAIEnabled(false);

/**
 * Webpack override: enables Tailwind and wires path aliases so Remotion
 * scenes can import real React components from `frontend/src/` using the
 * same `@/…` specifier style the frontend uses. Specific alias entries
 * redirect store + API imports to deterministic frontend-bridge shims.
 *
 * See `video/src/frontend-bridge/` for the shim implementations.
 */
Config.overrideWebpackConfig((currentConfig) => {
  const cfg = enableTailwind(currentConfig);
  cfg.resolve = cfg.resolve ?? {};
  cfg.resolve.alias = {
    ...(cfg.resolve.alias ?? {}),
    "@": path.resolve(workspaceRoot, "../frontend/src"),
    "@/stores/authStore": path.resolve(
      workspaceRoot,
      "./src/frontend-bridge/mockAuthStore.ts",
    ),
    "@/stores/projectStore": path.resolve(
      workspaceRoot,
      "./src/frontend-bridge/mockProjectStore.ts",
    ),
    "@/stores/notebookStore": path.resolve(
      workspaceRoot,
      "./src/frontend-bridge/mockNotebookStore.ts",
    ),
    "@/lib/api/auth": path.resolve(
      workspaceRoot,
      "./src/frontend-bridge/mockAuthApi.ts",
    ),
    "@/lib/api/projects": path.resolve(
      workspaceRoot,
      "./src/frontend-bridge/mockProjectApi.ts",
    ),
    sonner: path.resolve(workspaceRoot, "./src/frontend-bridge/silentSonner.ts"),
    "@/components/ui/shooting-stars": path.resolve(
      workspaceRoot,
      "./src/frontend-bridge/stars/ShootingStars.tsx",
    ),
    "@/components/ui/stars-background": path.resolve(
      workspaceRoot,
      "./src/frontend-bridge/stars/StarsBackground.tsx",
    ),
    "@/components/projects/ProjectDialog": path.resolve(
      workspaceRoot,
      "./src/frontend-bridge/mockProjectDialog.tsx",
    ),
    // React dedupe: frontend/src files walk up to frontend/node_modules/react
    // (19.1.1) while the video workspace uses 19.2.3. Pin both to video's copy
    // so `useContext` dispatchers resolve through a single React instance.
    react: path.resolve(workspaceRoot, "./node_modules/react"),
    "react-dom": path.resolve(workspaceRoot, "./node_modules/react-dom"),
    "react/jsx-runtime": path.resolve(
      workspaceRoot,
      "./node_modules/react/jsx-runtime.js",
    ),
    "react/jsx-dev-runtime": path.resolve(
      workspaceRoot,
      "./node_modules/react/jsx-dev-runtime.js",
    ),
    // react-router dedupe: `video/` ships 7.14.1 and `frontend/` ships 7.13.1.
    // Without this, `<StaticRouterAdapter>` wraps children in the 7.14.1
    // Router context, but `LoginForm`/`SignupForm` (imported from frontend/)
    // resolve `useNavigate` through the 7.13.1 context singleton. Two
    // separate contexts → `useNavigate() may be used only in the context of a
    // <Router>` at render time.
    //
    // Use webpack's `$` exact-match suffix so we only intercept the bare
    // specifier — `react-router-dom@7.14.1` internally imports
    // `"react-router/dom"` (a subpath export), and a prefix alias on
    // `react-router` would redirect that to `<video-root>/.../react-router/dom`
    // (a file that doesn't exist) and webpack would fail to resolve it.
    "react-router-dom$": path.resolve(
      workspaceRoot,
      "./node_modules/react-router-dom/dist/index.mjs",
    ),
    "react-router$": path.resolve(
      workspaceRoot,
      "./node_modules/react-router/dist/development/index.mjs",
    ),
  };

  // Defensively include `.tsx` + friends in `resolve.extensions`. Remotion's
  // default bundler config already lists them, but when someone adds a
  // cross-workspace import (e.g. `frontend/src/components/ui/input.tsx` via
  // the `@` alias), webpack error messages can bubble up as
  // "Cannot find module '…/input.tsx'" if an intermediate loader rewrites
  // extensions. Pinning the full list on the final config makes resolution
  // robust regardless of the plugin order above.
  cfg.resolve.extensions = Array.from(
    new Set([
      ...(cfg.resolve.extensions ?? []),
      ".tsx",
      ".ts",
      ".jsx",
      ".js",
      ".json",
      ".mjs",
      ".cjs",
    ]),
  );

  return cfg;
});
