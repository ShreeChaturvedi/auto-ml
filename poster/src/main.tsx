import React from "react";
import ReactDOM from "react-dom/client";
import { Poster } from "./Poster";

// Self-hosted fonts. @fontsource ships .woff2 binaries inside the npm package
// itself, so vite bundles them into /assets at build time and serves them
// from the same origin. No CDN at render time — puppeteer's headless export
// can run with networking disabled and still produce identical glyphs.
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
// Monaspace Neon is hand-served from /public/fonts/ — see fonts.css.
import "./fonts.css";
import "./print.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Poster />
  </React.StrictMode>,
);
