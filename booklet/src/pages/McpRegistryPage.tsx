import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { INSIDE } from "../content";
import { MCPToolRegistry } from "../diagrams/MCPToolRegistry";

/** Page 18 — MCP tool registry hub-and-ring diagram. */
export const McpRegistryPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => (
  <BodyPage
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel="INSIDE"
    sectionColor={SECTION["03_INSIDE"]}
    eyebrow="§03 · INSIDE · THE PROTOCOL UNLOCK"
    headline={INSIDE.mcpRegistry.headline}
  >
    <p
      style={{
        fontFamily: FONTS.SANS,
        fontSize: TYPE.body.size,
        fontWeight: TYPE.body.weight,
        letterSpacing: TYPE.body.tracking,
        lineHeight: TYPE.body.lh,
        color: COLORS.INK,
        maxWidth: "6.4in",
        margin: "0 0 16px",
      }}
    >
      {INSIDE.mcpRegistry.body}
    </p>

    <div
      style={{
        width: "100%",
        height: "6in",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MCPToolRegistry width={520} height={520} />
    </div>
  </BodyPage>
);
