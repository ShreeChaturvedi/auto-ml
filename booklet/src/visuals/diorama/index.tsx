import React from "react";
import type { SectionKey } from "../../theme";
import { WhyDesk } from "./WhyDesk";
import { HowTriptych } from "./HowTriptych";
import { InsideCutaway } from "./InsideCutaway";
import { ProofPodium } from "./ProofPodium";
import { BuildScaffold } from "./BuildScaffold";

/**
 * Barrel + SectionKey → diorama component map. Consumed by `ArtSlot` in
 * `primitives/DividerPage.tsx` when the commissioned SVG asset is missing.
 */

export const DIORAMAS: Record<SectionKey, React.FC> = {
  "01_WHY": WhyDesk,
  "02_HOW": HowTriptych,
  "03_INSIDE": InsideCutaway,
  "04_PROOF": ProofPodium,
  "05_BUILD": BuildScaffold,
};

export { WhyDesk, HowTriptych, InsideCutaway, ProofPodium, BuildScaffold };
