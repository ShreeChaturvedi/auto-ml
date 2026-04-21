import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { MONOSPACE_FONT, REGULAR_FONT } from "../../config/fonts";
import { SPRING_UI } from "../../config/easing";
import { ToolIcon, type ToolIconName } from "./ToolIcon";
import { StatusPill, type StatusKind } from "./StatusPill";

/**
 * ToolCallCard — compact LLM tool-call card used in the architecture slides.
 *
 * Pixel-parity mirror of `frontend/src/components/llm/shared/ToolCardShell.tsx`
 * at the shadcn/ui light-theme defaults:
 *   rounded-md                 → borderRadius 6
 *   border border-border       → 1px solid #E5E5E5
 *   bg-card (--card 0 0% 98%)  → #FAFAFA
 *   shadow-sm                  → 0 1px 2px 0 rgba(0,0,0,0.05)
 *   px-3 py-2 header           → 8px 12px
 *   text-sm font-medium (14/500) text-foreground (#171717)
 *   text-xs text-muted-fg (12/400) (#737373)
 *   border-t body separator    → 1px solid #E5E5E5, no extra gap
 */

// Frontend CSS-variable resolutions (light theme, index.css):
const CARD_BG = "#FAFAFA"; // --card 0 0% 98%
const CARD_BORDER = "#E5E5E5"; // --border 0 0% 90%
const FOREGROUND = "#171717"; // --foreground 0 0% 9%
const MUTED_FG = "#737373"; // --muted-foreground 0 0% 45%

export type ToolCallCardProps = {
  x: number;
  y: number;
  w: number;
  icon: ToolIconName;
  title: string;
  subtitle?: string;
  /** Status used when `statusTimeline` is absent. */
  status?: StatusKind;
  /** Override the default pill label (falls back to the StatusKind's label). */
  statusLabel?: string;
  body?: { kind: "code" | "text"; lines: string[] };
  /** Frame at which the card starts its entry. Default 0. */
  enterFrame?: number;
  /** Entry spring duration in frames. Default 20. */
  enterDurationFrames?: number;
  /** External focus multiplier (0..1) applied on top of the entry opacity. */
  focusOpacity?: number;
  /**
   * Time-driven status progression. The most recent entry with `atFrame <= f`
   * wins; if no entry matches, `status` is used.
   */
  statusTimeline?: Array<{ atFrame: number; status: StatusKind; label?: string }>;
};

/** Picks the active status & label for the current frame. */
const resolveStatus = (
  frame: number,
  props: Pick<ToolCallCardProps, "status" | "statusLabel" | "statusTimeline">,
): { status: StatusKind | undefined; label: string | undefined } => {
  const { statusTimeline, status, statusLabel } = props;
  if (statusTimeline && statusTimeline.length > 0) {
    let active: { status: StatusKind; label?: string } | null = null;
    for (const entry of statusTimeline) {
      if (entry.atFrame <= frame) {
        active = { status: entry.status, label: entry.label };
      }
    }
    if (active !== null) {
      return { status: active.status, label: active.label };
    }
  }
  return { status, label: statusLabel };
};

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  x,
  y,
  w,
  icon,
  title,
  subtitle,
  status,
  statusLabel,
  body,
  enterFrame = 0,
  enterDurationFrames = 20,
  focusOpacity,
  statusTimeline,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterProgress = spring({
    fps,
    frame: frame - enterFrame,
    config: SPRING_UI,
    durationInFrames: enterDurationFrames,
  });
  const baseOpacity = interpolate(enterProgress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(enterProgress, [0, 1], [6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = baseOpacity * (focusOpacity ?? 1);

  const { status: activeStatus, label: activeLabel } = resolveStatus(frame, {
    status,
    statusLabel,
    statusTimeline,
  });

  const hasBody = !!body && body.lines.length > 0;
  const bodyFont =
    body?.kind === "code" ? MONOSPACE_FONT.fontFamily : REGULAR_FONT.fontFamily;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        opacity,
        transform: `translateY(${translateY}px)`,
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 6,
        boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)",
        overflow: "hidden",
        fontFamily: REGULAR_FONT.fontFamily,
        color: FOREGROUND,
      }}
    >
      {/* Header — px-3 py-2 / gap-2 / items-center */}
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Icon slot — h-4 w-4 shrink-0 */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            flexShrink: 0,
          }}
        >
          <ToolIcon name={icon} size={16} color={FOREGROUND} />
        </span>

        {/* Title + subtitle — flex min-w-0 flex-1 items-baseline gap-2 */}
        <div
          style={{
            display: "flex",
            minWidth: 0,
            flex: 1,
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: FOREGROUND,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              // Tool names are code identifiers — mono keeps them legible
              fontFamily: MONOSPACE_FONT.fontFamily,
            }}
          >
            {title}
          </span>
          {subtitle ? (
            <span
              style={{
                fontSize: 12,
                color: MUTED_FG,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {subtitle}
            </span>
          ) : null}
        </div>

        {/* StatusPill — shrink-0, right-aligned */}
        {activeStatus ? (
          <StatusPill
            kind={activeStatus}
            label={activeLabel}
            style={{ flexShrink: 0 }}
          />
        ) : null}
      </div>

      {/* Body — border-t separator, no extra padding above the rule */}
      {hasBody ? (
        <div
          style={{
            borderTop: `1px solid ${CARD_BORDER}`,
            padding: "8px 12px 10px",
            fontFamily: bodyFont,
            fontSize: 13,
            lineHeight: 1.4,
            color: FOREGROUND,
          }}
        >
          {body!.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
