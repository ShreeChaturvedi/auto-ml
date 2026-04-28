import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The poster is a single-page static artifact. `base: '/'` keeps asset URLs
// absolute so the puppeteer PDF export sees the same URLs as the dev preview.
// `copyPublicDir` ensures `public/fonts`, `public/team`, `public/branding`,
// and `public/phases` are copied verbatim on build.
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
    port: 5180,
    strictPort: false,
  },
});
