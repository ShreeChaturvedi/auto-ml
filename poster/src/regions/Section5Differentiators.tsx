import React from "react";
import { CARD, COLORS, FONTS } from "../tokens";
import { SectionFrame } from "./SectionFrame";
import { AnimatedLogoMark } from "../visuals/AnimatedLogoMark";

/**
 * §5 · THE EDGE — two jobs in one cell.
 *
 * 1. Competitor matrix that ALSO teaches. Expo judges don't already know
 *    what "approval at every tool call" means, so each row pairs the
 *    feature name with a one-line explainer. Our column is tinted Miami
 *    red with white text so it visually dominates the comparison.
 *
 * 2. Safety / human-in-the-loop deep-dive. Two cards below the matrix
 *    show the approval-gate UX (PROPOSE → REVIEW → COMMIT) and the
 *    sandboxed tool execution model (Docker ring + allow-listed tool chips).
 *
 * The cell is 16in × 15in. Below the SectionFrame chrome that leaves
 * roughly 1056 × 820 px for the body, split ~55/45 matrix/safety.
 */

// ---------------------------------------------------------------------------
// Matrix content
// ---------------------------------------------------------------------------

type Tick = "yes" | "partial" | "no";

type FeatureRow = {
  /** Short feature name (bold, ~2-3 words). */
  name: string;
  /** One-line explainer of what the feature actually means. */
  explainer: string;
  /** Tick state for each column (in the header order below). */
  ticks: [Tick, Tick, Tick, Tick, Tick];
};

/**
 * Brand lockup metadata for the matrix column headers. Each column pairs the
 * product name with its real brand mark so judges recognise the comparison
 * targets at a glance instead of parsing five uppercase words.
 *
 * SVG path data for googlecloud / openai / amazonwebservices lifted from
 * simple-icons.org (CC0). The H2O mark is hand-rolled because H2O has no
 * simple-icons entry — a yellow disc with bold "H₂O" text is the closest
 * echo of the h2o.ai favicon.
 */
type BrandColumn = {
  name: string; // two-line text rendered under the mark
  icon: React.ReactNode;
};

const BRAND_ICON_SIZE = 32;

const GOOGLE_CLOUD_PATH =
  "M12.19 2.38a9.344 9.344 0 0 0-9.234 6.893c.053-.02-.055.013 0 0-3.875 2.551-3.922 8.11-.247 10.941l.006-.007-.007.03a6.717 6.717 0 0 0 4.077 1.356h5.173l.03.03h5.192c6.687.053 9.376-8.605 3.835-12.35a9.365 9.365 0 0 0-2.821-4.552l-.043.043.006-.05A9.344 9.344 0 0 0 12.19 2.38zm-.358 4.146c1.244-.04 2.518.368 3.486 1.15a5.186 5.186 0 0 1 1.862 4.078v.518c3.53-.07 3.53 5.262 0 5.193h-5.193l-.008.009v-.04H6.785a2.59 2.59 0 0 1-1.067-.23h.001a2.597 2.597 0 1 1 3.437-3.437l3.013-3.012A6.747 6.747 0 0 0 8.11 8.24c.018-.01.04-.026.054-.023a5.186 5.186 0 0 1 3.67-1.69z";

const AWS_PATH =
  "M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.272-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.383.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z";

const OPENAI_PATH =
  "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z";

const BrandPathIcon: React.FC<{ d: string; color: string; title: string }> = ({
  d,
  color,
  title,
}) => (
  <svg
    width={BRAND_ICON_SIZE}
    height={BRAND_ICON_SIZE}
    viewBox="0 0 24 24"
    fill={color}
    aria-label={title}
    role="img"
  >
    <title>{title}</title>
    <path d={d} />
  </svg>
);

/**
 * Hand-rolled H2O mark — yellow disc (brand yellow #FFE01B, pulled from the
 * h2o.ai visual identity) with bold "H₂O" typography centered inside. Sized
 * to match the other brand icons so the header rhythm stays locked.
 */
