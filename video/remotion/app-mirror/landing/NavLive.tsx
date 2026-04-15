/**
 * NavLive — animated port of `landing/src/components/Nav.astro` for Beat 1.
 *
 * Pinned at the top of the scroll viewport. Drives the brand wordmark's
 * long→short morph from scene frame 0 via useCurrentFrame(), matching the
 * landing's CSS keyframes:
 *
 *   - Long form out: 1600–2300 ms (opacity 1→0, blur 0→4px)
 *   - Short form in: 2000–2700 ms (opacity 0→1, blur 4→0px, translateX -2→0)
 *
 * Nav links + right-side CTA fade in on a small stagger (36–60 f).
 */
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

export type NavLiveProps = {
  /** Composition width in px (overlay stretches across this). */
  width: number;
};

/** Landing font stack — falls back to system-ui when variable fonts aren't loaded. */
const INTER_STACK = "'Inter Variable', Inter, system-ui, sans-serif";
const MONO_STACK = "'Geist Mono Variable', ui-monospace, monospace";

const TEXT = "#F7F8F8";
const TEXT_MUTED = "#a1a1a6";

export const NavLive: React.FC<NavLiveProps> = ({ width }) => {
  const frame = useCurrentFrame();

  // Long → short wordmark morph. Frames at 60 fps.
  const longOpacity = interpolate(frame, [96, 138], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const longBlur = interpolate(frame, [96, 138], [0, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shortOpacity = interpolate(frame, [120, 162], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shortBlur = interpolate(frame, [120, 162], [4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shortTx = interpolate(frame, [120, 162], [-2, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Staggered fade-in for nav items (36–60 f).
  const navLinksFade = interpolate(frame, [36, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const navRightFade = interpolate(frame, [36, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <header
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        width,
        height: 72,
        backgroundImage:
          "linear-gradient(rgba(10,10,11,0.80) 0%, rgba(10,10,11,0.76) 100%)",
        backdropFilter: "blur(20px)",
        borderBottom: "0.8px solid rgba(255,255,255,0.08)",
        zIndex: 100,
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          height: "100%",
          margin: "0 auto",
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: 24, height: 24, color: TEXT, flexShrink: 0 }}
            aria-hidden="true"
          >
            <circle cx="16" cy="4" r="3" fill="currentColor" />
            <path
              d="M14 8L5 26"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M18 8L27 26"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.4"
            />
            <path
              d="M9 18H19.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          <span
            style={{
              position: "relative",
              display: "inline-block",
              fontFamily: INTER_STACK,
              fontSize: 16,
              fontWeight: 590,
              color: TEXT,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            }}
            aria-label="Agentic AutoML"
          >
            <span
              style={{
                display: "inline-block",
                opacity: longOpacity,
                filter: `blur(${longBlur}px)`,
                transformOrigin: "left center",
                whiteSpace: "nowrap",
              }}
            >
              Agentic AutoML ToolChain
            </span>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                opacity: shortOpacity,
                transform: `translateX(${shortTx}px)`,
                filter: `blur(${shortBlur}px)`,
                whiteSpace: "nowrap",
              }}
            >
              AutoML
            </span>
          </span>
        </div>

        <nav
          aria-label="Primary"
          style={{ display: "flex", gap: 8, opacity: navLinksFade }}
        >
          {["Product", "Features", "How it works"].map((label) => (
            <span
              key={label}
              style={{
                fontFamily: MONO_STACK,
                fontSize: 13,
                fontWeight: 400,
                color: TEXT_MUTED,
                padding: "0 12px",
                height: 32,
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 4,
              }}
            >
              {label}
            </span>
          ))}
        </nav>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: navRightFade,
          }}
        >
          <span
            style={{
              fontFamily: INTER_STACK,
              fontSize: 14,
              fontWeight: 510,
              color: TEXT_MUTED,
              height: 32,
              padding: "0 4px",
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 4,
            }}
          >
            Sign In
          </span>
          <span
            style={{
              fontFamily: INTER_STACK,
              fontSize: 14,
              fontWeight: 510,
              color: "#0A0A0B",
              background: "linear-gradient(180deg, #F7F8F8 0%, #E6E6E6 100%)",
              padding: "0 16px",
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 6,
              boxShadow:
                "0 0 0 1px rgba(255, 255, 255, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 1px 2px rgba(0, 0, 0, 0.12)",
            }}
          >
            Get Started
          </span>
        </div>
      </div>
    </header>
  );
};
