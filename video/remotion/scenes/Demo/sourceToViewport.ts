import type { CursorWaypoint } from "../../primitives/SyntheticCursor";

export type ViewportSize = {
  width: number;
  height: number;
};

export type SourceToViewportFit = "cover" | "contain";
export type SourceToViewportAlignX = "left" | "center" | "right";
export type SourceToViewportAlignY = "top" | "center" | "bottom";

export type SourcePoint = {
  x: number;
  y: number;
};

export type SourceRect = SourcePoint & {
  w: number;
  h: number;
};

export type SourceToViewportTransform = {
  sourceWidth: number;
  sourceHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  fit: SourceToViewportFit;
  alignX: SourceToViewportAlignX;
  alignY: SourceToViewportAlignY;
  scale: number;
  offsetX: number;
  offsetY: number;
};

const coercePositive = (value: number, fallback: number): number => {
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const createSourceToViewportTransform = (
  source: ViewportSize,
  viewport: ViewportSize,
  fit: SourceToViewportFit = "cover",
  alignX: SourceToViewportAlignX = "center",
  alignY: SourceToViewportAlignY = "center",
): SourceToViewportTransform => {
  const viewportWidth = coercePositive(viewport.width, 1);
  const viewportHeight = coercePositive(viewport.height, 1);
  const sourceWidth = coercePositive(source.width, viewportWidth);
  const sourceHeight = coercePositive(source.height, viewportHeight);

  const scale = (
    fit === "contain" ? Math.min : Math.max
  )(
    viewportWidth / sourceWidth,
    viewportHeight / sourceHeight,
  );
  const fittedWidth = sourceWidth * scale;
  const fittedHeight = sourceHeight * scale;

  return {
    sourceWidth,
    sourceHeight,
    viewportWidth,
    viewportHeight,
    fit,
    alignX,
    alignY,
    scale,
    offsetX: alignOffset(viewportWidth - fittedWidth, alignX),
    offsetY: alignOffset(viewportHeight - fittedHeight, alignY),
  };
};

export const mapSourcePointToViewport = (
  point: SourcePoint,
  transform: SourceToViewportTransform,
): SourcePoint => {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY,
  };
};

export const mapSourceRectToViewport = (
  rect: SourceRect,
  transform: SourceToViewportTransform,
): SourceRect => {
  return {
    x: rect.x * transform.scale + transform.offsetX,
    y: rect.y * transform.scale + transform.offsetY,
    w: rect.w * transform.scale,
    h: rect.h * transform.scale,
  };
};

export const mapCursorPathToViewport = (
  path: readonly CursorWaypoint[],
  transform: SourceToViewportTransform,
): readonly CursorWaypoint[] => {
  return path.map((waypoint) => ({
    ...waypoint,
    ...mapSourcePointToViewport(waypoint, transform),
  }));
};

const alignOffset = (
  remainingSpace: number,
  align: SourceToViewportAlignX | SourceToViewportAlignY,
): number => {
  switch (align) {
    case "left":
    case "top":
      return 0;
    case "right":
    case "bottom":
      return remainingSpace;
    default:
      return remainingSpace / 2;
  }
};
