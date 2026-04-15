import React from "react";
import { interpolate, Sequence, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../config/easing";
import { MotionLine } from "./MotionLine";

export type AnnotationLine = {
  at: number;
  through: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color?: string;
  strokeWidth?: number;
};

export type AnnotationCallout = {
  at: number;
  through: number;
  x: number;
  y: number;
  text: string;
  color?: string;
};

export type AnnotationLayerProps = {
  lines?: readonly AnnotationLine[];
  callouts?: readonly AnnotationCallout[];
};

const FADE_IN_FRAMES = 12;
const FADE_OUT_FRAMES = 12;
const DRAW_FRAMES = 36;

/** Opacity envelope: fade in, hold, fade out. */
const useEnvelope = (at: number, through: number) => {
  const frame = useCurrentFrame();
  return interpolate(
    frame,
    [at, at + FADE_IN_FRAMES, through - FADE_OUT_FRAMES, through],
    [0, 1, 1, 0],
    {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
};

const Callout: React.FC<AnnotationCallout> = ({
  at,
  through,
  x,
  y,
  text,
  color = "#ffffff",
}) => {
  const opacity = useEnvelope(at, through);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        color,
        opacity,
        fontFamily: "Inter Variable, sans-serif",
        fontSize: 18,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
};

const Line: React.FC<AnnotationLine> = ({
  at,
  through,
  from,
  to,
  color = "#ffffff",
  strokeWidth = 1.5,
}) => {
  const opacity = useEnvelope(at, through);
  return (
    <div style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
      <MotionLine
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        color={color}
        strokeWidth={strokeWidth}
        durationInFrames={DRAW_FRAMES}
        svgWidth={1920}
        svgHeight={1080}
      />
    </div>
  );
};

/**
 * Overlay of animated lines and text callouts keyed to absolute frame windows.
 * Each annotation fades in at `at`, holds, and fades out at `through`, with
 * MotionLine drawing strokes on appearance.
 */
export const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
  lines,
  callouts,
}) => {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {lines?.map((line, i) => (
        <Sequence
          key={`line-${i}`}
          from={line.at}
          durationInFrames={Math.max(1, line.through - line.at)}
          layout="none"
        >
          <Line {...line} />
        </Sequence>
      ))}
      {callouts?.map((callout, i) => (
        <Sequence
          key={`callout-${i}`}
          from={callout.at}
          durationInFrames={Math.max(1, callout.through - callout.at)}
          layout="none"
        >
          <Callout {...callout} />
        </Sequence>
      ))}
    </div>
  );
};
