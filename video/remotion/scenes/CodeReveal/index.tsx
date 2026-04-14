import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
} from "remotion";
import type { z } from "zod";
import { MONOSPACE_FONT, TITLE_FONT } from "../../../config/fonts";
import type { codeRevealScene } from "../../../config/scenes";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { SceneVoiceover } from "../../helpers/SceneVoiceover";
import { useFadeIn } from "../../helpers/useFadeIn";

type CodeRevealSceneType = z.infer<typeof codeRevealScene>;

type Props = {
  scene: CodeRevealSceneType;
  theme: Theme;
};

/**
 * Code reveal scene — syntax-highlighted code on a card surface, with a
 * "scan-in" mask animation that reveals the code top-to-bottom, plus an
 * optional line-range highlight.
 *
 * Single-state code for v1. For multi-state token-by-token morphs (à la
 * shiki-magic-move), extend this component to accept an array of code
 * snapshots and interpolate between them.
 *
 * Highlighting uses `shiki` loaded on demand (wrapped in delayRender) so
 * non-code scenes don't pay the bundle cost.
 */
export const CodeReveal: React.FC<Props> = ({ scene, theme }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [loadingHandle] = useState(() => delayRender("Highlighting code"));

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const result = await codeToHtml(scene.code, {
          lang: scene.language,
          theme: theme === "dark" ? "github-dark" : "github-light",
        });
        if (!cancelled) {
          setHtml(result);
          continueRender(loadingHandle);
        }
      } catch (err) {
        if (!cancelled) cancelRender(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scene.code, scene.language, theme, loadingHandle]);

  const { progress, opacity } = useFadeIn({ durationInFrames: 24 });
  const maskPct = interpolate(progress, [0, 1], [0, 100]);
  const c = COLORS[theme];

  return (
    <AbsoluteFill
      style={{
        background: c.BACKGROUND,
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1600,
          background: c.BACKGROUND_ELEVATED,
          border: `1px solid ${c.BORDER_COLOR}`,
          borderRadius: 20,
          boxShadow:
            theme === "dark"
              ? "0 30px 80px -12px rgba(0,0,0,0.6)"
              : "0 30px 80px -12px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        {scene.title ? (
          <div
            style={{
              ...TITLE_FONT,
              fontSize: 28,
              color: c.WORD_COLOR_ON_BG_APPEARED,
              padding: "20px 28px",
              borderBottom: `1px solid ${c.BORDER_COLOR}`,
              background: c.BACKGROUND,
              opacity,
            }}
          >
            {scene.title}
          </div>
        ) : null}

        <div
          style={{
            position: "relative",
            padding: 32,
            opacity,
            WebkitMaskImage: `linear-gradient(to bottom, black ${maskPct}%, transparent ${maskPct}%)`,
            maskImage: `linear-gradient(to bottom, black ${maskPct}%, transparent ${maskPct}%)`,
          }}
        >
          <style>{getHighlightCss(scene.highlight, c.ACCENT_COLOR)}</style>
          {html ? (
            <div
              className="shiki-code-reveal"
              style={{
                ...MONOSPACE_FONT,
                fontSize: 24,
                lineHeight: 1.55,
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 24,
                color: c.WORD_COLOR_ON_BG_GREYED,
                whiteSpace: "pre",
              }}
            >
              {scene.code}
            </div>
          )}
        </div>
      </div>

      <SceneVoiceover file={scene.voiceoverFile} />
    </AbsoluteFill>
  );
};

/**
 * Convert a `#rrggbb` hex accent color to a 0–1 alpha rgba() string.
 * Used for line-highlight backgrounds + left-rail.
 */
const hexToRgba = (hex: string, alpha: number): string => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex; // caller passed non-hex — give up gracefully
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Generate CSS that highlights a given set of 1-indexed line ranges by
 * selecting `.shiki .line:nth-child(N)` for each included line.
 */
const getHighlightCss = (
  highlight: CodeRevealSceneType["highlight"],
  accentColor: string,
): string => {
  if (!highlight || highlight.length === 0) return "";
  const includedLines = new Set<number>();
  highlight.forEach(([start, end]) => {
    for (let n = start; n <= end; n += 1) includedLines.add(n);
  });
  const selectors = Array.from(includedLines)
    .map((n) => `.shiki-code-reveal .shiki .line:nth-child(${n})`)
    .join(",\n");
  if (!selectors) return "";
  return `
    .shiki-code-reveal .shiki .line { padding: 0 8px; border-radius: 6px; }
    ${selectors} {
      background: ${hexToRgba(accentColor, 0.14)};
      box-shadow: inset 2px 0 0 0 ${hexToRgba(accentColor, 0.8)};
    }
  `;
};
