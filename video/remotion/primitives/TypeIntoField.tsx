import React, { useEffect } from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SPRING_UI } from "../../config/easing";

export type TypeScheduleEntry = { char: string; frame: number };

export type TypeIntoFieldProps = {
  schedule: readonly TypeScheduleEntry[];
  mode?: "text" | "password";
  /** If provided, invoked each frame with the current typed string. Lets
   * callers bridge into react-hook-form (or any state) externally. */
  onUpdate?: (typed: string) => void;
  /** Optional style passthrough for the rendered text. */
  style?: React.CSSProperties;
  /** If false, the component renders nothing and is purely side-effect
   * (useful when the real component's input is doing the rendering and
   * TypeIntoField just drives react-hook-form state). Default true. */
  render?: boolean;
};

const POP_DURATION_FRAMES = 7;
const POP_SCALE_FROM = 0.6;

/**
 * Drives a frame-keyed typing schedule. Renders the currently-revealed text
 * (or password bullets with a "pop" on the newest bullet) and optionally
 * pushes the typed string back to a parent via `onUpdate` (e.g. to bridge
 * into react-hook-form without coupling this primitive to it).
 */
export const TypeIntoField: React.FC<TypeIntoFieldProps> = ({
  schedule,
  mode = "text",
  onUpdate,
  style,
  render = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const revealed = schedule.filter((e) => e.frame <= frame);
  const typed = revealed.map((e) => e.char).join("");

  // Bridge typed value out to parent (react-hook-form etc.).
  useEffect(() => {
    if (onUpdate) onUpdate(typed);
  }, [typed, onUpdate]);

  if (!render) return null;

  if (mode === "password") {
    const lastFrame = revealed.length > 0 ? revealed[revealed.length - 1]!.frame : -1;
    return (
      <span style={style}>
        {typed.split("").map((_, i) => {
          const isLatest = i === typed.length - 1;
          const popProgress = isLatest
            ? spring({
                fps,
                frame: frame - lastFrame,
                config: SPRING_UI,
                durationInFrames: POP_DURATION_FRAMES,
              })
            : 1;
          const scale = POP_SCALE_FROM + (1 - POP_SCALE_FROM) * popProgress;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                transform: `scale(${scale})`,
                transformOrigin: "center",
              }}
            >
              {"\u2022"}
            </span>
          );
        })}
      </span>
    );
  }

  return <span style={style}>{typed}</span>;
};
