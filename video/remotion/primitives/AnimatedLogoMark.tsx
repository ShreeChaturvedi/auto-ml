import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { EASE_OUT, SPRING_HERO } from "../../config/easing";
import type { Theme } from "../../config/themes";
import { COLORS } from "../../config/themes";

export type AnimatedLogoMarkProps = {
  /** Size in px (width & height; the mark is square). */
  size: number;
  /** Delay in frames before the draw sequence begins. Default 0. */
  delay?: number;
  /** Override stroke + fill color. Defaults to `COLORS[theme].WORD_COLOR_ON_BG_APPEARED`. */
  color?: string;
  theme: Theme;
  /** "draw" = full animation; "static" = pre-drawn chrome (no animation). Default "draw". */
  mode?: "draw" | "static";
  /** Overrides visual behavior. "3d" builds the diorama; "simple" returns a flat, basic vector. Default "3d". */
  variant?: "3d" | "simple";
};

/** Sequential draw phase timings. */
const LEG_FRAMES = 12;
const CROSSBAR_FRAMES = 12;
const RIGHT_LEG_FRAMES = 12;
const APEX_FRAMES = 6;

const RIGHT_LEG_OPACITY = 0.4;

const computeDrawOffset = (
  frame: number,
  start: number,
  durationFrames: number,
  isStatic: boolean,
): number => {
  if (isStatic) return 0;
  return interpolate(frame, [start, start + durationFrames], [1, 0], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

/**
 * Premium Agentic Product Mark.
 * Designed with a high-end isometric architecture aesthetic.
 * Features an abstract spatial projection of the App Logo using pure SVG,
 * matching the product's "meta-sandbox" geometric visual language.
 */
export const AnimatedLogoMark: React.FC<AnimatedLogoMarkProps> = ({
  size,
  delay = 0,
  color,
  theme,
  mode = "draw",
  variant = "3d",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const strokeColor = color ?? COLORS[theme].WORD_COLOR_ON_BG_APPEARED;
  const isStatic = mode === "static";

  // Sequencing (Simple Variant)
  const leftLegStart = delay;
  const crossbarStart = delay + LEG_FRAMES;
  const rightLegStart = delay + LEG_FRAMES + CROSSBAR_FRAMES;
  const apexStart = delay + LEG_FRAMES + CROSSBAR_FRAMES + RIGHT_LEG_FRAMES;

  // Path Draws (Simple Variant)
  const leftLegOffset = computeDrawOffset(frame, leftLegStart, LEG_FRAMES, isStatic);
  const crossbarOffset = computeDrawOffset(frame, crossbarStart, CROSSBAR_FRAMES, isStatic);
  const rightLegOffset = computeDrawOffset(frame, rightLegStart, RIGHT_LEG_FRAMES, isStatic);

  // Apex (Simple Variant)
  const apexSimpleProgress = isStatic
    ? 1
    : spring({
        fps,
        frame: frame - apexStart,
        config: SPRING_HERO,
        durationInFrames: APEX_FRAMES,
      });

  const apexScale = interpolate(apexSimpleProgress, [0, 1], [0, 1]);
  const apexOpacityBase = interpolate(apexSimpleProgress, [0, 1], [0, 1]);

  if (variant === "simple") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M14 8L5 26" stroke={strokeColor} strokeWidth={2.5} strokeLinecap="square" pathLength={1} strokeDasharray={1} strokeDashoffset={leftLegOffset} />
        <path d="M9 18H19.5" stroke={strokeColor} strokeWidth={2.5} strokeLinecap="square" pathLength={1} strokeDasharray={1} strokeDashoffset={crossbarOffset} />
        <path d="M18 8L27 26" stroke={strokeColor} strokeWidth={2.5} strokeLinecap="square" pathLength={1} strokeDasharray={1} opacity={RIGHT_LEG_OPACITY} strokeDashoffset={rightLegOffset} />
        <circle cx={16} cy={4} r={3} fill={strokeColor} opacity={apexOpacityBase} style={{ transform: `scale(${apexScale})`, transformOrigin: "16px 4px" }} />
      </svg>
    );
  }

  // === 3D ISOMETRIC VARIANT ===

  // Springs for assembly
  const floorProgress = isStatic ? 1 : spring({ fps, frame: frame - delay, config: SPRING_HERO, durationInFrames: 30 });
  const leftProgress = isStatic ? 1 : spring({ fps, frame: frame - leftLegStart, config: SPRING_HERO, durationInFrames: 25 });
  const crossbarProgress = isStatic ? 1 : spring({ fps, frame: frame - crossbarStart, config: SPRING_HERO, durationInFrames: 25 });
  const rightProgress = isStatic ? 1 : spring({ fps, frame: frame - rightLegStart, config: SPRING_HERO, durationInFrames: 25 });
  const apexProgress = isStatic ? 1 : spring({ fps, frame: frame - apexStart, config: SPRING_HERO, durationInFrames: 20 });

  // Pure Isometric Projection
  const p = (x: number, y: number, z: number, zOffset: number = 0) => {
    const cx = 16;
    const cy = 16;
    const scale = 0.14; 
    const actualZ = z + zOffset;
    const sx = cx + (x - y) * 0.866025 * scale;
    const sy = cy + (x + y) * 0.5 * scale - actualZ * scale;
    return [sx, sy] as [number, number];
  };

  const drawBlock = (
    bl: [number, number],
    br: [number, number],
    tr: [number, number],
    tl: [number, number],
    y1: number,
    y2: number,
    progress: number
  ) => {
    if (progress <= 0) return null;
    const zOffset = (1 - progress) * -40;
    
    const rightFace = [
      p(br[0], y2, br[1], zOffset),
      p(tr[0], y2, tr[1], zOffset),
      p(tr[0], y1, tr[1], zOffset),
      p(br[0], y1, br[1], zOffset),
    ];
    const topFace = [
      p(tl[0], y2, tl[1], zOffset),
      p(tr[0], y2, tr[1], zOffset),
      p(tr[0], y1, tr[1], zOffset),
      p(tl[0], y1, tl[1], zOffset),
    ];
    const frontFace = [
      p(bl[0], y2, bl[1], zOffset),
      p(br[0], y2, br[1], zOffset),
      p(tr[0], y2, tr[1], zOffset),
      p(tl[0], y2, tl[1], zOffset),
    ];
    
    return (
      <g 
        stroke={strokeColor} 
        strokeOpacity={0.4} 
        strokeWidth={0.3} 
        strokeLinejoin="round"
        opacity={progress}
      >
        <polygon points={rightFace.map(pt => pt.join(",")).join(" ")} fill={strokeColor} fillOpacity={0.06} />
        <polygon points={topFace.map(pt => pt.join(",")).join(" ")} fill={strokeColor} fillOpacity={0.16} />
        <polygon points={frontFace.map(pt => pt.join(",")).join(" ")} fill={strokeColor} fillOpacity={0.1} />
      </g>
    );
  };

  const Tracer = ({ start, end, progress, offset }: { start: [number, number], end: [number, number], progress: number, offset: number }) => {
    if (progress <= 0) return null;
    return (
      <g opacity={progress}>
        <path
          d={`M ${start.join(",")} L ${end.join(",")}`}
          stroke={strokeColor}
          strokeWidth={0.8}
          pathLength="100"
          strokeDasharray="15 100"
          strokeDashoffset={offset}
          opacity={0.3}
        />
        <path
          d={`M ${start.join(",")} L ${end.join(",")}`}
          stroke={strokeColor}
          strokeWidth={0.3}
          pathLength="100"
          strokeDasharray="15 100"
          strokeDashoffset={offset}
          opacity={0.9}
        />
      </g>
    );
  };

  // Base coordinates for physical components
  const leftLegOpts = { bl: [-45, 0] as [number, number], br: [-25, 0] as [number, number], tr: [-2, 80] as [number, number], tl: [-22, 80] as [number, number], y1: -8, y2: 8 };
  const crossOpts = { bl: [-15, 35] as [number, number], br: [15, 35] as [number, number], tr: [11, 50] as [number, number], tl: [-11, 50] as [number, number], y1: -8, y2: 8 };
  const rightLegOpts = { bl: [25, 0] as [number, number], br: [45, 0] as [number, number], tr: [22, 80] as [number, number], tl: [2, 80] as [number, number], y1: -8, y2: 8 };

  // Environment Floor Geometry
  const floorPts = [
    [-80, -80, -20],
    [80, -80, -20],
    [80, 80, -20],
    [-80, 80, -20]
  ] as const;

  const apexZOffset = (1 - apexProgress) * -40;
  const apexPt = p(0, 0, 92, apexZOffset);
  const pulseOpacity = 0.4 + 0.6 * ((Math.sin(frame / 15) + 1) / 2);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {floorProgress > 0 && (
        <g opacity={floorProgress}>
          <polygon 
            points={floorPts.map(pt => p(...pt).join(",")).join(" ")} 
            fill={strokeColor} 
            fillOpacity={0.01} 
            stroke={strokeColor} 
            strokeOpacity={0.15} 
            strokeWidth={0.2} 
          />
          {[-40, 0, 40].map((val) => (
            <React.Fragment key={val}>
              <line 
                x1={p(val, -80, -20)[0]} y1={p(val, -80, -20)[1]} 
                x2={p(val, 80, -20)[0]} y2={p(val, 80, -20)[1]} 
                stroke={strokeColor} strokeOpacity={0.06} strokeWidth={0.2} 
              />
              <line 
                x1={p(-80, val, -20)[0]} y1={p(-80, val, -20)[1]} 
                x2={p(80, val, -20)[0]} y2={p(80, val, -20)[1]} 
                stroke={strokeColor} strokeOpacity={0.06} strokeWidth={0.2} 
              />
            </React.Fragment>
          ))}
        </g>
      )}

      {drawBlock(leftLegOpts.bl, leftLegOpts.br, leftLegOpts.tr, leftLegOpts.tl, leftLegOpts.y1, leftLegOpts.y2, leftProgress)}
      
      <Tracer 
        start={p(-45, 8, 0, (1 - leftProgress) * -40)}
        end={p(-22, 8, 80, (1 - leftProgress) * -40)}
        progress={leftProgress}
        offset={interpolate(frame % 150, [0, 150], [100, -15])}
      />

      {drawBlock(crossOpts.bl, crossOpts.br, crossOpts.tr, crossOpts.tl, crossOpts.y1, crossOpts.y2, crossbarProgress)}

      <Tracer 
        start={p(-15, 8, 35, (1 - crossbarProgress) * -40)}
        end={p(15, 8, 35, (1 - crossbarProgress) * -40)}
        progress={crossbarProgress}
        offset={interpolate((frame + 50) % 150, [0, 150], [100, -15])}
      />

      {drawBlock(rightLegOpts.bl, rightLegOpts.br, rightLegOpts.tr, rightLegOpts.tl, rightLegOpts.y1, rightLegOpts.y2, rightProgress)}

      <Tracer 
        start={p(22, 8, 80, (1 - rightProgress) * -40)}
        end={p(45, 8, 0, (1 - rightProgress) * -40)}
        progress={rightProgress}
        offset={interpolate((frame + 100) % 150, [0, 150], [100, -15])}
      />

      {apexProgress > 0 && (
        <g opacity={apexProgress}>
          <circle cx={apexPt[0]} cy={apexPt[1]} r={4} fill={strokeColor} opacity={pulseOpacity * 0.15} />
          <circle cx={apexPt[0]} cy={apexPt[1]} r={2.2} fill={strokeColor} opacity={0.8} />
          <circle cx={apexPt[0]} cy={apexPt[1]} r={4.5} fill="none" stroke={strokeColor} strokeWidth={0.3} opacity={0.4} />
        </g>
      )}
    </svg>
  );
};
