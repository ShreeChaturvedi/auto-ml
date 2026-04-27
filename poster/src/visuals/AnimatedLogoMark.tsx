import React from "react";
import { COLORS } from "../tokens";

/**
 * Static "simple" variant of the video's `AnimatedLogoMark`. See
 * `video/remotion/primitives/AnimatedLogoMark.tsx:100-124` — three legs at
 * 2.5-unit stroke plus a 3-unit-radius apex circle on a 32×32 viewBox,
 * scaled up 5% so the mark reads confidently at small sizes. No animation
 * state: this is the endpoint pose the video reaches after the draw-in.
 */

export type LogoMarkProps = {
  size: number;
  color?: string;
};

const scale2D = (x: number, y: number): [number, number] => [
  16 + (x - 16) * 1.05,
  16 + (y - 16) * 1.05,
];

export const AnimatedLogoMark: React.FC<LogoMarkProps> = ({
  size,
  color = COLORS.INK,
}) => {
  const p1 = scale2D(14, 8);
  const p2 = scale2D(5, 26);
  const p3 = scale2D(9, 18);
  const p4 = scale2D(19.5, 18);
  const p5 = scale2D(18, 8);
  const p6 = scale2D(27, 26);
  const c = scale2D(16, 4);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible", flexShrink: 0 }}
    >
      <path
        d={`M${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}`}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d={`M${p3[0]} ${p3[1]}L${p4[0]} ${p4[1]}`}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d={`M${p5[0]} ${p5[1]}L${p6[0]} ${p6[1]}`}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.4}
      />
      <circle cx={c[0]} cy={c[1]} r={3 * 1.05} fill={color} />
    </svg>
  );
};
