import React from "react";
import { RETRO } from "../../../config/reflection-content";
import { RetroSlideShell } from "./RetroSlideShell";
import type { SlideBodyProps } from "./index";

/** Slide 8 — RETROSPECTIVE · WHAT WE'D DO DIFFERENTLY (amber tone, 2
 *  statements + ToolCallCard anchor). */
export const RetroDifferentlySlide: React.FC<SlideBodyProps> = ({ theme }) => (
  <RetroSlideShell theme={theme} config={RETRO.differently} />
);
