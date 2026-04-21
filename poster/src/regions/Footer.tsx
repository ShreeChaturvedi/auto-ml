import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { COLORS, FONTS } from "../tokens";
import { BRAND } from "../content";
import { CombinedLockup } from "../visuals/CombinedLockup";
import { MiamiDivider } from "../visuals/MiamiDivider";

/**
 * 3-inch institutional footer. Three vertically-centered clusters separated
 * by intentional whitespace, capped at the top by the same Miami Red/Tan
 * gradient rule as the header so the band feels closed and deliberate.
 *
 *   LEFT (32%)   big combined lockup + institutional caption
 *   CENTER (38%) ThankYou-slide pattern: serif italic subtitle + provenance
 *                line in the small mono caption color
 *   RIGHT (30%)  red ↗ + underlined mono URL CTA + 200px QR code
 *
 * The center provenance line absorbs what used to be a §2 caption — i.e.
 * `live at agentic-automl.vercel.app · preprocessing phase · captured live
 * with Playwright` — restyled as a quiet attribution beneath the canonical
 * subtitle so the institutional band carries the metadata and the section
 * headlines stay clean.
 */

export const Footer: React.FC = () => (
  <footer
    style={{
      width: "100%",
      height: "3in",
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
    }}
  >
    <MiamiDivider heightPx={2} />
    <div
      style={{
        flex: 1,
        padding: "0.45in 1in 0.55in",
        boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: "32% 38% 30%",
        alignItems: "center",
      }}
    >
      {/* LEFT — institutional lockup */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        <CombinedLockup markSize={64} textSize={34} pipeMargin={28} />
      </div>

      {/* CENTER — serif italic subtitle, poster-scale. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: 48,
            color: COLORS.INK,
            lineHeight: 1.18,
            letterSpacing: "0.005em",
            maxWidth: "14in",
          }}
        >
          {BRAND.subtitle}
        </div>
      </div>

      {/* RIGHT — red ↗ bullet + underlined mono URL (lifted from the video
       *  ThankYouSlide pattern) + QR. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 26,
          justifySelf: "end",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
            textAlign: "right",
          }}
        >
          <div
            style={{
              fontFamily: FONTS.SANS,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: COLORS.INK,
              lineHeight: 1.15,
            }}
          >
            Try it on your dataset
          </div>
          <ThankYouLink url={BRAND.liveUrl} />
          <div
            style={{
              fontFamily: FONTS.SERIF,
              fontStyle: "italic",
              fontSize: 17,
              color: COLORS.INK_MUTED,
              lineHeight: 1.3,
              maxWidth: "3.6in",
            }}
          >
            Dataset to trained model in minutes.
          </div>
        </div>
        <QRCodeSVG
          value={BRAND.qrTarget}
          size={200}
          bgColor={COLORS.PAPER}
          fgColor={COLORS.INK}
          level="H"
          marginSize={2}
        />
      </div>
    </div>
  </footer>
);

/**
 * Lifted verbatim from `video/remotion/scenes/Slide/ThankYouSlide.tsx`'s
 * LinkLine — a Miami-red ↗ bullet next to a tightly-tracked underlined
 * monospace URL. Static (no animation).
 */
const ThankYouLink: React.FC<{ url: string }> = ({ url }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "baseline",
      gap: 12,
    }}
  >
    <span
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 36,
        lineHeight: 1,
        color: COLORS.MIAMI_RED,
        display: "inline-block",
      }}
    >
      ↗
    </span>
    <span
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 26,
        fontWeight: 700,
        color: COLORS.INK,
        letterSpacing: "-0.005em",
        fontVariantNumeric: "tabular-nums",
        textDecorationLine: "underline",
        textDecorationThickness: "1px",
        textUnderlineOffset: "5px",
        textDecorationColor: COLORS.INK,
      }}
    >
      {url}
    </span>
  </div>
);
