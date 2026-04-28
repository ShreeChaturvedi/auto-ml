import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  siDocker,
  siExpress,
  siJupyter,
  siLangchain,
  siModelcontextprotocol,
  siNodedotjs,
  siPostgresql,
  siPytorch,
  siPython,
  siReact,
  siShadcnui,
  siTailwindcss,
  siVitest,
} from "simple-icons";
import type { SimpleIcon } from "simple-icons";
import { MONOSPACE_FONT } from "../../config/fonts";

/**
 * Brand icons use `simple-icons` (CC0 SVG path data). Model Context Protocol
 * is available as of v16.16. Tokens missing upstream — OpenAI, Zustand,
 * WebSocket, RAG — render as the `custom` branch with hand-authored single-
 * color glyphs (24×24 viewBox, currentColor). Remaining truly-anonymous labels
 * (Monaco) still render via the monospace-badge `chip` fallback.
 * `siLangchain` covers LangGraph too (no dedicated slug).
 */
const BRAND_ICONS = {
  react: siReact,
  tailwind: siTailwindcss,
  shadcn: siShadcnui,
  node: siNodedotjs,
  express: siExpress,
  postgres: siPostgresql,
  langchain: siLangchain,
  mcp: siModelcontextprotocol,
  python: siPython,
  pytorch: siPytorch,
  docker: siDocker,
  jupyter: siJupyter,
  vitest: siVitest,
} satisfies Record<string, SimpleIcon>;

type BrandName = keyof typeof BRAND_ICONS;

/**
 * Hand-authored monochrome marks for techs with no `simple-icons` entry.
 * Each uses the full 24 viewBox and renders with `currentColor` so tone="mono"
 * + phase dim + entry animation still work uniformly with brand/chip icons.
 *
 *  - `openai`    — the iconic OpenAI knot (6 rounded petals around a center)
 *  - `zustand`   — a stylized bear-ear silhouette (the library's mascot)
 *  - `websocket` — two opposing chevrons (⇄) suggesting bidirectional traffic
 *  - `rag`       — stacked document with a magnifier dot; "retrieve + augment"
 */
type CustomGlyph = {
  /** Display title (used for aria-label + <title>). */
  title: string;
  /** Inline SVG body; must reference `currentColor` for fill/stroke. */
  body: React.ReactNode;
};

const CUSTOM_ICONS: Record<string, CustomGlyph> = {
  openai: {
    title: "OpenAI",
    // Six rounded "petals" arranged radially around (12,12), rotated every 60°.
    // Each petal is a stadium (pill) whose short axis crosses the center,
    // producing the interleaved hex-flower silhouette of the OpenAI knot
    // without reproducing the trademark's exact vector data.
    body: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <rect
            key={deg}
            x={9}
            y={3}
            width={6}
            height={18}
            rx={3}
            ry={3}
            transform={`rotate(${deg} 12 12)`}
          />
        ))}
        <circle cx={12} cy={12} r={1.2} fill="currentColor" stroke="none" />
      </g>
    ),
  },
  zustand: {
    title: "Zustand",
    // Bear-head silhouette: two ear circles + round head + snout dot. Nods to
    // Zustand's bear mascot (the project's own logo is a bear with noodles).
    body: (
      <g fill="currentColor">
        <circle cx={7.5} cy={7} r={2.1} />
        <circle cx={16.5} cy={7} r={2.1} />
        <circle cx={12} cy={13} r={6.2} />
        <circle cx={12} cy={14.2} r={1.1} fill="#FFFFFF" />
      </g>
    ),
  },
  websocket: {
    title: "WebSocket",
    // Bidirectional arrows inside a rounded square — reads as "two-way socket"
    // without branding anything that isn't a brand.
    body: (
      <g fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x={3.5} y={3.5} width={17} height={17} rx={3.5} />
        <path d="M7.5 9.5 L16.5 9.5" />
        <path d="M13.5 7 L16.5 9.5 L13.5 12" />
        <path d="M16.5 14.5 L7.5 14.5" />
        <path d="M10.5 12 L7.5 14.5 L10.5 17" />
      </g>
    ),
  },
  rag: {
    title: "Retrieval-Augmented Generation",
    // Stacked document pages + a magnifier circle — the "retrieve + augment"
    // mental model made legible without relying on a trademark.
    body: (
      <g fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 5.5 L14.5 5.5 L17 8 L17 17 L6 17 Z" />
        <path d="M14.5 5.5 L14.5 8 L17 8" />
        <circle cx={15.5} cy={15.5} r={3.5} fill="#FFFFFF" />
        <circle cx={15.5} cy={15.5} r={3.5} />
        <path d="M18.1 18.1 L20.5 20.5" />
      </g>
    ),
  },
  gemini: {
    title: "Gemini",
    // Four-pointed star ("spark") — the Gemini brand silhouette without the
    // trademarked gradient. Single-fill currentColor.
    body: (
      <path
        d="M 12 2 C 12 8 14 10 22 12 C 14 14 12 16 12 22 C 12 16 10 14 2 12 C 10 10 12 8 12 2 Z"
        fill="currentColor"
      />
    ),
  },
  cursor: {
    title: "Cursor",
    // Classic diagonal mouse-pointer arrow with a short tail — a filled
    // triangle-ish glyph that reads as "click pointer" (NOT a text caret).
    body: (
      <g
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M 5 3 L 5 19.5 L 9.2 15.3 L 12 21.5 L 14.2 20.6 L 11.4 14.5 L 17.2 14.5 Z" />
      </g>
    ),
  },
};

