import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, SECTION } from "../theme";
import { BRAND, CLOSING, INSTITUTION } from "../content";
import { HandDrawnArrow } from "../primitives/HandDrawnArrow";

/** Page 27 — Try It / Closing. Print-native callback to video's ClosingSlide. */
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
        margin: "0 0 42px",
      }}
    >
      {CLOSING.tagline}
    </p>

    {/* Two URLs with hand-drawn arrows pointing at them. */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 20,
        marginTop: 20,
        position: "relative",
      }}
    >
      <UrlBlock
        label={CLOSING.liveLabel}
        url={CLOSING.liveUrl}
        arrowLabel={CLOSING.leftArrowLabel}
        arrowDir="right"
        arrowColor={COLORS.MIAMI_RED}
      />
      <UrlBlock
        label={CLOSING.repoLabel}
        url={CLOSING.repoUrl}
        arrowLabel={CLOSING.rightArrowLabel}
        arrowDir="left"
        arrowColor={SECTION["02_HOW"]}
        align="right"
      />
    </div>

    {/* QR code — lower-right */}
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
      <QRCodeSVG value={BRAND.qrTarget} size={96} level="M" marginSize={0} />
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

    {/* Institutional colophon */}
    <div
      style={{
        position: "absolute",
        left: "0.75in",
        bottom: "1.4in",
        fontFamily: FONTS.MONO,
        fontSize: 8,
        fontWeight: 500,
        letterSpacing: "0.14em",
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
  </BodyPage>
);

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
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.18em",
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
            fontSize: 14,
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
            fontSize: 14,
            color: arrowColor,
          }}
        >
          {arrowLabel}
        </span>
      )}
    </div>
  </div>
);
