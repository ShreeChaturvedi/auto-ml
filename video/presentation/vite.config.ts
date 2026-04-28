import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Copy only whitelisted subdirs of `../public` into the build output.
 *
 * Vite's default `copyPublicDir: true` would ship the entire
 * `video/public/` — 62 MB of `captures/`, 8.4 MB of `voiceover/`, and
 * 1.1 MB of `backgrounds/`, all demo-only. This plugin + `copyPublicDir:
 * false` below restricts the bundle to assets the presenter actually needs.
 *
 * Dev mode still serves `../public` normally so `staticFile()` resolves
 * consistently with Remotion Studio.
 */
function whitelistPublicDirs(
  sourceDir: string,
  outDir: string,
  allow: string[],
): Plugin {
  return {
    name: "presenter-whitelist-public",
    apply: "build",
    closeBundle() {
      for (const name of allow) {
        const src = path.join(sourceDir, name);
        const dst = path.join(outDir, name);
        if (fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true });
      }
    },
  };
}

const PUBLIC = path.resolve(__dirname, "../public");
const OUT = path.resolve(__dirname, "../out/present");

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    whitelistPublicDirs(PUBLIC, OUT, ["fonts", "team", "branding"]),
  ],
  publicDir: PUBLIC, // dev: serve everything (convenient)
  server: { port: 5173, host: true },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    copyPublicDir: false, // prod: ship nothing by default
  },
});
