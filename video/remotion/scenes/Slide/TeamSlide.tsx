import React from "react";
import { AbsoluteFill } from "remotion";
import { REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import type { SlideBodyProps } from "./index";

type Member = { name: string; role?: string };

/** Placeholder team slide — slide-agent will populate members via scene.meta. */
export const TeamSlide: React.FC<SlideBodyProps> = ({ theme, meta }) => {
  const members = (meta?.members as Member[] | undefined) ?? [
    { name: "Team member 1", role: "Role" },
    { name: "Team member 2", role: "Role" },
    { name: "Team member 3", role: "Role" },
  ];

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingInline: 96,
        color: COLORS[theme].WORD_COLOR_ON_BG_APPEARED,
        gap: 48,
      }}
    >
      <div style={{ ...TITLE_FONT, fontSize: 72, letterSpacing: "-0.02em" }}>
        The Team
      </div>
      <div style={{ display: "flex", gap: 64 }}>
        {members.map((m, i) => (
          <MemberCard key={m.name} member={m} theme={theme} index={i} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const MemberCard: React.FC<{
  member: Member;
  theme: SlideBodyProps["theme"];
  index: number;
}> = ({ member, theme, index }) => {
  const { opacity, transform } = useFadeIn({ translateY: 24, delay: index * 6 });
  return (
    <div
      style={{
        opacity,
        transform,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: 32,
        borderRadius: 16,
        background: COLORS[theme].BACKGROUND_ELEVATED,
        border: `1px solid ${COLORS[theme].BORDER_COLOR}`,
        minWidth: 280,
      }}
    >
      <div style={{ ...TITLE_FONT, fontSize: 36 }}>{member.name}</div>
      {member.role ? (
        <div
          style={{
            ...REGULAR_FONT,
            fontSize: 22,
            color: COLORS[theme].WORD_COLOR_ON_BG_GREYED,
          }}
        >
          {member.role}
        </div>
      ) : null}
    </div>
  );
};
