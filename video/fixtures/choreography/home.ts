import type { ChoreographyPieceList } from "../types";

/**
 * Beat 2 — Home dashboard assembly (after signup→home transition).
 *
 * Order (see plan §2.4):
 *   greeting → newProjectButton → projectGrid → recentActivityPanel →
 *   quickActionsRow → sidebarNav
 *
 * Each piece's `start` is a frame offset relative to the scene start
 * and should chain via { after: "prevId" } triggers where possible.
 */
export const HOME_ASSEMBLY: ChoreographyPieceList = [] as const;
