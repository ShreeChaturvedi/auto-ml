import React from "react";
import type { ReactNode } from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SPRING_HERO, SPRING_SETTLE, SPRING_UI } from "../../config/easing";

export type AssemblePieceFrom =
  | "center"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "scale"
  | "morph";

export type AssemblePieceSpringName =
  | "SPRING_UI"
  | "SPRING_SETTLE"
  | "SPRING_HERO";

export type AssemblePiece = {
  id: string;
  /**
   * Start frame. Resolved by the caller before mount — Assemble itself
   * takes pre-resolved frame numbers. (The scene-level useVoiceoverAlignment
   * hook resolves { mark } / { after } refs.)
   */
  start: number;
  from?: AssemblePieceFrom;
  duration?: number;
  spring?: AssemblePieceSpringName;
};

export type AssembleProps = {
  pieces: readonly AssemblePiece[];
  children: ReactNode;
};

const SPRING_CONFIGS = {
  SPRING_UI,
  SPRING_SETTLE,
  SPRING_HERO,
} as const;

const TRAVEL_PX = 24;
const SCALE_FROM = 0.92;

/**
 * Pure transform calculator — given a resolved piece and the current progress
 * 0..1, return the inline style to apply. Exported for unit tests.
 */
export const computeAssembleTransform = (
  from: AssemblePieceFrom,
  progress: number,
): { transform: string; opacity: number } => {
  const p = Math.max(0, Math.min(1, progress));
  const opacity = p;
  switch (from) {
    case "top":
      return { transform: `translateY(${(1 - p) * -TRAVEL_PX}px)`, opacity };
    case "left":
      return { transform: `translateX(${(1 - p) * -TRAVEL_PX}px)`, opacity };
    case "right":
      return { transform: `translateX(${(1 - p) * TRAVEL_PX}px)`, opacity };
    case "scale": {
      const s = SCALE_FROM + (1 - SCALE_FROM) * p;
      return { transform: `scale(${s})`, opacity };
    }
    case "center":
    case "morph":
      return { transform: "none", opacity };
    case "bottom":
    default:
      return { transform: `translateY(${(1 - p) * TRAVEL_PX}px)`, opacity };
  }
};

/**
 * Claude-style "pieces appear in response to prior events" animation.
 *
 * Each piece references a child by `id` — any descendant element with a
 * matching `data-assemble="<id>"` attribute is wrapped with a transform +
 * opacity keyed to `piece.start`. Unmatched pieces are silently ignored;
 * unmatched children pass through untouched.
 */
export const Assemble: React.FC<AssembleProps> = ({ pieces, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pieceById = new Map<string, AssemblePiece>();
  for (const p of pieces) pieceById.set(p.id, p);

  const walk = (node: ReactNode): ReactNode => {
    if (Array.isArray(node)) {
      return node.map((child, i) => (
        <React.Fragment key={i}>{walk(child)}</React.Fragment>
      ));
    }
    if (!React.isValidElement(node)) return node;

    const element = node as React.ReactElement<{
      "data-assemble"?: string;
      style?: React.CSSProperties;
      children?: ReactNode;
    }>;
    const id = element.props["data-assemble"];
    const piece = id ? pieceById.get(id) : undefined;

    // Recurse into children regardless — nested data-assemble should work.
    const nextChildren = element.props.children
      ? walk(element.props.children)
      : element.props.children;

    if (!piece) {
      if (nextChildren === element.props.children) return element;
      return React.cloneElement(element, undefined, nextChildren);
    }

    const duration = piece.duration ?? 18;
    const springName = piece.spring ?? "SPRING_UI";
    const progress = spring({
      fps,
      frame: frame - piece.start,
      config: SPRING_CONFIGS[springName],
      durationInFrames: duration,
    });
    const { transform, opacity } = computeAssembleTransform(
      piece.from ?? "bottom",
      progress,
    );

    const baseStyle = element.props.style ?? {};
    const nextStyle: React.CSSProperties = {
      ...baseStyle,
      opacity,
      transform: transform === "none"
        ? baseStyle.transform
        : `${baseStyle.transform ? `${baseStyle.transform} ` : ""}${transform}`,
      willChange: "opacity, transform",
    };

    return React.cloneElement(element, { style: nextStyle }, nextChildren);
  };

  return <>{walk(children)}</>;
};
