import { z } from "zod";

export type Dimensions = {
  width: number;
  height: number;
};

export const canvasLayout = z.enum(["landscape", "square"]);
export type CanvasLayout = z.infer<typeof canvasLayout>;

export const DIMENSIONS: { [key in CanvasLayout]: Dimensions } = {
  landscape: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
};

export const LANDSCAPE_DISPLAY_MAX_WIDTH_OF_CANVAS = 0.77;

/** Slide safe-area geometry, shared between SlideShell and individual slides.
 *
 *  - top/right/bottom/left are the outer padding inside which content lives.
 *  - bottom is larger (120 vs 96) to keep content clear of YouTube's caption zone.
 *  - spineLeft is the x of the 1px vertical hairline that anchors left-aligned
 *    slides.
 *  - contentLeft is the x of the main content column (48px past the spine).
 */
export const SAFE_AREA = {
  top: 96,
  right: 96,
  bottom: 120,
  left: 96,
  spineLeft: 72,
  contentLeft: 120,
} as const;
