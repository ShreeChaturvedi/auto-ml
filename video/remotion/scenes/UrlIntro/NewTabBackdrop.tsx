import React from "react";
import { staticFile } from "remotion";

/**
 * Painterly new-tab backdrop rendered inside the UrlIntro scene's browser
 * chrome. Visual twin of `landing/src/pages/newtab.astro` — both surfaces
 * reference the same `backgrounds/newtab-bg.webp` asset so the Remotion
 * scene and the real Astro new-tab tab look identical.
 *
 * Layering (bottom → top):
 *   1. painterly webp background
 *   2. pastel color-blob overlay (warm tint)
 *   3. radial vignette
 *   4. SVG turbulence grain (mix-blend-mode: overlay, 3% opacity)
 *   5. Google-alike wordmark + search bar (centered, ~28% from top)
 *
 * The backdrop is STATIC — no animation inside. The caller (UrlIntro scene)
 * handles the zoom, the URL typer, and the cut to landing.
 */
export type NewTabBackdropProps = {
  /** Relative path inside `public/` (e.g. "backgrounds/newtab-bg.webp"). */
  backgroundAsset?: string;
};

export const NewTabBackdrop: React.FC<NewTabBackdropProps> = ({ backgroundAsset }) => {
  // Fallback to a pastel CSS gradient when no asset is supplied — keeps
  // Studio previewing the scene layout even before the webp is generated.
  const bgImage = backgroundAsset
    ? `url(${staticFile(backgroundAsset)})`
    : "radial-gradient(ellipse at 30% 20%, #F6D7C8 0%, #E3C7D9 35%, #C8D5E9 70%, #B8C7DF 100%)";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#E6D2CA",
      }}
    >
      {/* 1. Painterly background image (or fallback gradient). */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: bgImage,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(0.9) brightness(1.02) contrast(0.94)",
        }}
      />

      {/* 2. Pastel warm-tint color-blob overlay. */}
      <div
        style={{
          position: "absolute",
          left: "12%",
          top: "16%",
          width: "36%",
          height: "42%",
          background:
            "radial-gradient(ellipse at center, rgba(242,175,195,0.22) 0%, rgba(242,175,195,0) 70%)",
          filter: "blur(24px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "10%",
          bottom: "14%",
          width: "32%",
          height: "38%",
          background:
            "radial-gradient(ellipse at center, rgba(196,220,240,0.2) 0%, rgba(196,220,240,0) 70%)",
          filter: "blur(24px)",
          pointerEvents: "none",
        }}
      />

      {/* 3. Radial vignette. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(40,28,20,0.32) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* 3b. Chromatic fringe — subtle pastel blobs on edges. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(232,170,170,0.08), transparent 60%), " +
            "radial-gradient(ellipse at 75% 80%, rgba(140,170,200,0.06), transparent 55%)",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* 4. SVG turbulence grain overlay. */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          mixBlendMode: "soft-light",
          opacity: 0.18,
          pointerEvents: "none",
        }}
        aria-hidden
      >
        <filter id="newtab-grain">
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves={3} seed={5} />
        </filter>
        <rect width="100%" height="100%" filter="url(#newtab-grain)" />
      </svg>

      {/* 5. Centered wordmark + search bar. */}
      <div
        style={{
          position: "absolute",
          top: "28%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          width: 680,
        }}
      >
        <Wordmark />
        <SearchBar />
      </div>
    </div>
  );
};

/**
 * Google colored-letter wordmark — matches `newtab.astro`'s treatment.
 * Product Sans 92 px with the real per-letter brand colors.
 */
const GOOGLE_LETTERS: Array<{ char: string; color: string }> = [
  { char: "G", color: "#4285F4" },
  { char: "o", color: "#EA4335" },
  { char: "o", color: "#FBBC05" },
  { char: "g", color: "#4285F4" },
  { char: "l", color: "#34A853" },
  { char: "e", color: "#EA4335" },
];

const Wordmark: React.FC = () => {
  return (
    <div
      aria-label="Google"
      style={{
        fontFamily: "'Product Sans','Google Sans',Arial,sans-serif",
        fontSize: 92,
        fontWeight: 400,
        letterSpacing: -2,
        lineHeight: 1,
        textShadow: "0 2px 12px rgba(0,0,0,0.15)",
        userSelect: "none",
      }}
    >
      {GOOGLE_LETTERS.map((l, i) => (
        <span key={i} style={{ color: l.color }}>
          {l.char}
        </span>
      ))}
    </div>
  );
};

/**
 * Google-style search bar — 584×46 with magnifier, mic, and lens icons.
 * Visual twin of `newtab.astro`'s `.gg-search`. No real input — this is a
 * static Remotion frame. The UrlIntro scene's typing happens in the browser
 * chrome's address bar, not here.
 */
const SearchBar: React.FC = () => {
  return (
    <div
      style={{
        width: 584,
        height: 46,
        padding: "0 14px",
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid #dfe1e5",
        borderRadius: 24,
        boxShadow: "0 1px 6px rgba(32,33,36,.12)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      {/* Magnifier icon */}
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z"
          fill="#9aa0a6"
        />
      </svg>

      {/* Placeholder text */}
      <span
        style={{
          flex: 1,
          font: "16px/24px Arial,sans-serif",
          color: "#5f6368",
          userSelect: "none",
        }}
      >
        Search Google or type a URL
      </span>

      {/* Voice (mic) icon */}
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" fill="#4285F4" />
        <path d="M11 5v6a1 1 0 002 0V5a1 1 0 00-2 0z" fill="#34A853" />
        <path d="M17 11a5 5 0 01-10 0H5a7 7 0 0014 0h-2z" fill="#EA4335" />
        <path d="M12 18a7 7 0 007-7h-2a5 5 0 01-5 5v2z" fill="#FBBC05" />
        <rect x={11} y={18} width={2} height={4} rx={1} fill="#9aa0a6" />
        <rect x={9} y={21} width={6} height={2} rx={1} fill="#9aa0a6" />
      </svg>

      {/* Lens icon */}
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx={12} cy={12} r={3.5} stroke="#4285F4" strokeWidth={1.5} />
        <path d="M3 7V5a2 2 0 012-2h2" stroke="#EA4335" strokeWidth={1.5} strokeLinecap="round" />
        <path d="M17 3h2a2 2 0 012 2v2" stroke="#FBBC05" strokeWidth={1.5} strokeLinecap="round" />
        <path d="M21 17v2a2 2 0 01-2 2h-2" stroke="#34A853" strokeWidth={1.5} strokeLinecap="round" />
        <path d="M7 21H5a2 2 0 01-2-2v-2" stroke="#4285F4" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    </div>
  );
};
