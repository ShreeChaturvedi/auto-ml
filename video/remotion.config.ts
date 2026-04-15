import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    "@": path.resolve(__dirname, "../frontend/src"),
    "@/stores/authStore": path.resolve(
      __dirname,
      "./src/frontend-bridge/mockAuthStore.ts",
    ),
    "@/stores/projectStore": path.resolve(
      __dirname,
      "./src/frontend-bridge/mockProjectStore.ts",
    ),
    "@/stores/notebookStore": path.resolve(
      __dirname,
      "./src/frontend-bridge/mockNotebookStore.ts",
    ),
    "@/lib/api/auth": path.resolve(
      __dirname,
      "./src/frontend-bridge/mockAuthApi.ts",
    ),
    "@/lib/api/projects": path.resolve(
      __dirname,
      "./src/frontend-bridge/mockProjectApi.ts",
    ),
    sonner: path.resolve(__dirname, "./src/frontend-bridge/silentSonner.ts"),
    "@/components/ui/shooting-stars": path.resolve(
      __dirname,
      "./src/frontend-bridge/stars/ShootingStars.tsx",
    ),
    "@/components/ui/stars-background": path.resolve(
      __dirname,
      "./src/frontend-bridge/stars/StarsBackground.tsx",
    ),
    "@/components/projects/ProjectDialog": path.resolve(
      __dirname,
      "./src/frontend-bridge/mockProjectDialog.tsx",
    ),
  };
  return cfg;
});
