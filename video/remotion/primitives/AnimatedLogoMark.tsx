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
 * Designed with a high-end spatial geometry interface aesthetic (e.g. Linear/Vercel).
 * Features cinematic camera drift, true Z-axis parallax component separation, 
 * architectural blueprints, and endless flowing data pulses.
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

  // Sequencing
  const leftLegStart = delay;
  const crossbarStart = delay + LEG_FRAMES;
  const rightLegStart = delay + LEG_FRAMES + CROSSBAR_FRAMES;
  const apexStart = delay + LEG_FRAMES + CROSSBAR_FRAMES + RIGHT_LEG_FRAMES;

  // Path Draws
  const leftLegOffset = computeDrawOffset(frame, leftLegStart, LEG_FRAMES, isStatic);
  const crossbarOffset = computeDrawOffset(frame, crossbarStart, CROSSBAR_FRAMES, isStatic);
  const rightLegOffset = computeDrawOffset(frame, rightLegStart, RIGHT_LEG_FRAMES, isStatic);

  // Core Dynamics
  const apexProgress = isStatic
    ? 1
    : spring({
        fps,
        frame: frame - apexStart,
        config: SPRING_HERO,
        durationInFrames: APEX_FRAMES,
      });

  const apexScale = interpolate(apexProgress, [0, 1], [0, 1]);
  const apexOpacityBase = interpolate(apexProgress, [0, 1], [0, 1]);
  
  // Apex Physical Sphere Coordinates (Mapped via percentages to keep native size independence)
  const orbLeft = `${(13 / 32) * 100}%`;
  const orbTop = `${(1 / 32) * 100}%`;
  const orbSize = `${(6 / 32) * 100}%`;

  const isDark = theme === "dark";

  // 1. Rigid, Mathematical Geometric Perspective (Fixed product angle, NO rotating drift)
  const cameraX = 25;
  const cameraY = -25;
  const cameraZ = 0;

  // 2. Exacting Monochromatic Aesthetic (Vercel/Linear inspired Grayscale)
  const chassisColor = isDark ? "#171717" : "#AAAAAA"; // Heavy physical edge value
  const strokeLinecap = "square"; // Rigid mathematical edges, NO rounded "flag" soft ends
  const sparkColor = isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.8)"; // Pure contrast data

  // Data agent speeds tracing the architecture
  const pulseSpeed1 = -((frame * 0.015) % 1);
  const pulseSpeed2 = -((frame * 0.012) % 1);

  // Outer SCENE bounds
  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    position: "relative",
    perspective: "1200px",
  };

  // Fixed Structural Architecture Transform
  const sceneStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    position: "absolute",
    inset: 0,
    transformStyle: "preserve-3d",
    transform: `rotateX(${cameraX}deg) rotateY(${cameraY}deg) rotateZ(${cameraZ}deg)`,
    transformOrigin: "center center",
  };

  const svgBaseStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    transformStyle: "preserve-3d",
  };

  // 3. Ambient Lighting Physics: Specular reflection sweep passing over the stationary metal structure
  const lightShift = (frame * 1.5) % 300 - 50;

  // If simple variant, skip 3D scene rendering entirely and return flat SVG.
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

  return (
    <div style={containerStyle}>
      <div style={sceneStyle}>
        
        {/* Dynamic Specular Shaders */}
        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <defs>
            <linearGradient id="specular-sweep" x1={`${lightShift - 100}%`} y1="0%" x2={`${lightShift}%`} y2="100%">
              <stop offset="0%" stopColor={isDark ? "#2A2A2A" : "#CCCCCC"} />
              <stop offset="30%" stopColor={isDark ? "#555555" : "#AAAAAA"} />
              <stop offset="50%" stopColor={isDark ? "#FFFFFF" : "#000000"} />
              <stop offset="70%" stopColor={isDark ? "#555555" : "#AAAAAA"} />
              <stop offset="100%" stopColor={isDark ? "#2A2A2A" : "#CCCCCC"} />
            </linearGradient>
          </defs>
        </svg>

        {/* 4. Perfect Ambient Grounding Shadow (Exactly mirrors the drawing architecture) */}
        <svg
          viewBox="0 0 32 32" fill="none"
          style={{ ...svgBaseStyle, transform: "translateZ(-25px)", opacity: isDark ? 0.35 : 0.15, filter: "blur(3px)" }}
        >
          <path d="M14 8L5 26" stroke="#000" strokeWidth={2.5} strokeLinecap={strokeLinecap} pathLength={1} strokeDasharray={1} strokeDashoffset={leftLegOffset} />
          <path d="M9 18H19.5" stroke="#000" strokeWidth={2.5} strokeLinecap={strokeLinecap} pathLength={1} strokeDasharray={1} strokeDashoffset={crossbarOffset} />
          <path d="M18 8L27 26" stroke="#000" strokeWidth={2.5} strokeLinecap={strokeLinecap} pathLength={1} strokeDasharray={1} strokeDashoffset={rightLegOffset} />
          <circle cx={16} cy={4} r={3} fill="#000" opacity={apexOpacityBase} />
        </svg>

        {/* 5. Monochromatic Titanium Chassis - Tight, rigid micro-bevel extrusion */}
        {Array.from({ length: 6 }).map((_, i) => {
          const isFront = i === 5;
          // Ultra tight precision depth. Not an exaggerated block. 
          const currentZ = -((5 - i) * 1.5); 
          const fillStroke = isFront ? "url(#specular-sweep)" : chassisColor;

          return (
            <svg
              key={i} viewBox="0 0 32 32" fill="none"
              style={{ ...svgBaseStyle, transform: `translateZ(${currentZ}px)` }}
            >
              <path d="M14 8L5 26" stroke={fillStroke} strokeWidth={2.5} strokeLinecap={strokeLinecap} pathLength={1} strokeDasharray={1} strokeDashoffset={leftLegOffset} />
              <path d="M9 18H19.5" stroke={fillStroke} strokeWidth={2.5} strokeLinecap={strokeLinecap} pathLength={1} strokeDasharray={1} strokeDashoffset={crossbarOffset} />
              {/* Opaque solid hardware legs for true metallic materiality */}
              <path d="M18 8L27 26" stroke={fillStroke} strokeWidth={2.5} strokeLinecap={strokeLinecap} pathLength={1} strokeDasharray={1} strokeDashoffset={rightLegOffset} />
            </svg>
          );
        })}

        {/* 6. Grayscale Data Circuit - Flawless minimal high-contrast pulses tracking the geometry */}
        <svg
          viewBox="0 0 32 32" fill="none"
          style={{ ...svgBaseStyle, transform: "translateZ(1px)" }}
        >
          <path d="M14 8L5 26" stroke={sparkColor} strokeWidth={1} strokeLinecap={strokeLinecap} pathLength={1} strokeDasharray="0.04 1" strokeDashoffset={pulseSpeed1} />
          <path d="M9 18H19.5" stroke={sparkColor} strokeWidth={1} strokeLinecap={strokeLinecap} pathLength={1} strokeDasharray="0.04 1" strokeDashoffset={pulseSpeed2} />
        </svg>

        {/* 7. The Hyper-Real Photorealistic Dom Sphere Node - Extreme polished physical asset */}
        <div style={{
          position: "absolute",
          width: orbSize, height: orbSize,
          left: orbLeft, top: orbTop,
          borderRadius: "50%",
          transform: `translateZ(4px) scale(${apexScale})`,
          // Intricate physical material rendering via multi-stop radial gradient caustics
          background: isDark 
            ? "radial-gradient(circle at 35% 20%, #FFFFFF 0%, #B0B0B0 20%, #444444 50%, #171717 80%, #303030 100%)"
            : "radial-gradient(circle at 35% 20%, #FFFFFF 0%, #EAEAEA 20%, #A0A0A0 50%, #707070 80%, #909090 100%)",
          boxShadow: isDark
            ? "inset -3px -4px 7px rgba(0,0,0,0.85), inset 2px 2px 6px rgba(255,255,255,0.65), 0 6px 10px rgba(0,0,0,0.6)"
            : "inset -3px -4px 7px rgba(0,0,0,0.3), inset 2px 2px 6px rgba(255,255,255,1), 0 6px 10px rgba(0,0,0,0.2)",
        }} />

      </div>
    </div>
  );
};

