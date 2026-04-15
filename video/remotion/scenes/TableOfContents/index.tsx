import React from "react";
import { AbsoluteFill } from "remotion";
import { REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import type { ChapterMark } from "../../../config/scenes";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { TableOfContentItem } from "./item";

export const TableOfContents: React.FC<{
  chapters: ChapterMark[];
  theme: Theme;
}> = ({ chapters, theme }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS[theme].BACKGROUND,
        justifyContent: "center",
        paddingLeft: 120,
        paddingRight: 120,
        color: COLORS[theme].ENDCARD_TEXT_COLOR,
      }}
    >
      <div
        style={{
          ...TITLE_FONT,
          fontSize: 56,
          marginBottom: 40,
          letterSpacing: "-0.02em",
        }}
      >
        What we'll cover
      </div>
      {chapters.length === 0 ? (
        <div
          style={{
            ...REGULAR_FONT,
            fontSize: 32,
            color: COLORS[theme].WORD_COLOR_ON_BG_GREYED,
          }}
        >
          No chapters yet. Add `chapter` on a demo scene to list it here.
        </div>
      ) : (
        chapters.map((chapter) => (
          <TableOfContentItem
            key={chapter.index}
            startTime={chapter.start}
            title={chapter.title}
          />
        ))
      )}
    </AbsoluteFill>
  );
};
