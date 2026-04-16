import React from "react";
import {
  Easing,
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
        <path d="M14 8L5 26" stroke={strokeColor} strokeWidth={2.5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={leftLegOffset} />
        <path d="M9 18H19.5" stroke={strokeColor} strokeWidth={2.5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={crossbarOffset} />
        <path d="M18 8L27 26" stroke={strokeColor} strokeWidth={2.5} strokeLinecap="round" pathLength={1} strokeDasharray={1} opacity={RIGHT_LEG_OPACITY} strokeDashoffset={rightLegOffset} />
        <circle cx={16} cy={4} r={3} fill={strokeColor} opacity={apexOpacityBase} style={{ transform: `scale(${apexScale})`, transformOrigin: "16px 4px" }} />
      </svg>
    );
  }

  // === 3D ISOMETRIC VARIANT ===

  // Assembly Springs
  const floorProgress = isStatic ? 1 : spring({ fps, frame: frame - delay, config: SPRING_HERO, durationInFrames: 30 });
  const leftProgress = isStatic ? 1 : spring({ fps, frame: frame - leftLegStart, config: SPRING_HERO, durationInFrames: 25 });
  const crossbarProgress = isStatic ? 1 : spring({ fps, frame: frame - crossbarStart, config: SPRING_HERO, durationInFrames: 25 });
  const rightProgress = isStatic ? 1 : spring({ fps, frame: frame - rightLegStart, config: SPRING_HERO, durationInFrames: 25 });
  const apexProgress = isStatic ? 1 : spring({ fps, frame: frame - apexStart, config: SPRING_HERO, durationInFrames: 20 });

  // Timeline Constants for Morphing
  const ROTATE_START = delay + 60;
  const ROTATE_DURATION = 150;
  const MORPH_START = delay + 150;
  const MORPH_DURATION = 60;

  // Rotation Progress
  const rotationProgress = isStatic
    ? 0
    : interpolate(frame, [ROTATE_START, ROTATE_START + ROTATE_DURATION], [0, 1], {
        easing: Easing.inOut(Easing.cubic),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
  const angle = rotationProgress * Math.PI * 2;

  // Morphing Progress (Perspective Shift to 2D)
  const morph = isStatic
    ? 0
    : interpolate(frame, [MORPH_START, MORPH_START + MORPH_DURATION], [0, 1], {
        easing: Easing.inOut(Easing.cubic),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  // Master Projection Function (Isometric -> Target 2D)
  const getPoint = (x: number, y: number, z: number, target2D?: [number, number]) => {
    // 1. Z-axis Rotation
    const rx = x * Math.cos(angle) - y * Math.sin(angle);
    const ry = x * Math.sin(angle) + y * Math.cos(angle);
    
    // 2. Strict Isometric Projection
    const sx_iso = 16 + (rx - ry) * 0.866025 * 0.14;
    const sy_iso = 16 + (rx + ry) * 0.5 * 0.14 - z * 0.14;
    
    if (!target2D) return [sx_iso, sy_iso] as [number, number];
    
    // 3. Morph target transition
    return [
      interpolate(morph, [0, 1], [sx_iso, target2D[0]]),
      interpolate(morph, [0, 1], [sy_iso, target2D[1]])
    ] as [number, number];
  };

  const drawBlock = (
    bl: [number, number],
    br: [number, number],
    tr: [number, number],
    tl: [number, number],
    y1: number,
    y2: number,
    progress: number,
    targets: { bl: [number, number], br: [number, number], tr: [number, number], tl: [number, number] }
  ) => {
    if (progress <= 0) return null;
    const zOffset = (1 - progress) * -40;
    
    // Fade out faces entirely when morph is complete
    const blockOpacity = progress * interpolate(morph, [0.8, 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    if (blockOpacity <= 0) return null;

    const rightFace = [
      getPoint(br[0], y2, br[1] + zOffset, targets.br),
      getPoint(tr[0], y2, tr[1] + zOffset, targets.tr),
      getPoint(tr[0], y1, tr[1] + zOffset, targets.tr),
      getPoint(br[0], y1, br[1] + zOffset, targets.br),
    ];
    const topFace = [
      getPoint(tl[0], y2, tl[1] + zOffset, targets.tl),
      getPoint(tr[0], y2, tr[1] + zOffset, targets.tr),
      getPoint(tr[0], y1, tr[1] + zOffset, targets.tr),
      getPoint(tl[0], y1, tl[1] + zOffset, targets.tl),
    ];
    const frontFace = [
      getPoint(bl[0], y2, bl[1] + zOffset, targets.bl),
      getPoint(br[0], y2, br[1] + zOffset, targets.br),
      getPoint(tr[0], y2, tr[1] + zOffset, targets.tr),
      getPoint(tl[0], y2, tl[1] + zOffset, targets.tl),
    ];
    
    return (
      <g 
        stroke={strokeColor} 
        strokeOpacity={0.4} 
        strokeWidth={0.3} 
        strokeLinejoin="round"
        opacity={blockOpacity}
      >
        <polygon points={rightFace.map(pt => pt.join(",")).join(" ")} fill={strokeColor} fillOpacity={0.06} />
        <polygon points={topFace.map(pt => pt.join(",")).join(" ")} fill={strokeColor} fillOpacity={0.16} />
        <polygon points={frontFace.map(pt => pt.join(",")).join(" ")} fill={strokeColor} fillOpacity={0.1} />
      </g>
    );
  };

  const MorphLine = ({
    x1, z1, x2, z2,
    target1, target2,
    progress, offset, finalOpacity = 1
  }: {
    x1: number, z1: number, x2: number, z2: number,
    target1: [number, number], target2: [number, number],
    progress: number, offset: number, finalOpacity?: number
  }) => {
    if (progress <= 0) return null;
    const zOffset = (1 - progress) * -40;
    
    const p1 = getPoint(x1, 0, z1 + zOffset, target1);
    const p2 = getPoint(x2, 0, z2 + zOffset, target2);
    
    // Background dash fades out
    const tracerOpacity = interpolate(morph, [0, 0.8], [0.3, 0], { extrapolateRight: "clamp" });
    
    // Core line solidifies into the final simple mark
    const solidDashGap = interpolate(morph, [0, 1], [100, 0], { extrapolateRight: "clamp" });
    const solidDashLen = interpolate(morph, [0, 1], [15, 100], { extrapolateRight: "clamp" });
    const currentOffset = interpolate(morph, [0, 1], [offset, 0], { extrapolateRight: "clamp" });
    
    const sw = interpolate(morph, [0.5, 1], [0.3, 2.5], { extrapolateLeft: 'clamp', extrapolateRight: "clamp" });
    const op = interpolate(morph, [0, 1], [0.9, finalOpacity], { extrapolateRight: "clamp" });

    return (
      <g opacity={progress}>
        {tracerOpacity > 0 && (
          <line
            x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]}
            stroke={strokeColor}
            strokeWidth={0.8}
            pathLength="100"
            strokeDasharray="15 100"
            strokeDashoffset={offset}
            opacity={tracerOpacity}
            strokeLinecap="round"
          />
        )}
        <line
          x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]}
          stroke={strokeColor}
          strokeWidth={sw}
          pathLength="100"
          strokeDasharray={`${solidDashLen} ${solidDashGap}`}
          strokeDashoffset={currentOffset}
          opacity={op}
          strokeLinecap="round"
        />
      </g>
    );
  };

  // Base coordinates for 3D physical components
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

  const floorOpacity = interpolate(morph, [0, 0.5], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Apex Animation targets
  const apexZOffset = (1 - apexProgress) * -40;
  const apexPt = getPoint(0, 0, 92 + apexZOffset, [16, 4]);
  const pulseOpacity = 0.4 + 0.6 * ((Math.sin(frame / 15) + 1) / 2);
  const ringOpacity = interpolate(morph, [0, 0.5], [1, 0], { extrapolateRight: "clamp" });
  const innerR = interpolate(morph, [0, 1], [2.2, 3], { extrapolateRight: "clamp" });
  const innerOpacity = interpolate(morph, [0, 1], [0.8, 1], { extrapolateRight: "clamp" });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {floorProgress > 0 && floorOpacity > 0 && (
        <g opacity={floorProgress * floorOpacity}>
          <polygon 
            points={floorPts.map(pt => getPoint(pt[0], pt[1], pt[2]).join(",")).join(" ")} 
            fill={strokeColor} 
            fillOpacity={0.01} 
            stroke={strokeColor} 
            strokeOpacity={0.15} 
            strokeWidth={0.2} 
          />
          {[-40, 0, 40].map((val) => {
            const p1 = getPoint(val, -80, -20);
            const p2 = getPoint(val, 80, -20);
            const p3 = getPoint(-80, val, -20);
            const p4 = getPoint(80, val, -20);
            return (
              <React.Fragment key={val}>
                <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={strokeColor} strokeOpacity={0.06} strokeWidth={0.2} />
                <line x1={p3[0]} y1={p3[1]} x2={p4[0]} y2={p4[1]} stroke={strokeColor} strokeOpacity={0.06} strokeWidth={0.2} />
              </React.Fragment>
            );
          })}
        </g>
      )}

      {drawBlock(
        leftLegOpts.bl, leftLegOpts.br, leftLegOpts.tr, leftLegOpts.tl, 
        leftLegOpts.y1, leftLegOpts.y2, leftProgress,
        { bl: [5, 26], br: [5, 26], tr: [14, 8], tl: [14, 8] }
      )}
      
      <MorphLine 
        x1={-35} z1={0} x2={-12} z2={80}
        target1={[5, 26]} target2={[14, 8]}
        progress={leftProgress}
        offset={interpolate(frame % 150, [0, 150], [100, -15])}
      />

      {drawBlock(
        crossOpts.bl, crossOpts.br, crossOpts.tr, crossOpts.tl, 
        crossOpts.y1, crossOpts.y2, crossbarProgress,
        { bl: [9, 18], br: [19.5, 18], tr: [19.5, 18], tl: [9, 18] }
      )}

      <MorphLine 
        x1={-13} z1={42.5} x2={13} z2={42.5}
        target1={[9, 18]} target2={[19.5, 18]}
        progress={crossbarProgress}
        offset={interpolate((frame + 50) % 150, [0, 150], [100, -15])}
      />

      {drawBlock(
        rightLegOpts.bl, rightLegOpts.br, rightLegOpts.tr, rightLegOpts.tl, 
        rightLegOpts.y1, rightLegOpts.y2, rightProgress,
        { bl: [27, 26], br: [27, 26], tr: [18, 8], tl: [18, 8] }
      )}

      <MorphLine 
        x1={35} z1={0} x2={12} z2={80}
        target1={[27, 26]} target2={[18, 8]}
        progress={rightProgress}
        offset={interpolate((frame + 100) % 150, [0, 150], [100, -15])}
        finalOpacity={RIGHT_LEG_OPACITY}
      />

      {apexProgress > 0 && (
        <g opacity={apexProgress}>
          {ringOpacity > 0 && (
            <circle cx={apexPt[0]} cy={apexPt[1]} r={interpolate(morph, [0, 1], [4, 0])} fill={strokeColor} opacity={pulseOpacity * 0.15 * ringOpacity} />
          )}
          <circle cx={apexPt[0]} cy={apexPt[1]} r={innerR} fill={strokeColor} opacity={innerOpacity} />
          {ringOpacity > 0 && (
            <circle cx={apexPt[0]} cy={apexPt[1]} r={interpolate(morph, [0, 1], [4.5, 0])} fill="none" stroke={strokeColor} strokeWidth={0.3} opacity={0.4 * ringOpacity} />
          )}
        </g>
      )}
    </svg>
  );
};
