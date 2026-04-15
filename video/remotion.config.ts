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
  };

  return cfg;
});
