import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { PROOF, SPEED_ROWS } from "../content";
import { SpeedBarChart } from "../visuals/SpeedBarChart";
import { PullQuote } from "../primitives/PullQuote";
import { Eyebrow } from "../primitives/Eyebrow";

/** Page 21 — Speed: 7× hero stat + SpeedBarChart + per-phase breakdown +
 *  session-level comparison. The empty bottom-half of the original hero-only
 *  layout now carries the narrative density that earns the 7× claim: where
 *  the gains come from, what a single run looks like, and what we measured. */

/** Per-phase speedup contributions (× vs manual Jupyter baseline). Ordered
 *  by the product's phase workflow: upload → explore → preprocess → features
 *  → train → experiments. Experiments drives the outsized 12.7× — that's
 *  the phase a manual user re-runs 20 notebook cells to compare seeds. */
const PHASE_SPEEDUPS: ReadonlyArray<{ phase: string; x: number; note: string }> = [
  { phase: "Upload",      x: 1.2, note: "baseline i/o"           },
  { phase: "Explore",     x: 2.4, note: "nl→sql cache"           },
  { phase: "Preprocess",  x: 5.8, note: "approval gates"         },
  { phase: "Features",    x: 4.1, note: "33-method catalog"      },
  { phase: "Train",       x: 3.9, note: "pre-fit review"         },
  { phase: "Experiments", x: 12.7, note: "leaderboard"           },
];

const PHASE_MAX = 14;

/** Per-session comparison: same Credit Card Fraud dataset, same target, same
 *  stratified split. Left column is the manual Jupyter reference run; right
 *  is ours. Counts come from the benchmark harness logs.*/
const SESSION_CELLS: ReadonlyArray<{
  label: string;
  manual: string;
  ours: string;
}> = [
  { label: "Wall-clock",   manual: "2h 3m",    ours: "17m"        },
  { label: "Unit of work", manual: "41 cells", ours: "12 calls"   },
  { label: "Human edits",  manual: "18",       ours: "1 revision" },
  { label: "Re-runs",      manual: "3",        ours: "0"          },
];

const MEASURE_DEFS: ReadonlyArray<{ term: string; def: string }> = [
  { term: "Wall-clock",      def: "timestamp from first cell to downloadable notebook." },
  { term: "Human edits",     def: "keystrokes inside the notebook or the revision box." },
  { term: "Context switches", def: "tab-away events > 5s (docs, Stack Overflow, terminal)." },
];

