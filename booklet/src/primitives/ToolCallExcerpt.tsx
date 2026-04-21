import React from "react";
import { COLORS, FONTS } from "../theme";

/**
 * Monospace code-block excerpt depicting a single MCP tool call. Renders
 * the canonical `tool_call: <name>` prefix with indented `  key: value`
 * args. Each string value is printed quoted; numbers and booleans render
 * bare. Visually mimics the agent's trace so the reader can map the
 * phase-page screenshot back to the wire-level contract described in §03.
 */
export const ToolCallExcerpt: React.FC<{
  tool: string;
  args?: Readonly<Record<string, string | number | boolean>>;
  note?: string;
  accent?: string;
  style?: React.CSSProperties;
}> = ({ tool, args, note, accent = COLORS.ACCENT, style }) => {
  const entries = args ? Object.entries(args) : [];
  return (
    <div
      style={{
        border: `0.5pt solid ${COLORS.HAIRLINE}`,
        borderLeft: `2pt solid ${accent}`,
        background: COLORS.PAPER_ELEVATED,
        padding: "10px 12px",
        fontFamily: FONTS.MONO,
        fontSize: 9,
        lineHeight: 1.5,
        color: COLORS.INK,
        borderRadius: 3,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        ...style,
      }}
    >
      <div style={{ color: COLORS.INK_MUTED }}>
        <span style={{ color: accent, fontWeight: 600 }}>tool_call:</span>
        {" "}
        <span style={{ color: COLORS.INK, fontWeight: 600 }}>{tool}</span>
      </div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ paddingLeft: 14 }}>
          <span style={{ color: COLORS.INK_MUTED }}>{k}:</span>{" "}
          <span style={{ color: typeof v === "string" ? COLORS.SYNTAX_STRING : COLORS.SYNTAX_NUMBER }}>
            {typeof v === "string" ? `"${v}"` : String(v)}
          </span>
        </div>
      ))}
      {note && (
        <div
          style={{
            marginTop: 4,
            color: COLORS.INK_SUBTLE,
            fontStyle: "italic",
            fontFamily: FONTS.SERIF,
            fontSize: 10,
            lineHeight: 1.3,
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
};
