import React from "react";
import { useCurrentFrame } from "remotion";
import { REGULAR_FONT } from "../../config/fonts";
import { ToolIcon, type ToolIconName } from "./ToolIcon";

/**
 * Video mirror of `frontend/src/components/llm/shared/StatusPill.tsx`.
 *
 * Maps a semantic `StatusKind` onto a capsule. Tone colors are locked to the
 * shadcn/ui light-theme palette used throughout the frontend: `--metric-
 * positive`, `--metric-negative`, amber-500, blue-700, border-subtle, etc.
 * For the `running` kind, the loader icon rotates 6° per frame so the motion
 * matches the frontend Lucide `animate-spin` cadence at 60fps.
 */

export type StatusKind =
  | "accepted"
  | "success"
  | "rejected"
  | "failed"
  | "running"
  | "pending"
  | "awaiting"
  | "selected"
  | "skipped"
  | "warning"
  | "info"
  | "neutral";

export type StatusPillProps = {
  kind: StatusKind;
  /** Optional label. If omitted, the pill renders only the icon. */
  label?: string;
  /** Show the leading icon. Default true. */
  showIcon?: boolean;
  /** Label font size in px. Default 10. */
  size?: number;
  /** Icon size in px. Default 12. */
  iconSize?: number;
  style?: React.CSSProperties;
};

type Tone = {
  text: string;
  bg: string;
  border: string;
  icon: ToolIconName | null;
  spin?: boolean;
  defaultLabel: string;
};

/**
 * Tone palette — resolved from the frontend light-theme Tailwind utilities the
 * shared `Pill` primitive emits for each `tone`. Values mirror the Tailwind
 * 100/200/800 swatches the shadcn/ui library pulls in by default.
 */
const TONE: Record<StatusKind, Tone> = {
  accepted: {
    text: "#166534",
    bg: "#dcfce7",
    border: "#bbf7d0",
    icon: "check-circle",
    defaultLabel: "accepted",
  },
  success: {
    text: "#166534",
    bg: "#dcfce7",
    border: "#bbf7d0",
    icon: "check-circle",
    defaultLabel: "success",
  },
  selected: {
    text: "#166534",
    bg: "#dcfce7",
    border: "#bbf7d0",
    icon: "circle-dot",
    defaultLabel: "selected",
  },
  rejected: {
    text: "#991b1b",
    bg: "#fee2e2",
    border: "#fecaca",
    icon: "x-circle",
    defaultLabel: "rejected",
  },
  failed: {
    text: "#991b1b",
    bg: "#fee2e2",
    border: "#fecaca",
    icon: "x-circle",
    defaultLabel: "failed",
  },
  running: {
    text: "#1e40af",
    bg: "#dbeafe",
    border: "#bfdbfe",
    icon: "loader",
    spin: true,
    defaultLabel: "running",
  },
  pending: {
    text: "#92400e",
    bg: "#fef3c7",
    border: "#fde68a",
    icon: "clock",
    defaultLabel: "pending",
  },
  awaiting: {
    text: "#92400e",
    bg: "#fef3c7",
    border: "#fde68a",
    icon: "clock",
    defaultLabel: "awaiting",
  },
  skipped: {
    text: "#525252",
    bg: "#f5f5f5",
    border: "#e5e5e5",
    icon: "minus-circle",
    defaultLabel: "skipped",
  },
  neutral: {
    text: "#525252",
    bg: "#f5f5f5",
    border: "#e5e5e5",
    icon: null,
    defaultLabel: "",
  },
  warning: {
    text: "#92400e",
    bg: "#fef3c7",
    border: "#fde68a",
    icon: "alert-tri",
    defaultLabel: "warning",
  },
  info: {
    text: "#1e40af",
    bg: "#dbeafe",
    border: "#bfdbfe",
    icon: "info",
    defaultLabel: "info",
  },
};

export const StatusPill: React.FC<StatusPillProps> = ({
  kind,
  label,
  showIcon = true,
  size = 10,
  iconSize = 12,
  style,
}) => {
  const frame = useCurrentFrame();
  const tone = TONE[kind];
  const displayLabel = label ?? tone.defaultLabel;
  const hasLabel = displayLabel.length > 0;

  const rotation = tone.spin ? (frame * 6) % 360 : 0;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: hasLabel ? 4 : 0,
        padding: "2px 8px",
        borderRadius: 9999,
        fontSize: size,
        lineHeight: 1.2,
        fontWeight: 500,
        fontFamily: REGULAR_FONT.fontFamily,
        background: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
        ...style,
      }}
    >
      {showIcon && tone.icon ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transform: tone.spin ? `rotate(${rotation}deg)` : undefined,
          }}
        >
          <ToolIcon name={tone.icon} size={iconSize} color={tone.text} />
        </span>
      ) : null}
      {hasLabel ? <span>{displayLabel}</span> : null}
    </span>
  );
};
