/**
 * HeroLive — animated port of `landing/src/components/Hero.astro` for Beat 1.
 *
 * Mounts at `top: 184px` (72 nav + 112 gap, matching the landing's
 * `.hero { padding: 184px 32px 0 }`), reproducing the brand entrance
 * gesture: pill fade + conic trace → title deblur → "agentically"
 * metallic shimmer → subhead word-stagger → CTA rise. All driven by
 * useCurrentFrame() so rendering is deterministic.
 */
import React, { useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ConicTrace } from "../../primitives/ConicTrace";
import { ShimmerText } from "../../primitives/MetallicShimmer";

export type HeroLiveProps = {
  /** Composition width in px. Hero is a centered 880-wide block inside it. */
  width: number;
};

const INTER_STACK = "'Inter Variable', Inter, system-ui, sans-serif";
const MONO_STACK = "'Geist Mono Variable', ui-monospace, monospace";

const TEXT = "#F7F8F8";
const TEXT_MUTED = "#a1a1a6";

const SUBHEAD =
  "Upload a CSV. Describe your goal. Walk away. Come back to deployed models, ranked experiments, and a notebook that explains every decision.";

/**
 * Word-stagger subhead. Each word fades in over 10 frames, staggered by
 * 3 frames (40 ms / word at 60 fps). Starts at frame 54 (900 ms).
 */
const SubheadWordStagger: React.FC<{ frame: number }> = ({ frame }) => {
  const words = useMemo(() => SUBHEAD.split(/\s+/), []);
  const BASE = 54;
  const STAGGER = 3;
  const FADE = 10;

  return (
    <p
      style={{
        margin: "24px auto 0",
        maxWidth: 620,
        fontFamily: MONO_STACK,
        fontSize: 18,
        fontWeight: 400,
        color: TEXT_MUTED,
        lineHeight: 1.55,
      }}
    >
      {words.map((word, i) => {
        const start = BASE + i * STAGGER;
        const opacity = interpolate(frame, [start, start + FADE], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const ty = interpolate(frame, [start, start + FADE], [4, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <React.Fragment key={i}>
            <span
              style={{
                display: "inline-block",
                opacity,
                transform: `translateY(${ty}px)`,
              }}
            >
              {word}
            </span>
            {i < words.length - 1 ? " " : null}
          </React.Fragment>
        );
      })}
    </p>
  );
};

export const HeroLive: React.FC<HeroLiveProps> = ({ width }) => {
  const frame = useCurrentFrame();

  // Pill fade (100–600 ms → 6–36 f).
  const pillOpacity = interpolate(frame, [6, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pillTy = interpolate(frame, [6, 36], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title deblur — bright line (300–1080 ms → 18–66 f).
  const brightOpacity = interpolate(frame, [18, 66], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const brightBlur = interpolate(frame, [18, 66], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const brightTy = interpolate(frame, [18, 66], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const brightScale = interpolate(frame, [18, 66], [0.985, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title deblur — muted line (440–1220 ms → 26–74 f).
  const mutedOpacity = interpolate(frame, [26, 74], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const mutedBlur = interpolate(frame, [26, 74], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const mutedTy = interpolate(frame, [26, 74], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const mutedScale = interpolate(frame, [26, 74], [0.985, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // CTA (1200 ms → 72 f).
  const ctaOpacity = interpolate(frame, [72, 102], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ctaTy = interpolate(frame, [72, 102], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pill dimensions — approximate from landing measurements.
  const pillWidth = 384;
  const pillHeight = 34;

  return (
    <section
      style={{
        maxWidth: 880,
        margin: "0 auto",
        padding: "0 32px",
        textAlign: "center",
        width,
        boxSizing: "border-box",
      }}
    >
      {/* Announcement pill */}
      <div
        style={{
          display: "inline-block",
          position: "relative",
          opacity: pillOpacity,
          transform: `translateY(${pillTy}px)`,
        }}
      >
        <div
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: MONO_STACK,
            fontSize: 16,
            color: TEXT_MUTED,
            padding: "7px 16px",
            borderRadius: 999,
            background: "rgba(10, 10, 11, 1)",
          }}
        >
          {/* Conic trace overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
            }}
          >
            <ConicTrace
              startFrame={12}
              cycleFrames={75}
              width={pillWidth}
              height={pillHeight}
              borderRadius={pillHeight / 2}
              strokeWidth={1}
              trailColor="rgba(255, 255, 255, 0.06)"
            />
          </div>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: TEXT,
              display: "inline-block",
              boxShadow: "0 0 6px rgba(247, 248, 248, 0.4)",
            }}
            aria-hidden="true"
          />
          <span>Now supporting GPT 5.4 class reasoning</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3.5 8H12.5M12.5 8L8.5 4M12.5 8L8.5 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* H1 */}
      <h1
        style={{
          margin: "32px 0 0",
          fontFamily: INTER_STACK,
          fontWeight: 510,
          fontSize: 72,
          lineHeight: 1.06,
          letterSpacing: "-0.022em",
        }}
      >
        <span
          style={{
            color: TEXT,
            display: "block",
            opacity: brightOpacity,
            filter: `blur(${brightBlur}px)`,
            transform: `translateY(${brightTy}px) scale(${brightScale})`,
            transformOrigin: "center",
          }}
        >
          The fastest way to build production ML models,
        </span>
        <span
          style={{
            color: TEXT_MUTED,
            display: "block",
            paddingBottom: "0.08em",
            opacity: mutedOpacity,
            filter: `blur(${mutedBlur}px)`,
            transform: `translateY(${mutedTy}px) scale(${mutedScale})`,
            transformOrigin: "center",
          }}
        >
          <ShimmerText
            text="agentically."
            startFrame={81}
            cycleFrames={252}
            gradient={`linear-gradient(90deg, ${TEXT_MUTED} 0%, ${TEXT_MUTED} 42%, #E2E6ED 50%, ${TEXT_MUTED} 58%, ${TEXT_MUTED} 100%)`}
          />
        </span>
      </h1>

      <SubheadWordStagger frame={frame} />

      {/* CTA */}
      <div
        style={{
          marginTop: 40,
          display: "flex",
          justifyContent: "center",
          opacity: ctaOpacity,
          transform: `translateY(${ctaTy}px)`,
        }}
      >
        <span
          style={{
            fontFamily: INTER_STACK,
            fontSize: 16,
            fontWeight: 510,
            color: "#0A0A0B",
            background: "linear-gradient(180deg, #F7F8F8 0%, #E6E6E6 100%)",
            padding: "0 40px",
            height: 44,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 6,
            boxShadow:
              "0 0 0 1px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.08)",
          }}
        >
          Get Started
          <svg
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3.5 8H12.5M12.5 8L8.5 4M12.5 8L8.5 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </section>
  );
};
