import React from "react";
import { JourneyRangeShell } from "./journey/JourneyRangeShell";
import type { SlideBodyProps } from "./index";

/**
 * Slide 2 — Foundation (Sprints 1-4). Header marker lands on cell 1, color
 * morphs miamiRed → accentBlue. No SPRING_HERO on this slide (reserved for
 * production's 151).
 */
export const JourneyFoundationSlide: React.FC<SlideBodyProps> = ({ theme }) => (
  <JourneyRangeShell theme={theme} range="foundation" heroMoment={null} />
);
