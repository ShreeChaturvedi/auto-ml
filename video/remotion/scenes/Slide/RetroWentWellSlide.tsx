import React from "react";
import { RETRO } from "../../../config/reflection-content";
import { RetroSlideShell } from "./RetroSlideShell";
import type { SlideBodyProps } from "./index";

/** Slide 7 — RETROSPECTIVE · WHAT WENT WELL (green tone, 2 statements + 3-node
 *  agent column anchor). */
export const RetroWentWellSlide: React.FC<SlideBodyProps> = ({ theme }) => (
  <RetroSlideShell theme={theme} config={RETRO.wentWell} />
);
