import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { BRAND, CLOSING, INSTITUTION } from "../content";
import { HandDrawnArrow } from "../primitives/HandDrawnArrow";
import { AMark3D } from "../visuals/AMark3D";

/** Page 27 — Try It / Closing. Print-native book-end to the video's ClosingSlide. */
export const ClosingPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => (
  <BodyPage
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel="CLOSING"
    sectionColor={COLORS.INK}
    eyebrow="END"
    headline="Try it."
    headlineSize="h1"
  >
    <p
      style={{
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 22,
        lineHeight: 1.25,
        color: COLORS.INK,
        maxWidth: "6in",
        margin: "0 0 6px",
      }}
    >
      {CLOSING.tagline}
    </p>

    {/* Mono micro-annotation under the tagline — small-caps punctuation
        that echoes the eyebrow voice. */}
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: COLORS.INK_SUBTLE,
        margin: "0 0 30px",
      }}
    >
      one platform · six phases · your notebook
    </div>

    {/* Two URLs — side by side, arrows pointing at them. */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 20,
        marginTop: 10,
        position: "relative",
      }}
    >
      <div style={{ position: "relative" }}>
        <UrlBlock
          label={CLOSING.liveLabel}
          url={CLOSING.liveUrl}
          arrowLabel={CLOSING.leftArrowLabel}
          arrowDir="right"
          arrowColor={COLORS.MIAMI_RED}
        />
        {/* Small "START HERE" annotation pointing up-right at the URL. */}
        <StartHereMark />
      </div>
      <UrlBlock
        label={CLOSING.repoLabel}
        url={CLOSING.repoUrl}
        arrowLabel={CLOSING.rightArrowLabel}
        arrowDir="left"
        arrowColor={SECTION["02_HOW"]}
        align="right"
      />
    </div>

    {/* Geometric flourish — a measured rule with a centered diamond,
        echoes the book's construction-line vocabulary. */}
    <GeometricFlourish />

    {/* ------------------------------------------------------------------ */}
    {/* HERO: 3D A mark set inside a large topographic halo — the book's    */}
    {/* closing sculptural element, matching frame-0 of the video intro.    */}
    {/* ------------------------------------------------------------------ */}
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "4.7in",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 340,
          height: 340,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TopographicHalo size={340} />
        {/* Measurement corners — tick marks on the bounding box,
            a printed-engineering-drawing accent. */}
        <CornerTicks size={340} />
        <div style={{ position: "relative" }}>
          <AMark3D width={272} height={272} color={COLORS.INK} />
        </div>
        {/* Mono caption under the mark — sits INSIDE the halo bounds so
            it doesn't collide with the QR code. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 16,
            textAlign: "center",
            fontFamily: FONTS.MONO,
            fontSize: 8,
            fontWeight: 500,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: COLORS.INK_SUBTLE,
          }}
        >
          fig. a — the mark, pre-assembly
        </div>
      </div>
    </div>

    {/* QR code — lower-right, unchanged. */}
    <div
      style={{
        position: "absolute",
        right: "0.75in",
        bottom: "1.4in",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <QRCodeSVG value={BRAND.qrTarget} size={115} level="M" marginSize={0} />
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 7,
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: COLORS.INK_MUTED,
        }}
      >
        scan to launch
      </div>
    </div>

    {/* Institutional colophon — bottom-left. */}
    <div
      style={{
        position: "absolute",
        left: "0.75in",
        bottom: "1.4in",
        fontFamily: FONTS.MONO,
        fontSize: TYPE.eyebrow.size,
        fontWeight: 500,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: COLORS.INK_SUBTLE,
        lineHeight: 1.5,
        maxWidth: "3in",
      }}
    >
      {INSTITUTION.university}
      <br />
      {INSTITUTION.course} · {INSTITUTION.track} · {INSTITUTION.year}
    </div>

    {/* End-of-article fleuron — above the colophon row, centered. */}
    <EndMark />

    {/* Whole-page grain overlay — mirrors CoverTerrain's feTurbulence
        recipe at lower opacity so body text stays crisp. */}
    <GrainOverlay />
  </BodyPage>
);

