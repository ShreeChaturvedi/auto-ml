import React from "react";
import { COLORS, FONTS } from "../tokens";

/**
 * Product mockup — a poster-grade screenshot of the live product taken
 * with Playwright via `npm run capture` in this workspace. The PNG lives
 * at `/captures/preprocess.png` (2400×1500 native). We wrap it in a
 * lightweight browser chrome so the poster reads the way a screenshot of
 * the running app would.
 *
 * The capture script (`scripts/capture-product-ui.mjs`) drives the
 * frontend's `/dev/landing-preview?preset=preprocess` route, advances the
 * scenario to a frame where the agent has already proposed a tool-call
 * cluster and the notebook diff is visible, then snaps a single PNG.
 */

const URL_LABEL = "agentic-automl.vercel.app/p/novacraft/training";

export const ProductMockup: React.FC<{
  width: number;
  height: number;
  /** Image src under /public — defaults to the training capture. */
  src?: string;
}> = ({ width, height, src = "/captures/training.png" }) => {
  const chromeH = 44;
  const innerH = height - chromeH;
  return (
    <div
      style={{
        width,
        height,
        background: COLORS.PAPER_ELEVATED,
        border: `1.5px solid ${COLORS.HAIRLINE_STRONG}`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 12px 32px rgba(23, 23, 23, 0.10)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <BrowserChrome heightPx={chromeH} url={URL_LABEL} />
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <img
          src={src}
          alt="Live preprocess phase of the Agentic AutoML platform"
          style={{
            width: "100%",
            height: innerH,
            display: "block",
            objectFit: "cover",
            objectPosition: "top center",
          }}
        />
      </div>
    </div>
  );
};

const BrowserChrome: React.FC<{ heightPx: number; url: string }> = ({
  heightPx,
  url,
}) => (
  <div
    style={{
      height: heightPx,
      flexShrink: 0,
      background: "#F4F4F5",
      borderBottom: `1px solid ${COLORS.HAIRLINE}`,
      display: "flex",
      alignItems: "center",
      padding: "0 16px",
      gap: 14,
    }}
  >
    {/* Traffic-light dots */}
    <div style={{ display: "flex", gap: 7 }}>
      <Dot color="#FF5F56" />
      <Dot color="#FFBD2E" />
      <Dot color="#27C93F" />
    </div>
    <div
      style={{
        flex: 1,
        height: 26,
        background: COLORS.PAPER,
        border: `1px solid ${COLORS.HAIRLINE}`,
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        fontFamily: FONTS.MONO,
        fontSize: 14,
        color: COLORS.INK_MUTED,
        letterSpacing: "0.01em",
      }}
    >
      <LockIcon />
      <span style={{ marginLeft: 8 }}>{url}</span>
    </div>
  </div>
);

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span
    style={{
      width: 12,
      height: 12,
      borderRadius: "50%",
      background: color,
      display: "block",
    }}
  />
);

const LockIcon: React.FC = () => (
  <svg
    viewBox="0 0 16 16"
    width={14}
    height={14}
    fill="none"
    aria-hidden="true"
    style={{ color: COLORS.INK_MUTED }}
  >
    <rect x={3} y={7} width={10} height={6.5} rx={1.4} stroke="currentColor" strokeWidth={1.4} />
    <path d="M5.2 7V5.2a2.8 2.8 0 1 1 5.6 0V7" stroke="currentColor" strokeWidth={1.4} fill="none" strokeLinecap="round" />
  </svg>
);
