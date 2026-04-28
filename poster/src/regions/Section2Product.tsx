import React from "react";
import { COLORS, FONTS, TYPE, hexWithAlpha } from "../tokens";
import { ProductMockup } from "../visuals/ProductMockup";
import { SectionFrame } from "./SectionFrame";

// ---------------------------------------------------------------------------
// Capability card — mirrors the §1 Problem fact-strip pattern (icon + colored
// numeral + uppercase unit + muted description) so the three capability
// cards read as part of the same visual language. Colored numbers borrow the
// §4 Results palette (red / blue / green) for cross-section rhythm.
// ---------------------------------------------------------------------------

type Capability = {
  value: string;
  unit: string;
  description: string;
  color: string;
  icon: React.ReactNode;
};

const iconProps = (color: string): React.SVGAttributes<SVGElement> => ({
  width: 36,
  height: 36,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth: 2.25,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

// lucide: wrench
const IconWrench: React.FC<{ color: string }> = ({ color }) => (
  <svg {...iconProps(color)} aria-hidden>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

// lucide: file-code-2 (Monaco + Jupyter)
const IconFileCode: React.FC<{ color: string }> = ({ color }) => (
  <svg {...iconProps(color)} aria-hidden>
    <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="m5 12-3 3 3 3" />
    <path d="m9 18 3-3-3-3" />
  </svg>
);

// lucide: database (Postgres audit ledger)
const IconDatabase: React.FC<{ color: string }> = ({ color }) => (
  <svg {...iconProps(color)} aria-hidden>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    <path d="M3 12a9 3 0 0 0 18 0" />
  </svg>
);

const CAPABILITIES: Capability[] = [
  {
    value: "34",
    unit: "tools",
    description: "Per-stage allowlist · every call explicitly approved",
    color: COLORS.MIAMI_RED,
    icon: <IconWrench color={COLORS.MIAMI_RED} />,
  },
  {
    value: "2",
    unit: "editors",
    description: "Monaco & Jupyter kernel · live WebSocket diff · reversible",
    color: COLORS.ACCENT,
    icon: <IconFileCode color={COLORS.ACCENT} />,
  },
  {
    value: "6",
    unit: "ledger tables",
    description: "Postgres audit log · every turn replayable",
    color: COLORS.SUCCESS,
    icon: <IconDatabase color={COLORS.SUCCESS} />,
  },
];

const CapabilityCard: React.FC<{ cap: Capability; showDivider: boolean }> = ({
  cap,
  showDivider,
}) => (
  <div
    style={{
      display: "flex",
      gap: 16,
      alignItems: "flex-start",
      paddingTop: 10,
      paddingRight: 16,
      paddingLeft: showDivider ? 16 : 0,
      borderLeft: showDivider ? `1px solid ${COLORS.HAIRLINE}` : "none",
    }}
  >
    <div
      style={{
        width: 52,
        height: 52,
        flexShrink: 0,
        borderRadius: 10,
        background: hexWithAlpha(cap.color, 0.1),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {cap.icon}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 52,
            fontWeight: 700,
            color: cap.color,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.03em",
            lineHeight: 0.95,
          }}
        >
          {cap.value}
        </span>
        <span
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 16,
            fontWeight: 700,
            color: COLORS.INK,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {cap.unit}
        </span>
      </div>
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 15,
          fontWeight: 500,
          color: COLORS.INK_MUTED,
          lineHeight: 1.35,
        }}
      >
        {cap.description}
      </div>
    </div>
  </div>
);

/**
 * §2 · PRODUCT — one polished light-mode mockup of the running product,
 * showing a real preprocessing turn: tool calls, notebook diff, approval
 * gate. The screenshot is real (Playwright capture of /dev/landing-preview).
 */

export const Section2Product: React.FC = () => (
  <SectionFrame
    eyebrow="THE PRODUCT"
    number="§2"
    headline="An agent you can approve."
    footnote={{
      label: "Screenshot",
      text: "Training phase, captured live from agentic-automl.vercel.app via Playwright",
    }}
  >
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 22,
        paddingBottom: 4,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: TYPE.leadBody.size,
          fontWeight: TYPE.leadBody.weight,
          color: COLORS.INK,
          letterSpacing: TYPE.leadBody.tracking,
          lineHeight: TYPE.leadBody.lh,
        }}
      >
        Each turn is a{" "}
        <strong style={{ color: COLORS.ACCENT_DEEP, fontWeight: 700 }}>
          tool-call cluster
        </strong>{" "}
        the agent asks you to sign off on —{" "}
        <em style={{ fontStyle: "italic", fontFamily: FONTS.SERIF, fontSize: 34 }}>
          every design choice on the record
        </em>
        , reversible from a checkpoint.
      </div>

      {/* The real product screenshot. Native PNG is 2400×1500 so the
       *  640px-tall render is roughly 1.7× oversampled and stays crisp. */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ProductMockup width={1330} height={680} />
      </div>

      {/* Three capability cards — same icon + colored numeral + unit + label
       *  rhythm the §1 Problem fact strip uses, so the poster reads as one
       *  visual language. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 0,
          paddingTop: 4,
          borderTop: `1px solid ${COLORS.HAIRLINE}`,
        }}
      >
        {CAPABILITIES.map((cap, i) => (
          <CapabilityCard key={cap.unit} cap={cap} showDivider={i > 0} />
        ))}
      </div>
    </div>
  </SectionFrame>
);