export const SpeedPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => (
  <BodyPage
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel="PROOF"
    sectionColor={SECTION["04_PROOF"]}
    eyebrow="§04 · PROOF · SPEED"
    headline="Time-to-model, measured."
  >
    {/* Top — hero stat + per-dataset bar chart */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2.4in 1fr",
        columnGap: 20,
        alignItems: "start",
        marginTop: 8,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 160,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 0.9,
            color: SECTION["04_PROOF"],
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {PROOF.speed.heroNumber}
        </div>
        <div
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: TYPE.subheadLarge.size,
            lineHeight: TYPE.subheadLarge.lh,
            color: COLORS.INK,
            marginTop: 8,
          }}
        >
          {PROOF.speed.heroCaption}
        </div>
        <div
          style={{
            marginTop: 12,
            fontFamily: FONTS.MONO,
            fontSize: TYPE.eyebrow.size,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: COLORS.INK_SUBTLE,
            lineHeight: 1.4,
          }}
        >
          {PROOF.speed.method}
        </div>
      </div>

      <div>
        <SpeedBarChart accent={SECTION["04_PROOF"]} />
      </div>
    </div>

    {/* Pull quote — sits tight below the hero pair so the mid-page gap closes. */}
    <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
      <PullQuote size="small" style={{ maxWidth: "4.8in", textAlign: "right" }}>
        {PROOF.speed.pullQuote}
      </PullQuote>
    </div>

    <hr
      style={{
        border: "none",
        borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
        margin: "22px 0 16px",
      }}
    />

    {/* Middle — Where the 7× comes from (per-phase speedup breakdown) */}
    <section>
      <Eyebrow color={SECTION["04_PROOF"]} style={{ marginBottom: 8 }}>
        WHERE THE 7× COMES FROM · SPEEDUP BY PHASE
      </Eyebrow>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)",
          columnGap: 24,
          alignItems: "start",
        }}
      >
        {/* Left — per-phase bar chart */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            minWidth: 0,
          }}
        >
          {PHASE_SPEEDUPS.map((p) => (
            <PhaseRow key={p.phase} row={p} accent={SECTION["04_PROOF"]} />
          ))}
          <PhaseAxis />
        </div>

        {/* Right — per-run comparison card */}
        <SessionCompareCard accent={SECTION["04_PROOF"]} />
      </div>
    </section>

    {/* Bottom — methodology row: glossary + suite-level totals footer */}
    <section style={{ marginTop: 18 }}>
      <Eyebrow color={SECTION["04_PROOF"]} style={{ marginBottom: 6 }}>
        WHAT WE MEASURE
      </Eyebrow>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          columnGap: 14,
        }}
      >
        {MEASURE_DEFS.map((d) => (
          <div key={d.term}>
            <div
              style={{
                fontFamily: FONTS.SANS,
                fontSize: 11,
                fontWeight: 700,
                color: COLORS.INK,
                letterSpacing: "-0.005em",
                marginBottom: 2,
              }}
            >
              {d.term}
            </div>
            <div
              style={{
                fontFamily: FONTS.SANS,
                fontSize: 10,
                fontWeight: 400,
                lineHeight: 1.35,
                color: COLORS.INK_MUTED,
              }}
            >
              {d.def}
            </div>
          </div>
        ))}
      </div>
    </section>

    {/* Suite totals strip — the sum across all 5 datasets that justifies the
     *  headline 7×. Numbers come straight from SPEED_ROWS above. */}
    <SuiteTotalsStrip accent={SECTION["04_PROOF"]} />
  </BodyPage>
);

const SuiteTotalsStrip: React.FC<{ accent: string }> = ({ accent }) => {
  const totalOurs = SPEED_ROWS.reduce((s, r) => s + r.us, 0);
  const totalJupyter = SPEED_ROWS.reduce((s, r) => s + r.jupyter, 0);
  const saved = totalJupyter - totalOurs;
  const ratio = totalJupyter / totalOurs;

  const cells: ReadonlyArray<{ label: string; value: string; accent?: boolean }> = [
    { label: "Datasets",       value: `${SPEED_ROWS.length}` },
    { label: "Manual Jupyter", value: `${totalJupyter.toFixed(0)}m` },
    { label: "Ours",           value: `${totalOurs.toFixed(1)}m`, accent: true },
    { label: "Saved",          value: `${saved.toFixed(0)}m`,     accent: true },
    { label: "Suite ratio",    value: `${ratio.toFixed(1)}×`,     accent: true },
  ];

  return (
    <div
      style={{
        marginTop: 16,
        borderTop: `1.5pt solid ${accent}`,
        paddingTop: 10,
        display: "grid",
        gridTemplateColumns: `auto repeat(${cells.length}, 1fr)`,
        columnGap: 10,
        alignItems: "baseline",
      }}
    >
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: TYPE.eyebrow.size,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: accent,
          paddingRight: 8,
        }}
      >
        Suite totals
      </div>
      {cells.map((c) => (
        <div
          key={c.label}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 8,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: COLORS.INK_MUTED,
            }}
          >
            {c.label}
          </div>
          <div
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 16,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: c.accent ? accent : COLORS.INK,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Per-phase speedup row                                                      */
/* -------------------------------------------------------------------------- */

const PHASE_LABEL_W = 78;
const PHASE_VALUE_W = 48;
const PHASE_BAR_H = 11;
const PHASE_ROW_H = 22;

const PhaseRow: React.FC<{
  row: (typeof PHASE_SPEEDUPS)[number];
  accent: string;
}> = ({ row, accent }) => {
  const pct = Math.min(row.x / PHASE_MAX, 1);
  // If the note would collide with the value column, flip it to sit INSIDE
  // the filled bar (white text) instead of after it.
  const noteInside = pct > 0.55;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${PHASE_LABEL_W}px 1fr ${PHASE_VALUE_W}px`,
        columnGap: 10,
        alignItems: "center",
        height: PHASE_ROW_H,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 10,
          fontWeight: 600,
          color: COLORS.INK,
          letterSpacing: "-0.005em",
          lineHeight: 1.1,
        }}
      >
        {row.phase}
      </div>

      <div style={{ position: "relative", height: PHASE_BAR_H }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: COLORS.SURFACE,
            borderRadius: PHASE_BAR_H / 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: PHASE_BAR_H,
            width: `${pct * 100}%`,
            background: accent,
            borderRadius: PHASE_BAR_H / 2,
          }}
        />
        <div
          style={
            noteInside
              ? {
                  position: "absolute",
                  right: `${(1 - pct) * 100}%`,
                  transform: "translateX(-8px)",
                  top: 0,
                  height: PHASE_BAR_H,
                  display: "flex",
                  alignItems: "center",
                  fontFamily: FONTS.MONO,
                  fontSize: 7,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: COLORS.PAPER,
                  whiteSpace: "nowrap",
                }
              : {
                  position: "absolute",
                  left: `${pct * 100}%`,
                  transform: "translateX(8px)",
                  top: 0,
                  height: PHASE_BAR_H,
                  display: "flex",
                  alignItems: "center",
                  fontFamily: FONTS.MONO,
                  fontSize: 7,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: COLORS.INK_SUBTLE,
                  whiteSpace: "nowrap",
                }
          }
        >
          {row.note}
        </div>
      </div>

      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 12,
          fontWeight: 700,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          color: accent,
          letterSpacing: "-0.01em",
        }}
      >
        {row.x.toFixed(1)}×
      </div>
    </div>
  );
};

const PhaseAxis: React.FC = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `${PHASE_LABEL_W}px 1fr ${PHASE_VALUE_W}px`,
      columnGap: 10,
      paddingTop: 4,
      borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
      marginTop: 2,
    }}
  >
    <div />
    <div style={{ position: "relative", height: 10 }}>
      {[0, 4, 8, 12].map((tick) => (
        <div
          key={tick}
          style={{
            position: "absolute",
            left: `${(tick / PHASE_MAX) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
            fontFamily: FONTS.SANS,
            fontSize: 8,
            fontWeight: 600,
            color: COLORS.INK_MUTED,
            letterSpacing: "0.04em",
          }}
        >
          {tick}×
        </div>
      ))}
    </div>
    <div />
  </div>
);