/* -------------------------------------------------------------------------- */

const UrlBlock: React.FC<{
  label: string;
  url: string;
  arrowLabel: string;
  arrowDir: "left" | "right";
  arrowColor: string;
  align?: "left" | "right";
}> = ({ label, url, arrowLabel, arrowDir, arrowColor, align = "left" }) => (
  <div style={{ textAlign: align }}>
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: TYPE.eyebrow.size,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 18,
        fontWeight: 600,
        color: COLORS.INK,
        marginTop: 2,
        letterSpacing: "-0.01em",
      }}
    >
      {url}
    </div>
    <div
      style={{
        marginTop: 10,
        display: "flex",
        alignItems: "center",
        gap: 10,
        justifyContent: align === "right" ? "flex-end" : "flex-start",
      }}
    >
      {align === "right" && (
        <span
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: TYPE.subheadSmall.size,
            lineHeight: TYPE.subheadSmall.lh,
            color: arrowColor,
          }}
        >
          {arrowLabel}
        </span>
      )}
      <HandDrawnArrow
        direction={arrowDir}
        width={120}
        height={20}
        color={arrowColor}
      />
      {align === "left" && (
        <span
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: TYPE.subheadSmall.size,
            lineHeight: TYPE.subheadSmall.lh,
            color: arrowColor,
          }}
        >
          {arrowLabel}
        </span>
      )}
    </div>
  </div>
);

/* ---- Decorative sub-components ------------------------------------------ */

/** Faint concentric topographic rings — echoes the cover's contour art. */
const TopographicHalo: React.FC<{ size: number }> = ({ size }) => {
  const c = size / 2;
  // Concentric rings with gradually fading opacity.
  const rings = [0.96, 0.82, 0.68, 0.54, 0.40, 0.26].map((t, i) => ({
    r: (size / 2) * t,
    opacity: 0.14 - i * 0.015,
    strokeWidth: i === 0 ? 0.9 : 0.6,
  }));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="halo-fade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={COLORS.INK} stopOpacity="0.07" />
          <stop offset="70%" stopColor={COLORS.INK} stopOpacity="0.02" />
          <stop offset="100%" stopColor={COLORS.INK} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Soft radial wash. */}
      <circle cx={c} cy={c} r={size / 2} fill="url(#halo-fade)" />
      {/* Contour rings. */}
      {rings.map((ring) => (
        <circle
          key={ring.r}
          cx={c}
          cy={c}
          r={ring.r}
          fill="none"
          stroke={COLORS.INK}
          strokeOpacity={ring.opacity}
          strokeWidth={ring.strokeWidth}
        />
      ))}
      {/* Apex-bias ring — slightly thicker to echo the cover's peak. */}
      <circle
        cx={c}
        cy={c - 4}
        r={size * 0.17}
        fill="none"
        stroke={COLORS.INK}
        strokeOpacity={0.28}
        strokeWidth={1.1}
      />
    </svg>
  );
};

/** Four L-shaped engineering-drawing corner ticks on the bounding box. */
const CornerTicks: React.FC<{ size: number }> = ({ size }) => {
  const gap = 8;
  const len = 16;
  const c = COLORS.INK_SUBTLE;
  const Corner: React.FC<{ dx: number; dy: number; kx: number; ky: number }> = ({
    dx,
    dy,
    kx,
    ky,
  }) => (
    <g stroke={c} strokeWidth={0.7} strokeLinecap="round" fill="none">
      <line x1={dx} y1={dy} x2={dx + len * kx} y2={dy} />
      <line x1={dx} y1={dy} x2={dx} y2={dy + len * ky} />
      <circle cx={dx} cy={dy} r={1.2} fill={c} stroke="none" />
    </g>
  );
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden="true"
    >
      <Corner dx={gap}        dy={gap}        kx={1}  ky={1}  />
      <Corner dx={size - gap} dy={gap}        kx={-1} ky={1}  />
      <Corner dx={gap}        dy={size - gap} kx={1}  ky={-1} />
      <Corner dx={size - gap} dy={size - gap} kx={-1} ky={-1} />
    </svg>
  );
};