const H2OMark: React.FC = () => (
  <svg
    width={BRAND_ICON_SIZE}
    height={BRAND_ICON_SIZE}
    viewBox="0 0 32 32"
    aria-label="H2O"
    role="img"
  >
    <title>H2O</title>
    <circle cx={16} cy={16} r={15} fill="#FFE01B" />
    <text
      x={16}
      y={21}
      textAnchor="middle"
      fontFamily='"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif'
      fontWeight={800}
      fontSize={14}
      letterSpacing="-0.03em"
      fill={COLORS.INK}
    >
      H
      <tspan fontSize={10} dy={2}>
        2
      </tspan>
      <tspan dy={-2}>O</tspan>
    </text>
  </svg>
);

const COLUMNS: readonly BrandColumn[] = [
  {
    name: "Vertex AI\nAutoML",
    icon: (
      <BrandPathIcon
        d={GOOGLE_CLOUD_PATH}
        color="#4285F4"
        title="Google Cloud"
      />
    ),
  },
  {
    name: "AutoGluon",
    icon: <BrandPathIcon d={AWS_PATH} color="#FF9900" title="Amazon Web Services" />,
  },
  {
    name: "H2O\nDriverless",
    icon: <H2OMark />,
  },
  {
    name: "ChatGPT\n+ sklearn",
    icon: <BrandPathIcon d={OPENAI_PATH} color="#10A37F" title="OpenAI" />,
  },
  {
    name: "Agentic AutoML\n(ours)",
    icon: <AnimatedLogoMark size={BRAND_ICON_SIZE} color={COLORS.PAPER} />,
  },
];

const ROWS: FeatureRow[] = [
  {
    name: "Natural-language control",
    explainer: "Describe the pipeline in plain English",
    ticks: ["partial", "no", "no", "yes", "yes"],
  },
  {
    name: "Approval at every tool call",
    explainer: "Agent pauses; a human confirms before any mutation",
    ticks: ["no", "no", "no", "no", "yes"],
  },
  {
    name: "Replayable audit ledger",
    explainer: "Every action logged across 6 Postgres tables",
    ticks: ["partial", "no", "partial", "no", "yes"],
  },
  {
    name: "Live editable notebook",
    explainer: "Inspect and hand-edit the code the agent wrote",
    ticks: ["partial", "partial", "partial", "yes", "yes"],
  },
  {
    name: "Checkpoint reversibility",
    explainer: "Roll back any step, including run state",
    ticks: ["no", "no", "no", "no", "yes"],
  },
  {
    name: "Runs in your environment",
    explainer: "Your infra, your data, no mandatory egress",
    ticks: ["no", "yes", "partial", "yes", "yes"],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Section5Differentiators: React.FC = () => (
  <SectionFrame
    eyebrow="THE EDGE"
    number="§5"
    headline="Competitor analysis."
    footnote={{
      label: "Apr 2026",
      text:
        "Feature inference from public docs: cloud.google.com/vertex-ai, auto.gluon.ai, h2o.ai/driverless-ai and reflect our best understanding.",
    }}
  >
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 24,
        minHeight: 0,
      }}
    >
      <ComparisonMatrix />
      <SafetyRow />
    </div>
  </SectionFrame>
);

// ---------------------------------------------------------------------------
// Matrix — grid of feature rows × product columns.
// ---------------------------------------------------------------------------

// Layout: label column flexes (feature name + explainer pair comfortably
// within ~380px but we let the grid absorb any remaining card width there
// so the five brand columns stay fixed and align precisely with the Miami
// red stripe on the right). Product columns are widened to comfortably host
// the icon+name brand lockups.
const PRODUCT_COL_W = 168;
const OURS_COL_W = 210;
const MATRIX_SIDE_PAD = 24;

const MATRIX_TEMPLATE = `minmax(0, 1fr) repeat(4, ${PRODUCT_COL_W}px) ${OURS_COL_W}px`;

