import React from "react";
import { COLORS } from "../theme";

/**
 * Static hand-drawn squiggle. Path data is the `FLOURISH_PATH_DEFAULT`
 * constant from `video/remotion/primitives/FlourishUnderline.tsx:52-59` —
 * the single-loop canonical variant the video uses under the HookSlide
 * "training models" phrase. Drawn fully-formed for paper.
 */

const PATH =
  "M 0 14 C 20 18, 45 10, 70 16 " +
  "C 85 18, 100 12, 115 16 " +
  "C 120 17, 124 16, 127 13 " +
  "C 131 3, 135 1, 138 7 " +
  "C 141 13, 136 16, 132 13 " +
  "C 128 10, 132 6, 138 10 " +
  "C 155 14, 182 18, 200 12";

export type FlourishProps = {
  width: number | string;
  height?: number;
  color?: string;
  strokeWidth?: number;
};

export const FlourishUnderline: React.FC<FlourishProps> = ({
  width,
  height = 18,
  color = COLORS.MIAMI_RED,
  strokeWidth = 2.5,
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 200 20"
    preserveAspectRatio="none"
    style={{ overflow: "visible", display: "block" }}
  >
    <path
      d={PATH}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