/** "START HERE" mono tag with a short curved arrow pointing up-right. */
const StartHereMark: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: "calc(100% + 12px)",
      display: "flex",
      alignItems: "center",
      gap: 6,
    }}
  >
    <svg width={30} height={22} viewBox="0 0 30 22" aria-hidden="true">
      <path
        d="M 2 20 C 6 14, 12 8, 22 4"
        fill="none"
        stroke={COLORS.MIAMI_RED}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <path
        d="M 22 4 L 16 4 M 22 4 L 22 10"
        fill="none"
        stroke={COLORS.MIAMI_RED}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </svg>
    <span
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: COLORS.MIAMI_RED,
      }}
    >
      start here
    </span>
  </div>
);

/** Horizontal rule with a centered diamond + bookending dots. */
const GeometricFlourish: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: "0.75in",
      right: "0.75in",
      top: "4.25in",
      display: "flex",
      alignItems: "center",
      gap: 10,
      pointerEvents: "none",
    }}
    aria-hidden="true"
  >
    <span
      style={{
        flex: 1,
        height: 1,
        background: `linear-gradient(to right, transparent, ${COLORS.HAIRLINE} 25%, ${COLORS.HAIRLINE} 75%, transparent)`,
      }}
    />
    <svg width={34} height={10} viewBox="0 0 34 10">
      <circle cx={4}  cy={5} r={1.3} fill={COLORS.INK_SUBTLE} />
      <polygon
        points="17,1 22,5 17,9 12,5"
        fill={COLORS.INK_MUTED}
        stroke="none"
      />
      <circle cx={30} cy={5} r={1.3} fill={COLORS.INK_SUBTLE} />
    </svg>
    <span
      style={{
        flex: 1,
        height: 1,
        background: `linear-gradient(to right, transparent, ${COLORS.HAIRLINE} 25%, ${COLORS.HAIRLINE} 75%, transparent)`,
      }}
    />
  </div>
);

/** Fleuron / end-of-article mark — compact row of typographic accents. */
const EndMark: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "0.85in",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      pointerEvents: "none",
    }}
    aria-hidden="true"
  >
    <svg width={72} height={14} viewBox="0 0 72 14">
      <circle cx={8}  cy={7} r={1.6} fill={COLORS.INK} opacity={0.3} />
      <line   x1={16} y1={7} x2={26} y2={7}
              stroke={COLORS.INK} strokeOpacity={0.3} strokeWidth={0.8} />
      <rect   x={32}  y={3}  width={8}  height={8}
              transform="rotate(45 36 7)" fill={COLORS.INK} opacity={0.85} />
      <line   x1={46} y1={7} x2={56} y2={7}
              stroke={COLORS.INK} strokeOpacity={0.3} strokeWidth={0.8} />
      <circle cx={64} cy={7} r={1.6} fill={COLORS.INK} opacity={0.3} />
    </svg>
  </div>
);

/** Subtle page-wide grain overlay using feTurbulence. Mirrors CoverTerrain's
 *  recipe at a dialed-down alpha so body text stays crisp. Pointer-events off. */
const GrainOverlay: React.FC = () => (
  <svg
    aria-hidden="true"
    style={{
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      opacity: 0.35,
    }}
  >
    <defs>
      <filter id="closing-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="1.6"
          numOctaves={2}
          stitchTiles="stitch"
          seed={7}
        />
        <feColorMatrix
          values="0 0 0 0 0.09
                  0 0 0 0 0.09
                  0 0 0 0 0.09
                  0 0 0 0.06 0"
        />
      </filter>
    </defs>
    <rect width="100%" height="100%" filter="url(#closing-grain)" />
  </svg>
);
