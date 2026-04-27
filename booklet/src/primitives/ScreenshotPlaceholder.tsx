import React from "react";
import { COLORS, FONTS } from "../theme";

/**
 * Dashed-border capture region that swaps to a real <img> the moment the
 * user drops a PNG into `booklet/public/screenshots/`. Until then, the
 * component renders the intended-capture description and the expected
 * filename so the photographer knows what to shoot and where to save it.
 *
 * File presence is detected at render time via a tiny <img> onError
 * fallback — no build-time glob, no Playwright, no capture script.
 */
export const ScreenshotPlaceholder: React.FC<{
  /** Bare slug; `phase-03-preprocess` becomes `/screenshots/phase-03-preprocess.png`. */
  slug: string;
  /** Shown inside the dashed region until the file arrives. */
  description: string;
  /** Aspect ratio of the capture, W/H. Phase captures are 4/3 unless overridden. */
  aspectRatio?: number;
  style?: React.CSSProperties;
}> = ({ slug, description, aspectRatio = 4 / 3, style }) => {
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const src = `/screenshots/${slug}.png`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${aspectRatio}`,
        background: COLORS.SURFACE,
        ...style,
      }}
    >
      {/* Probe <img> — drawn over the placeholder once it loads, hidden on error */}
      {!failed && (
        <img
          src={src}
          alt={description}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: loaded ? 1 : 0,
          }}
        />
      )}

      {/* Placeholder — stays under the probe until it loads, then fades out */}
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: `1pt dashed ${COLORS.HAIRLINE_STRONG}`,
            padding: "10pt 14pt",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 8,
            background: COLORS.SURFACE,
          }}
        >
          <div
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 8,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: COLORS.INK_MUTED,
            }}
          >
            PENDING SCREENSHOT
          </div>
          <div
            style={{
              fontFamily: FONTS.SERIF,
              fontStyle: "italic",
              fontSize: 13,
              lineHeight: 1.35,
              color: COLORS.INK_MUTED,
            }}
          >
            {description}
          </div>
          <div
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 8,
              fontWeight: 500,
              letterSpacing: "0.02em",
              color: COLORS.INK_SUBTLE,
            }}
          >
            drop file at <span style={{ color: COLORS.INK }}>public/screenshots/{slug}.png</span>
          </div>
        </div>
      )}
    </div>
  );
};