type CustomName = keyof typeof CUSTOM_ICONS;

export type TechIconName = BrandName | "chip" | "custom";
export type TechIconTone = "brand" | "mono";

type TechIconCommon = {
  /** Pixel size (square). Default 24. */
  size?: number;
  /** `brand` uses simple-icons hex; `mono` inherits currentColor. Default "brand". */
  tone?: TechIconTone;
  /** Absolute frame when icon fades+scales in. Omit for static. */
  delay?: number;
  /** Accessible title override. Defaults to simple-icons `title` / chip label. */
  title?: string;
  style?: React.CSSProperties;
};

export type TechIconProps = TechIconCommon &
  (
    | { name: BrandName; label?: never; asset?: never }
    /** 2-4 char uppercase label (e.g. "MCP", "RAG"). Required for chips. */
    | { name: "chip"; label: string; asset?: never }
    /** Hand-authored mono glyph for techs without a `simple-icons` entry. */
    | { name: "custom"; asset: CustomName; label?: never }
  );

/** Opacity 0 -> 1, scale 0.85 -> 1.0 over ~18f when `delay` is set. */
const useEntry = (delay: number | undefined) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (delay === undefined) return { opacity: 1, scale: 1 };
  const progress = spring({
    fps,
    frame: frame - delay,
    config: { damping: 14 },
    durationInFrames: 18,
  });
  return {
    opacity: interpolate(progress, [0, 1], [0, 1]),
    scale: interpolate(progress, [0, 1], [0.85, 1]),
  };
};

export const TechIcon: React.FC<TechIconProps> = (props) => {
  const { size = 24, tone = "brand", delay, title, style } = props;
  const { opacity, scale } = useEntry(delay);

  const wrapperStyle: React.CSSProperties = {
    display: "inline-flex",
    verticalAlign: "middle",
    opacity,
    transform: `scale(${scale})`,
    transformOrigin: "center",
    ...style,
  };

  if (props.name === "chip") {
    const stroke = 1.5;
    const radius = 4;
    // Font sizing scales down gently for longer labels so 4 chars still fit.
    const fontSize = Math.round(size * (props.label.length >= 4 ? 0.36 : 0.42));
    return (
      <span
        role="img"
        aria-label={title ?? props.label}
        style={{ ...wrapperStyle, width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <title>{title ?? props.label}</title>
          <rect
            x={stroke / 2}
            y={stroke / 2}
            width={size - stroke}
            height={size - stroke}
            rx={radius}
            ry={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
          />
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            fill="currentColor"
            style={{
              ...MONOSPACE_FONT,
              fontSize,
              letterSpacing: "0.04em",
            }}
          >
            {props.label.toUpperCase()}
          </text>
        </svg>
      </span>
    );
  }

  if (props.name === "custom") {
    // `asset` is a literal union, so this lookup is total; the `!` asserts
    // the compile-time guarantee to TS's index signature checks.
    const glyph = CUSTOM_ICONS[props.asset]!;
    return (
      <span
        role="img"
        aria-label={title ?? glyph.title}
        style={{ ...wrapperStyle, width: size, height: size }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <title>{title ?? glyph.title}</title>
          {glyph.body}
        </svg>
      </span>
    );
  }

  const icon = BRAND_ICONS[props.name];
  const fill = tone === "brand" ? `#${icon.hex}` : "currentColor";
  return (
    <span
      role="img"
      aria-label={title ?? icon.title}
      style={{ ...wrapperStyle, width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <title>{title ?? icon.title}</title>
        <path d={icon.path} fill={fill} />
      </svg>
    </span>
  );
};
