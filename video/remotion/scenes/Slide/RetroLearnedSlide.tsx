import React from "react";
import { RETRO } from "../../../config/reflection-content";
import { RetroSlideShell } from "./RetroSlideShell";
import type { SlideBodyProps } from "./index";

/** Slide 6 — RETROSPECTIVE · LEARNED (blue tone, text-only, 3 statements). */
export const RetroLearnedSlide: React.FC<SlideBodyProps> = ({ theme }) => (
  <RetroSlideShell theme={theme} config={RETRO.learned} />
);
