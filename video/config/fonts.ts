/**
 * Font registration for the Remotion composition.
 *
 * Fonts are loaded at module evaluation time so they are ready before any
 * scene paints. The composition uses:
 *
 *   - Plus Jakarta Sans (sans-serif body + titles) — Google Fonts
 *   - Instrument Serif (editorial accent, quotes, big headlines) — Google Fonts
 *   - Monaspace Neon (monospace, for code blocks) — self-hosted in public/fonts
 *
 * Matches the frontend's font stack (see frontend/tailwind.config.js).
 */

import {
  loadFont as loadPlusJakartaSans,
  fontFamily as plusJakartaSansFamily,
} from "@remotion/google-fonts/PlusJakartaSans";

import {
  loadFont as loadInstrumentSerif,
  fontFamily as instrumentSerifFamily,
} from "@remotion/google-fonts/InstrumentSerif";

import { loadFont as loadLocalFont } from "@remotion/fonts";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

const sansLatin = loadPlusJakartaSans("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

const serifLatin = loadInstrumentSerif("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

const monaspace = loadLocalFont({
  family: "Monaspace Neon",
  url: staticFile("fonts/MonaspaceNeon.woff2"),
  format: "woff2",
  weight: "300 700",
  style: "normal",
  display: "block",
});

export const waitForFonts = async (): Promise<void> => {
  await Promise.all([
    sansLatin.waitUntilDone(),
    serifLatin.waitUntilDone(),
    monaspace,
  ]);
};

/** Sans-serif — default body text, UI labels, paragraphs. */
export const REGULAR_FONT: React.CSSProperties = {
  fontFamily: plusJakartaSansFamily,
  fontWeight: 500,
};

/** Title display weight — used for slide titles. */
export const TITLE_FONT: React.CSSProperties = {
  fontFamily: plusJakartaSansFamily,
  fontWeight: 700,
};

/** Editorial serif — use sparingly for emphasis. */
export const SERIF_FONT: React.CSSProperties = {
  fontFamily: instrumentSerifFamily,
  fontWeight: 400,
};

/** Monospace — code blocks, terminal output, tabular numerics. */
export const MONOSPACE_FONT: React.CSSProperties = {
  fontFamily: "'Monaspace Neon', ui-monospace, monospace",
  fontWeight: 500,
  fontFeatureSettings: '"ss01", "ss02", "calt"',
};

/** Endcard typography — same as REGULAR for now. */
export const ENDCARD_FONT: React.CSSProperties = {
  fontFamily: plusJakartaSansFamily,
  fontWeight: 600,
};

const delay = delayRender("Loading fonts");
waitForFonts()
  .then(() => continueRender(delay))
  .catch((err) => cancelRender(err));
