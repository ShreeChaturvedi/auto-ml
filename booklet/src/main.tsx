import React from "react";
import ReactDOM from "react-dom/client";
import { Booklet } from "./Booklet";

// Self-hosted fonts — see ./styles/fonts.css for the Monaspace slot. The
// Vite build bundles @fontsource .woff2 binaries into /assets so puppeteer's
// headless export renders identical glyphs to the dev preview.
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./styles/fonts.css";
import "./styles/reset.css";
import "./styles/print.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Booklet />
  </React.StrictMode>,
);
