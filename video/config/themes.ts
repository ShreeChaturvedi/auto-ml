import { z } from "zod";

/**
 * Theme palette for the Remotion composition.
 *
 * Colors mirror frontend/src/styles/theme.css. The ACCENT color is the blue
 * from the product's `projectColorClasses.blue` token (light: blue-700 =>
 * #1D4ED8, matching `text-blue-700`; dark: 210 65% 70% => #7AB5F1).
 *
 * To flip the video's baseline to light, set DEFAULT_THEME below to "light".
 * To swap the accent to Indigo (or any other project color), update
 * ACCENT_COLOR / WORD_HIGHLIGHT_COLOR in each palette.
 */

export const theme = z.enum(["light", "dark"]);
export type Theme = z.infer<typeof theme>;

/** Video baseline theme. The opening runway is a white-background design. */
export const DEFAULT_THEME: Theme = "light";

type ColorTheme = {
  /** Page background, gradient start. */
  BACKGROUND: string;
  /** Secondary bg used behind app chrome / demo frame. */
  BACKGROUND_ELEVATED: string;
  /** Muted bg used for captions/subtle surfaces. */
  CAPTIONS_BACKGROUND: string;
  /** Thin border color for cards, chrome outlines. */
  BORDER_COLOR: string;
  /** Strong foreground text color (fully opaque). */
  WORD_COLOR_ON_BG_APPEARED: string;
  /** Faded foreground for secondary text. */
  WORD_COLOR_ON_BG_GREYED: string;
  /** Highlight color for animated word reveals / key emphasis. */
  WORD_HIGHLIGHT_COLOR: string;
  /** Primary brand accent (matches project blue). */
  ACCENT_COLOR: string;
  /** CTA button text. */
  CTA_BUTTON_COLOR: string;
  /** CTA button background. */
  CTA_BUTTON_BACKGROUND_COLOR: string;
  /** Endcard + title typography color. */
  ENDCARD_TEXT_COLOR: string;
};

// blue-700 — mirrors frontend `projectColorClasses.blue.text` (text-blue-700)
// in frontend/src/types/project.ts.
const BLUE_LIGHT = "#1D4ED8";
// hsl(210 65% 70%) ≈ #85B8E8
const BLUE_DARK = "#7AB5F1";

export const COLORS: { [key in Theme]: ColorTheme } = {
  light: {
    BACKGROUND: "#FFFFFF",
    BACKGROUND_ELEVATED: "#FAFAFA",
    CAPTIONS_BACKGROUND: "#F5F5F5",
    BORDER_COLOR: "#E5E5E5",
    WORD_COLOR_ON_BG_APPEARED: "#171717",
    WORD_COLOR_ON_BG_GREYED: "rgba(23, 23, 23, 0.55)",
    WORD_HIGHLIGHT_COLOR: BLUE_LIGHT,
    ACCENT_COLOR: BLUE_LIGHT,
    CTA_BUTTON_COLOR: "#FFFFFF",
    CTA_BUTTON_BACKGROUND_COLOR: "#171717",
    ENDCARD_TEXT_COLOR: "#171717",
  },
  dark: {
    BACKGROUND: "#0A0A0A",
    BACKGROUND_ELEVATED: "#121212",
    CAPTIONS_BACKGROUND: "#1A1A1A",
    BORDER_COLOR: "#2E2E2E",
    WORD_COLOR_ON_BG_APPEARED: "#F7F7F7",
    WORD_COLOR_ON_BG_GREYED: "rgba(247, 247, 247, 0.50)",
    WORD_HIGHLIGHT_COLOR: BLUE_DARK,
    ACCENT_COLOR: BLUE_DARK,
    CTA_BUTTON_COLOR: "#171717",
    CTA_BUTTON_BACKGROUND_COLOR: "#F7F7F7",
    ENDCARD_TEXT_COLOR: "#F7F7F7",
  },
};

/**
 * Subtle gradient overlay used behind the demo app chrome.
 * Goes from BACKGROUND to BACKGROUND_ELEVATED diagonally.
 */
export const getChromeGradient = (t: Theme) => {
  const c = COLORS[t];
  return `linear-gradient(135deg, ${c.BACKGROUND} 0%, ${c.BACKGROUND_ELEVATED} 100%)`;
};

/**
 * Soft radial bloom used on hero slides (TitleSlide, AgendaSlide).
 * 6% opacity of ACCENT_COLOR — readable as a brand wash without competing
 * with foreground text. Pure white on other slides.
 */
export const getHeroGradient = (t: Theme) => {
  // blue-700 #1D4ED8 → rgb(29, 78, 216). Keep in sync with ACCENT_COLOR.
  const bloom =
    t === "light"
      ? "rgba(29, 78, 216, 0.06)"
      : "rgba(122, 181, 241, 0.08)"; // dark theme accent with slightly more alpha
  return `radial-gradient(1200px 600px at 50% 0%, ${bloom}, transparent 60%)`;
};
