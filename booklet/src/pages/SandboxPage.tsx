import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { INSIDE } from "../content";
import { SandboxArchitecture } from "../diagrams/SandboxArchitecture";
import { ApprovalGateCallout } from "../primitives/ApprovalGateCallout";

/**
 * Page 19 — sandbox & kernel.
 *
 * Hero: the architecture cross-section. Supporting rails extend the page
 * without contesting the diagram's focal weight:
 *   · left column  — "what we catch", five AST-shaped violation exemplars
 *                    taken from the real egress/syscall allow-list policy.
 *   · right column — a horizontal lifecycle band (spawn → pre-warm →
 *                    execute → checkpoint → cleanup) with wall-clock
 *                    annotations, capped by the cold-start stat so the
 *                    column's gravity matches the side-rail's height.
 * The approval-gate callout remains the footer — the third and last
 * instance of that primitive in the book.
 */

// ---------------------------------------------------------------------------
// What-we-catch exemplars — each row is (source line, verdict, reason).
// Grounded in the product's real allow-list: stdlib subprocess is blocked;
// os.environ reads of shell secrets are blocked; torch is on the ML
// whitelist; outbound network is egress-filtered; arbitrary exec is denied.
// ---------------------------------------------------------------------------

type CatchRow = {
  snippet: string;
  verdict: "BLOCKED" | "ALLOWED";
  reason: string;
};

const CATCH_ROWS: ReadonlyArray<CatchRow> = [
  { snippet: "subprocess.call([...])",      verdict: "BLOCKED", reason: "syscall denylist"     },
  { snippet: "os.getenv(\"SECRET_KEY\")",   verdict: "BLOCKED", reason: "env whitelist"        },
  { snippet: "requests.get(\"https://…\")", verdict: "BLOCKED", reason: "egress filter"        },
  { snippet: "open(\"/etc/passwd\", \"w\")", verdict: "BLOCKED", reason: "read-only rootfs"    },
  { snippet: "import torch",                verdict: "ALLOWED", reason: "ML lib whitelist"     },
  { snippet: "df.groupby(\"age\").mean()",  verdict: "ALLOWED", reason: "pandas · pure-python" },
];

// ---------------------------------------------------------------------------
// Kernel lifecycle — five stages left-to-right. Timing values come from the
// benchmark harness (N=25 runs, p50). The first three run inside the
// container boot budget; the last two straddle post-execute cleanup.
// ---------------------------------------------------------------------------

type LifecycleStage = {
  label: string;
  ms: string;
  kind: "boot" | "run" | "end";
};

const LIFECYCLE: ReadonlyArray<LifecycleStage> = [
  { label: "spawn",   ms: "~280 ms", kind: "boot" },
  { label: "prewarm", ms: "~520 ms", kind: "boot" },
  { label: "execute", ms: "~120 ms", kind: "run"  },
  { label: "commit",  ms: "~40 ms",  kind: "end"  },
  { label: "cleanup", ms: "~60 ms",  kind: "end"  },
];

export const SandboxPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => (
  <BodyPage
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel="INSIDE"
    sectionColor={SECTION["03_INSIDE"]}
    eyebrow="§03 · INSIDE · THE RUNTIME UNLOCK"
    headline={INSIDE.sandbox.headline}
  >
    <p
      style={{
        fontFamily: FONTS.SANS,
        fontSize: TYPE.body.size,
        fontWeight: TYPE.body.weight,
        letterSpacing: TYPE.body.tracking,
        lineHeight: TYPE.body.lh,
        color: COLORS.INK,
        maxWidth: "5.5in",
        margin: "0 0 14px",
      }}
    >
      {INSIDE.sandbox.body}
    </p>

    {/* Architecture diagram — the hero. Height trimmed from the original
        4.6in so the two supporting rails below have room to breathe
        without the page feeling bottom-heavy. */}
    <div
      style={{
        width: "100%",
        height: "3.75in",
        background: COLORS.PAPER_ELEVATED,
        border: `0.75pt solid ${COLORS.HAIRLINE}`,
        borderRadius: 6,
        padding: 10,
        boxSizing: "border-box",
      }}
    >
      <SandboxArchitecture width={600} height={400} />
    </div>

    {/* Two-column supporting rail — catches on the left, lifecycle on
        the right. The grid gap matches the book's 0.25in gutter token. */}
    <div
      style={{
        marginTop: 12,
        display: "grid",
        gridTemplateColumns: "1.15fr 1fr",
        gap: 14,
        alignItems: "stretch",
      }}
    >
      <CatchSideRail rows={CATCH_ROWS} />
      <LifecycleColumn stages={LIFECYCLE} />
    </div>

    {/* Approval-gate callout — the third and final instance in the book. */}
    <div style={{ marginTop: 12 }}>
      <ApprovalGateCallout>
        {INSIDE.sandbox.approvalGate}
      </ApprovalGateCallout>
    </div>
  </BodyPage>
);