const ComparisonMatrix: React.FC = () => (
  <div
    style={{
      background: CARD.bg,
      border: CARD.border,
      borderRadius: CARD.radius,
      overflow: "hidden",
      position: "relative",
    }}
  >
    {/* Our column background tint — spans the full table so the "ours"
     *  column reads as a single highlighted stripe. The stripe extends to
     *  the card edge (including the right-side padding) so there's no white
     *  gutter between the tick column and the card border. */}
    <div
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: OURS_COL_W + MATRIX_SIDE_PAD,
        background: COLORS.MIAMI_RED,
        zIndex: 0,
      }}
    />

    <div style={{ position: "relative", zIndex: 1 }}>
      <HeaderRow />
      {ROWS.map((row, i) => (
        <DataRow key={row.name} row={row} isLast={i === ROWS.length - 1} />
      ))}
    </div>
  </div>
);

const HeaderRow: React.FC = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: MATRIX_TEMPLATE,
      alignItems: "end",
      padding: `26px ${MATRIX_SIDE_PAD}px 16px`,
      borderBottom: `1px solid ${COLORS.HAIRLINE}`,
    }}
  >
    {/* Empty top-left cell */}
    <div />
    {COLUMNS.map((col, i) => {
      const isOurs = i === COLUMNS.length - 1;
      return (
        <div
          key={col.name}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              height: BRAND_ICON_SIZE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {col.icon}
          </div>
          <div
            style={{
              fontFamily: FONTS.SANS,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.005em",
              color: isOurs ? COLORS.PAPER : COLORS.INK,
              textAlign: "center",
              lineHeight: 1.15,
              whiteSpace: "pre-line",
            }}
          >
            {col.name}
          </div>
        </div>
      );
    })}
  </div>
);

