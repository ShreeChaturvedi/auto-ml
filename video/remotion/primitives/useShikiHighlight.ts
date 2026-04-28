import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";

export type UseShikiHighlightArgs = {
  /** Source code string. */
  code: string;
  /** Shiki language id (e.g. 'ts', 'tsx', 'py'). */
  lang: string;
  /** Theme name. Falls back to github-light/-dark. */
  theme: "light" | "dark";
};

export type UseShikiHighlightResult = {
  /** Shiki-rendered HTML string, or null while loading. */
  html: string | null;
};

/**
 * Shared hook that loads Shiki lazily, renders the snippet to HTML, and
 * registers a `delayRender` handle so the Remotion compositor waits for the
 * highlight before painting.
 *
 * Extracted from `scenes/CodeReveal/index.tsx` so multiple primitives can
 * share a single code path (`ToolCallCard`, inline Shiki panels inside arch
 * slides, and the original `CodeReveal`).
 */
export const useShikiHighlight = ({
  code,
  lang,
  theme,
}: UseShikiHighlightArgs): UseShikiHighlightResult => {
  const [html, setHtml] = useState<string | null>(null);
  const [handle] = useState(() => delayRender(`Shiki highlight ${lang}`));

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const out = await codeToHtml(code, {
          lang,
          theme: theme === "dark" ? "github-dark" : "github-light",
        });
        if (!cancelled) {
          setHtml(out);
          continueRender(handle);
        }
      } catch (err) {
        if (!cancelled) cancelRender(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, lang, theme, handle]);

  return { html };
};