// ---------------------------------------------------------------------------
// Side-rail: "WHAT WE CATCH". Each row renders the attempted call in
// Monaspace, a colored verdict chip (red BLOCKED / green ALLOWED), and a
// muted reason. Layout is a 3-column sub-grid so snippets left-align and
// chips right-align regardless of line length.
// ---------------------------------------------------------------------------

const CatchSideRail: React.FC<{ rows: ReadonlyArray<CatchRow> }> = ({ rows }) => (
  <div
    style={{
      border: `0.5pt solid ${COLORS.HAIRLINE}`,
      borderLeft: `2pt solid ${COLORS.MIAMI_RED}`,
      background: COLORS.PAPER_ELEVATED,
      borderRadius: 3,
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: 2,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: TYPE.eyebrow.size,
          fontWeight: 700,
          letterSpacing: TYPE.eyebrow.tracking,
          textTransform: "uppercase",
          color: COLORS.INK,
          lineHeight: 1,
        }}
      >
        What we catch
      </div>
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 8,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.INK_SUBTLE,
          lineHeight: 1,
        }}
      >
        sample policy trace
      </div>
    </div>
    {rows.map((row) => (
      <CatchRowItem key={row.snippet} row={row} />
    ))}
  </div>
);

const CatchRowItem: React.FC<{ row: CatchRow }> = ({ row }) => {
  const blocked = row.verdict === "BLOCKED";
  const chipBg = blocked ? COLORS.DANGER_TINT : COLORS.SUCCESS_TINT;
  const chipColor = blocked ? COLORS.DANGER : COLORS.SUCCESS;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 8,
        paddingTop: 4,
        borderTop: `0.25pt dotted ${COLORS.HAIRLINE}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 9.5,
            fontWeight: 500,
            color: COLORS.INK,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: "0",
          }}
        >
          {row.snippet}
        </div>
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 8,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: COLORS.INK_SUBTLE,
            lineHeight: 1.2,
            marginTop: 1,
          }}
        >
          {row.reason}
        </div>
      </div>
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: chipColor,
          background: chipBg,
          padding: "3px 7px",
          borderRadius: 2,
          whiteSpace: "nowrap",
        }}
      >
        {row.verdict}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Right column: horizontal kernel lifecycle band + cold-start stat. The
// band is 5 equal cells separated by a running hairline; each cell shows a
// stage label, ms annotation, and a small colored dot keyed by kind (boot
// vs run vs end). Below the band, a single tier-style readout: the
// boot budget and steady-state per-cell cost, so the page lands on a
// number rather than a diagram.
// ---------------------------------------------------------------------------

const LifecycleColumn: React.FC<{ stages: ReadonlyArray<LifecycleStage> }> = ({
  stages,
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}
  >
    <LifecycleBand stages={stages} />
    <HeadroomStrip />
    <ColdStartStat />
  </div>
);

// ---------------------------------------------------------------------------
// Headroom strip — shows the ratio of observed-peak to cap for each
// guardrail that has a scalar ceiling. Thin 4-px bars with the observed
// portion filled, cap portion hairlined. Keeps the right column the same
// vertical height as the catch side-rail.
// ---------------------------------------------------------------------------

type HeadroomRow = { label: string; observed: string; cap: string; pct: number };

const HEADROOM: ReadonlyArray<HeadroomRow> = [
  { label: "MEMORY",   observed: "340 MB",  cap: "2 GB",   pct: 0.17 },
  { label: "CPU",      observed: "68%",     cap: "1 core", pct: 0.68 },
  { label: "DISK I/O", observed: "12 MB/s", cap: "50 MB/s", pct: 0.24 },
];

const HeadroomStrip: React.FC = () => (
  <div
    style={{
      border: `0.5pt solid ${COLORS.HAIRLINE}`,
      background: COLORS.PAPER_ELEVATED,
      borderRadius: 3,
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: TYPE.eyebrow.size,
          fontWeight: 700,
          letterSpacing: TYPE.eyebrow.tracking,
          textTransform: "uppercase",
          color: COLORS.INK,
          lineHeight: 1,
        }}
      >
        Headroom at peak
      </div>
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 8,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.INK_SUBTLE,
          lineHeight: 1,
        }}
      >
        observed / cap
      </div>
    </div>
    {HEADROOM.map((row) => (
      <div key={row.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: FONTS.MONO,
            fontSize: 8.5,
            fontWeight: 500,
            color: COLORS.INK_MUTED,
            letterSpacing: "0.06em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ fontWeight: 700, color: COLORS.INK }}>{row.label}</span>
          <span>
            <span style={{ color: COLORS.INK }}>{row.observed}</span>
            <span style={{ color: COLORS.INK_SUBTLE }}> / {row.cap}</span>
          </span>
        </div>
        <div
          style={{
            position: "relative",
            height: 4,
            background: COLORS.SURFACE,
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.round(row.pct * 100)}%`,
              background: COLORS.ACCENT,
              borderRadius: 2,
            }}
          />
        </div>
      </div>
    ))}
  </div>
);

