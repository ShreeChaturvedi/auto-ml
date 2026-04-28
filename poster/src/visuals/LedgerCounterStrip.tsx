import React from "react";
import { COLORS, FONTS, hexWithAlpha } from "../tokens";
import { LEDGER_CARDS } from "../content";

/**
 * Six-card Postgres ledger strip. Mirrors the §1 fact-strip pattern
 * (Lucide icon on a tinted pad + colored numeral + label) so the §3
 * "every step auditable" block reads in the same visual language as the
 * rest of the poster. The three primary colors rotate across the six
 * cells to echo the §4 results palette (red / blue / green).
 */

type LedgerIconId =
  | "play-circle"
  | "zap"
  | "file-box"
  | "shield-check"
  | "arrow-left-right"
  | "link";

const iconProps = (color: string): React.SVGAttributes<SVGElement> => ({
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

const LedgerIcon: React.FC<{ id: LedgerIconId; color: string }> = ({
  id,
  color,
}) => {
  switch (id) {
    case "play-circle":
      return (
        <svg {...iconProps(color)} aria-hidden>
          <circle cx={12} cy={12} r={10} />
          <polygon points="10 8 16 12 10 16 10 8" />
        </svg>
      );
    case "zap":
      return (
        <svg {...iconProps(color)} aria-hidden>
          <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
        </svg>
      );
    case "file-box":
      return (
        <svg {...iconProps(color)} aria-hidden>
          <path d="M14.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M2.97 13.12c-.6.36-.97 1.02-.97 1.74v3.28c0 .72.37 1.38.97 1.74l3 1.83c.63.39 1.43.39 2.06 0l3-1.83c.6-.36.97-1.02.97-1.74v-3.28c0-.72-.37-1.38-.97-1.74l-3-1.83a1.97 1.97 0 0 0-2.06 0z" />
          <path d="m7 17-4.74-2.85" />
          <path d="m7 17 4.74-2.85" />
          <path d="M7 17v5" />
        </svg>
      );
    case "shield-check":
      return (
        <svg {...iconProps(color)} aria-hidden>
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "arrow-left-right":
      return (
        <svg {...iconProps(color)} aria-hidden>
          <path d="M8 3 4 7l4 4" />
          <path d="M4 7h16" />
          <path d="m16 21 4-4-4-4" />
          <path d="M20 17H4" />
        </svg>
      );
    case "link":
      return (
        <svg {...iconProps(color)} aria-hidden>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
};

type LedgerCell = {
  icon: LedgerIconId;
  label: string;
  color: string;
};

/**
 * Visual mapping for each ledger table. `key` here matches the string in
 * `LEDGER_CARDS` from content.ts; the count string comes from there.
 */
const LEDGER_META: Record<string, LedgerCell> = {
  workflow_runs: {
    icon: "play-circle",
    label: "Runs",
    color: COLORS.MIAMI_RED,
  },
  workflow_events: {
    icon: "zap",
    label: "Events",
    color: COLORS.ACCENT,
  },
  workflow_artifacts: {
    icon: "file-box",
    label: "Artifacts",
    color: COLORS.SUCCESS,
  },
  workflow_approvals: {
    icon: "shield-check",
    label: "Approvals",
    color: COLORS.MIAMI_RED,
  },
  workflow_handoffs: {
    icon: "arrow-left-right",
    label: "Handoffs",
    color: COLORS.ACCENT,
  },
  workflow_notebook_bindings: {
    icon: "link",
    label: "Notebook bindings",
    color: COLORS.SUCCESS,
  },
};

export const LedgerCounterStrip: React.FC<{
  width: number;
  height: number;
}> = ({ width, height }) => {
  const cardW = width / LEDGER_CARDS.length;
  return (
    <div
      style={{
        display: "flex",
        width,
        height,
        alignItems: "stretch",
        borderTop: `1px solid ${COLORS.HAIRLINE}`,
      }}
    >
      {LEDGER_CARDS.map((card, i) => {
        const meta = LEDGER_META[card.key];
        if (!meta) return null;
        const showDivider = i > 0;
        return (
          <div
            key={card.key}
            style={{
              flex: `0 0 ${cardW}px`,
              paddingTop: 10,
              paddingRight: 14,
              paddingLeft: showDivider ? 14 : 0,
              borderLeft: showDivider ? `1px solid ${COLORS.HAIRLINE}` : "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              boxSizing: "border-box",
              minWidth: 0,
            }}
          >
            {/* Row 1 — icon pad + muted table label */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  flexShrink: 0,
                  borderRadius: 8,
                  background: hexWithAlpha(meta.color, 0.12),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LedgerIcon id={meta.icon} color={meta.color} />
              </div>
              <div
                style={{
                  fontFamily: FONTS.SANS,
                  fontSize: 15,
                  fontWeight: 700,
                  color: COLORS.INK,
                  letterSpacing: "-0.005em",
                  lineHeight: 1.15,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {meta.label}
              </div>
            </div>

            {/* Row 2 — colored numeral */}
            <div
              style={{
                fontFamily: FONTS.SANS,
                fontSize: 36,
                fontWeight: 700,
                color: meta.color,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              {card.count}
            </div>

            {/* Row 3 — mono table key as a muted "source" line */}
            <div
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 11,
                fontWeight: 500,
                color: COLORS.INK_SUBTLE,
                letterSpacing: "0.02em",
                lineHeight: 1.2,
                wordBreak: "break-all",
              }}
            >
              {card.key}
            </div>
          </div>
        );
      })}
    </div>
  );
};
