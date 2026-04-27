import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The booklet is a 28-page static artifact exported to PDF by puppeteer.
// Mirrors /poster/vite.config.ts: absolute base URLs so dev preview and the
// headless PDF export see identical URLs, and publicDir copies public/fonts,
// public/art (Gemini SVGs), public/screenshots (user-supplied PNGs) verbatim
// into dist/.
export default defineConfig({
  base: "/",
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    sourcemap: false,
    target: "es2022",
  },
  server: {
    port: 5181,
    strictPort: false,
  },
});