const DataRow: React.FC<{ row: FeatureRow; isLast: boolean }> = ({
  row,
  isLast,
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: MATRIX_TEMPLATE,
      alignItems: "center",
      padding: `14px ${MATRIX_SIDE_PAD}px`,
      borderBottom: isLast ? "none" : `1px solid ${COLORS.HAIRLINE}`,
      minHeight: 58,
    }}
  >
    {/* Feature label + explainer */}
    <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingRight: 16 }}>
      <span
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-0.005em",
          color: COLORS.INK,
          lineHeight: 1.15,
        }}
      >
        {row.name}
      </span>
      <span
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 16,
          fontWeight: 500,
          color: COLORS.INK_MUTED,
          lineHeight: 1.3,
        }}
      >
        {row.explainer}
      </span>
    </div>

    {row.ticks.map((tick, i) => {
      const isOurs = i === row.ticks.length - 1;
      return (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <TickMark state={tick} ours={isOurs} />
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// TickMark — circle glyphs.
//   yes: filled (green, or Miami red in our column) with white ✓
//   partial: amber filled with a small dash (or white dash on red for ours)
//   no: hollow ring with grey × inside
// ---------------------------------------------------------------------------

const TickMark: React.FC<{ state: Tick; ours?: boolean }> = ({ state, ours }) => {
  const size = 34;

  if (state === "yes") {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          background: COLORS.SUCCESS,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CheckGlyph color={COLORS.PAPER} />
      </div>
    );
  }

  if (state === "partial") {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          background: ours ? COLORS.PAPER : COLORS.AMBER,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={14} height={3} viewBox="0 0 14 3" aria-hidden>
          <rect
            x={0}
            y={0}
            width={14}
            height={3}
            rx={1.5}
            fill={ours ? COLORS.MIAMI_RED : COLORS.PAPER}
          />
        </svg>
      </div>
    );
  }

  // "no" — hollow ring with ×
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        border: `1.5px solid ${COLORS.INK_SUBTLE}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
      }}
    >
      <XGlyph color={COLORS.INK_SUBTLE} />
    </div>
  );
};

const CheckGlyph: React.FC<{ color: string }> = ({ color }) => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M3.5 8.5 L6.8 11.5 L12.5 5"
      stroke={color}
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const XGlyph: React.FC<{ color: string }> = ({ color }) => (
  <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M3 3 L9 9 M9 3 L3 9" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);

// ---------------------------------------------------------------------------
// Safety row — two cards side-by-side.
// ---------------------------------------------------------------------------

const SafetyRow: React.FC = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
      flex: 1,
      minHeight: 0,
    }}
  >
    <ApprovalGateCard />
    <SandboxCard />
  </div>
);

// ---------------------------------------------------------------------------
// Card chrome — shared shell for both safety cards.
// ---------------------------------------------------------------------------

const SafetyCard: React.FC<{
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  stats: string;
}> = ({ eyebrow, title, children, stats }) => (
  <div
    style={{
      background: CARD.bg,
      border: CARD.border,
      borderRadius: CARD.radius,
      padding: 20,
      display: "flex",
      flexDirection: "column",
      gap: 14,
      minHeight: 0,
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: COLORS.MIAMI_RED,
          lineHeight: 1,
        }}
      >
        {eyebrow}
      </span>
      <span
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: COLORS.INK,
          lineHeight: 1.2,
        }}
      >
        {title}
      </span>
    </div>

    <div style={{ flex: 1, display: "flex", alignItems: "center", minHeight: 0 }}>
      {children}
    </div>

    <div
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 14,
        fontWeight: 600,
        color: COLORS.INK_MUTED,
        letterSpacing: "-0.005em",
        lineHeight: 1.35,
        borderTop: `1px solid ${COLORS.HAIRLINE}`,
        paddingTop: 10,
      }}
    >
      {stats}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Card A — Approval gate. A mini sequence diagram:
//   PROPOSE → REVIEW (with tiny diff preview) → COMMIT
// ---------------------------------------------------------------------------

const ApprovalGateCard: React.FC = () => (
  <SafetyCard
    eyebrow="APPROVAL GATE"
    title="Human in the loop, at every step."
    stats="100% of tool calls gated  ·  0 silent state mutations  ·  any step undoable"
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 28px auto 28px auto",
        alignItems: "center",
        gap: 0,
        width: "100%",
      }}
    >
      <StageNode label="PROPOSE" sub="agent" color={COLORS.ACCENT} />
      <Arrow color={COLORS.INK_MUTED} />
      <ReviewNode />
      <Arrow color={COLORS.INK_MUTED} />
      <StageNode label="COMMIT" sub="ledger" color={COLORS.SUCCESS} />
    </div>
  </SafetyCard>
);

const StageNode: React.FC<{ label: string; sub: string; color: string }> = ({
  label,
  sub,
  color,
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      padding: "12px 14px",
      border: `1.5px solid ${color}`,
      borderRadius: 10,
      background: COLORS.PAPER,
      minWidth: 110,
    }}
  >
    <span
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color,
        lineHeight: 1,
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 13,
        fontWeight: 500,
        color: COLORS.INK_MUTED,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        lineHeight: 1,
      }}
    >
      {sub}
    </span>
  </div>
);

const Arrow: React.FC<{ color: string }> = ({ color }) => (
  <svg
    width={28}
    height={14}
    viewBox="0 0 28 14"
    fill="none"
    aria-hidden
    style={{ display: "block", margin: "0 auto" }}
  >
    <path d="M2 7 H22" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    <path
      d="M18 3 L23 7 L18 11"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

/** Review stage — center node containing a tiny diff preview. */
const ReviewNode: React.FC = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      padding: "10px 12px",
      border: `2px solid ${COLORS.MIAMI_RED}`,
      borderRadius: 10,
      background: COLORS.PAPER,
      boxShadow: `0 0 0 4px ${COLORS.MIAMI_RED_TINT}`,
      minWidth: 180,
    }}
  >
    <span
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: COLORS.MIAMI_RED,
        lineHeight: 1,
      }}
    >
      REVIEW
    </span>
    {/* Tiny diff preview */}
    <div
      style={{
        width: "100%",
        border: `1px solid ${COLORS.HAIRLINE}`,
        borderRadius: 6,
        overflow: "hidden",
        background: COLORS.PAPER,
      }}
    >
      <DiffLine gutter="-" code="df = df.dropna()" tone="remove" />
      <DiffLine gutter="+" code="df = df.fillna(0)" tone="add" />
      <DiffLine gutter="+" code="df['age'] = df.age.astype(int)" tone="add" />
    </div>
    <span
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 13,
        fontWeight: 500,
        color: COLORS.INK_MUTED,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        lineHeight: 1,
      }}
    >
      user
    </span>
  </div>
);

const DiffLine: React.FC<{
  gutter: "+" | "-";
  code: string;
  tone: "add" | "remove";
}> = ({ gutter, code, tone }) => {
  const bg =
    tone === "add" ? COLORS.SUCCESS_TINT : COLORS.DANGER_TINT;
  const gutterColor = tone === "add" ? COLORS.SUCCESS : COLORS.DANGER;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "16px 1fr",
        background: bg,
        padding: "2px 0",
      }}
    >
      <span
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 11,
          fontWeight: 700,
          color: gutterColor,
          textAlign: "center",
          lineHeight: 1.35,
        }}
      >
        {gutter}
      </span>
      <span
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 11,
          fontWeight: 500,
          color: COLORS.INK,
          lineHeight: 1.35,
          letterSpacing: "0",
          paddingRight: 8,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {code}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Card B — Sandbox. Outer Docker container ring with a lock icon, inside
// a grid of allow-listed tool chips.
// ---------------------------------------------------------------------------

const ALLOW_LISTED_TOOLS = [
  "pandas.read_csv",
  "df.describe",
  "train_test_split",
  "fit_transform",
  "LogisticRegression",
  "RandomForest",
  "xgboost.train",
  "evaluate_model",
  "plot_confusion",
  "save_checkpoint",
];

const CHIP_STYLE: React.CSSProperties = {
  fontFamily: FONTS.MONO,
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.INK,
  background: COLORS.PAPER,
  border: `1px solid ${COLORS.HAIRLINE}`,
  borderRadius: 4,
  padding: "4px 9px",
  whiteSpace: "nowrap",
  lineHeight: 1.2,
};

const SandboxCard: React.FC = () => (
  <SafetyCard
    eyebrow="SANDBOX"
    title="Every tool runs inside a locked container."
    stats="34 allow-listed tools  ·  0 direct shell access  ·  Docker-isolated kernel"
  >
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: 180,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        border: `2px dashed ${COLORS.ACCENT}`,
        borderRadius: 14,
        padding: "26px 18px 16px",
        background: COLORS.ACCENT_TINT,
      }}
    >
      {/* Docker whale + container label, sitting on the top-left of the
       *  border. Icon is sized to match the cap-height of the label. */}
      <div
        style={{
          position: "absolute",
          top: -16,
          left: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: COLORS.PAPER_ELEVATED,
          padding: "3px 14px 3px 10px",
          border: `1px solid ${COLORS.ACCENT}`,
          borderRadius: 999,
        }}
      >
        <DockerWhaleIcon color={COLORS.ACCENT} />
        <span
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: "-0.005em",
            color: COLORS.ACCENT,
            lineHeight: 1.1,
          }}
        >
          Docker container
        </span>
      </div>

      {/* Tool chip cluster */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
          alignContent: "center",
        }}
      >
        {ALLOW_LISTED_TOOLS.map((tool) => (
          <span key={tool} style={CHIP_STYLE}>
            {tool}
          </span>
        ))}
        {/* Ellipsis chip — styled identically to the tool chips so the
         *  visual rhythm holds; semantic meaning: "more tools follow". */}
        <span
          style={{
            ...CHIP_STYLE,
            color: COLORS.INK_MUTED,
            letterSpacing: "0.08em",
          }}
          aria-label="24 more tools"
        >
          {"\u2026"}
        </span>
      </div>
    </div>
  </SafetyCard>
);

/**
 * Official Docker whale mark ("Moby Dock"). Inlined from the simple-icons
 * SVG (https://simpleicons.org/icons/docker.svg, MIT-licensed), which is
 * the same path published on the Docker brand page and Wikipedia. The
 * whale silhouette carries six stacked "container" cubes on its back.
 *
 * Rendered in COLORS.ACCENT so it matches the rest of the sandbox chrome.
 */
const DockerWhaleIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg
    width={28}
    height={21}
    viewBox="0 0 24 24"
    fill={color}
    aria-hidden
    style={{ flexShrink: 0 }}
  >
    <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z" />
  </svg>
);
