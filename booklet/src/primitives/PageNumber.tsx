import React from "react";
import { COLORS, FONTS, TYPE } from "../theme";

/**
 * Page-number footer. Reads `SECTION · pg 07 / 28` with the section eyebrow
 * color on the inner side and the page number on the outer corner.
 * `parity` determines which side each half lands on — recto pages put the
 * number on the right, verso pages on the left.
 */
export const PageNumber: React.FC<{
  sectionLabel: string;
  sectionColor: string;
  pageNumber: number;
  totalPages: number;
  parity: "recto" | "verso";
}> = ({ sectionLabel, sectionColor, pageNumber, totalPages, parity }) => {
  const numStr = pageNumber.toString().padStart(2, "0");
  const totalStr = totalPages.toString().padStart(2, "0");
  return (
    <div
      style={{
        position: "absolute",
        left: "0.75in",
        right: "0.75in",
        bottom: "0.5in",
        display: "flex",
        flexDirection: parity === "recto" ? "row" : "row-reverse",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: FONTS.MONO,
        fontSize: TYPE.pageNum.size,
        fontWeight: TYPE.pageNum.weight,
        letterSpacing: TYPE.pageNum.tracking,
        lineHeight: TYPE.pageNum.lh,
        color: COLORS.INK_MUTED,
        textTransform: "uppercase",
      }}
    >
      <span style={{ color: sectionColor, fontWeight: 600 }}>
        {sectionLabel}
      </span>
      <span>
        pg {numStr} / {totalStr}
      </span>
    </div>
  );
};