const LifecycleBand: React.FC<{ stages: ReadonlyArray<LifecycleStage> }> = ({
  stages,
}) => {
  const kindColor = (k: LifecycleStage["kind"]) =>
    k === "boot" ? COLORS.MIAMI_RED : k === "run" ? COLORS.ACCENT : COLORS.INK_MUTED;
  return (
    <div
      style={{
        border: `0.5pt solid ${COLORS.HAIRLINE}`,
        background: COLORS.PAPER_ELEVATED,
        borderRadius: 3,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: TYPE.eyebrow.size,
            fontWeight: 700,
            letterSpacing: TYPE.eyebrow.tracking,
            textTransform: "uppercase",
            color: COLORS.INK,
            lineHeight: 1,
          }}
        >
          Kernel lifecycle
        </div>
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 8,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: COLORS.INK_SUBTLE,
            lineHeight: 1,
          }}
        >
          p50 · N=25
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${stages.length}, 1fr)`,
          alignItems: "start",
          position: "relative",
        }}
      >
        {/* Connecting rail behind the dots */}
        <div
          style={{
            position: "absolute",
            left: `${100 / stages.length / 2}%`,
            right: `${100 / stages.length / 2}%`,
            top: 4,
            height: 1,
            background: COLORS.HAIRLINE,
            zIndex: 0,
          }}
        />
        {stages.map((s, i) => (
          <div
            key={s.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              position: "relative",
              zIndex: 1,
            }}
          >
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                background: kindColor(s.kind),
                border: `1.25pt solid ${COLORS.PAPER_ELEVATED}`,
                boxShadow: `0 0 0 0.5pt ${kindColor(s.kind)}`,
              }}
            />
            <div
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.02em",
                color: COLORS.INK,
                lineHeight: 1,
                textAlign: "center",
              }}
            >
              <span style={{ color: COLORS.INK_SUBTLE, marginRight: 3 }}>
                0{i + 1}
              </span>
              {s.label}
            </div>
            <div
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 8,
                fontWeight: 500,
                letterSpacing: "0.02em",
                color: COLORS.INK_MUTED,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}
            >
              {s.ms}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          paddingTop: 2,
          fontFamily: FONTS.MONO,
          fontSize: 7.5,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.INK_SUBTLE,
          lineHeight: 1,
        }}
      >
        <LegendSwatch color={COLORS.MIAMI_RED} label="boot" />
        <LegendSwatch color={COLORS.ACCENT} label="run" />
        <LegendSwatch color={COLORS.INK_MUTED} label="end" />
      </div>
    </div>
  );
};

const LegendSwatch: React.FC<{ color: string; label: string }> = ({
  color,
  label,
}) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: color,
        display: "inline-block",
      }}
    />
    {label}
  </span>
);

// ---------------------------------------------------------------------------
// Cold-start stat — two halves, each a mono label + tabular number.
// Matches the book's tier rhythm (small monospace, 700-weight value, muted
// eyebrow). Sits directly under the lifecycle band so the reader's eye
// exits the page on a measurable claim.
// ---------------------------------------------------------------------------

const ColdStartStat: React.FC = () => (
  <div
    style={{
      border: `0.5pt solid ${COLORS.HAIRLINE}`,
      borderLeft: `2pt solid ${COLORS.ACCENT}`,
      background: COLORS.PAPER,
      borderRadius: 3,
      padding: "10px 12px",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      columnGap: 12,
    }}
  >
    <StatHalf label="Cold boot" value="~800 ms" sub="spawn → pre-warm" />
    <StatHalf label="Per cell" value="~120 ms" sub="steady-state p50" />
  </div>
);

const StatHalf: React.FC<{ label: string; value: string; sub: string }> = ({
  label,
  value,
  sub,
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
        lineHeight: 1,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: "-0.01em",
        color: COLORS.INK,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 8,
        fontWeight: 500,
        letterSpacing: "0.04em",
        color: COLORS.INK_SUBTLE,
        lineHeight: 1.1,
      }}
    >
      {sub}
    </div>
  </div>
);
