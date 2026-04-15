import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { LinkType } from "../../../config/endcard";
import { REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";

type Props = {
  links: LinkType[];
  theme: Theme;
};

/**
 * Capstone end card: fade-in thank-you + optional links.
 * No social-follow CTA, no avatar. `channel` / `canvasLayout` / `platform`
 * from the Zod schema are accepted at the dispatcher but this component
 * only needs `links` + `theme` — keep the prop surface minimal.
 */
export const EndCard: React.FC<Props> = ({ links, theme }) => {
  const { opacity, transform } = useFadeIn({ translateY: 24 });
  const c = COLORS[theme];

  return (
    <AbsoluteFill
      style={{
        background: c.BACKGROUND,
        alignItems: "center",
        justifyContent: "center",
        paddingInline: 96,
        gap: 40,
        color: c.WORD_COLOR_ON_BG_APPEARED,
        opacity,
        transform,
      }}
    >
      <div
        style={{
          ...TITLE_FONT,
          fontSize: 96,
          textAlign: "center",
          letterSpacing: "-0.02em",
        }}
      >
        Thank you
      </div>
      <div
        style={{
          ...REGULAR_FONT,
          fontSize: 32,
          color: c.WORD_COLOR_ON_BG_GREYED,
          textAlign: "center",
          textWrap: "balance",
          maxWidth: 1200,
        }}
      >
        Agentic AutoML Platform · CSE 449 Capstone
      </div>
      {links.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: 32,
            marginTop: 24,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {links.map((l, i) => (
            <StaggeredLink key={l.url} link={l} index={i} theme={theme} />
          ))}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const StaggeredLink: React.FC<{
  link: LinkType;
  index: number;
  theme: Theme;
}> = ({ link, index, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = COLORS[theme];
  const enter = spring({
    fps,
    frame,
    config: { damping: 200 },
    delay: 8 + index * 4,
  });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  return (
    <div
      style={{
        ...REGULAR_FONT,
        fontSize: 28,
        padding: "12px 24px",
        borderRadius: 999,
        border: `1px solid ${c.BORDER_COLOR}`,
        background: c.BACKGROUND_ELEVATED,
        color: c.ACCENT_COLOR,
        opacity,
      }}
    >
      {link.label} · {link.url.replace(/^https?:\/\//, "")}
    </div>
  );
};