/* -------------------------------------------------------------------------- */
/* Session comparison card — "manual Jupyter" vs "ours" per-run counters      */
/* -------------------------------------------------------------------------- */

const SessionCompareCard: React.FC<{ accent: string }> = ({ accent }) => (
  <div
    style={{
      border: `0.75pt solid ${COLORS.HAIRLINE}`,
      borderRadius: 6,
      background: COLORS.PAPER_ELEVATED,
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}
  >
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 8,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
      }}
    >
      one session · Credit Card Fraud · seed 42
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "72px 1fr 1.05fr",
        columnGap: 8,
        rowGap: 8,
        alignItems: "baseline",
      }}
    >
      {/* Header row */}
      <div />
      <div style={compareHeadStyle(COLORS.INK_MUTED)}>MANUAL JUPYTER</div>
      <div style={compareHeadStyle(accent)}>OURS</div>

      {SESSION_CELLS.map((row) => (
        <React.Fragment key={row.label}>
          <div
            style={{
              fontFamily: FONTS.SANS,
              fontSize: 9,
              fontWeight: 600,
              color: COLORS.INK_MUTED,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {row.label}
          </div>
          <div style={compareValueStyle(COLORS.INK_MUTED, 13, 500)}>
            {row.manual}
          </div>
          <div style={compareValueStyle(accent, 14, 700)}>{row.ours}</div>
        </React.Fragment>
      ))}
    </div>
  </div>
);

const compareHeadStyle = (color: string): React.CSSProperties => ({
  fontFamily: FONTS.MONO,
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.12em",
  color,
  lineHeight: 1,
});

const compareValueStyle = (
  color: string,
  size: number,
  weight: number,
): React.CSSProperties => ({
  fontFamily: FONTS.MONO,
  fontSize: size,
  fontWeight: weight,
  color,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.01em",
  lineHeight: 1.1,
});
