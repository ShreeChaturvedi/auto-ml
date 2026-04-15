/** Default horizontal padding from the viewport edge for fixed overlays. */
export const FLOATING_VIEWPORT_EDGE_PX = 8;

/**
 * Clamps a fixed element's `left` offset so its bounding box stays within the viewport.
 */
export function clampFloatingLeft(
  el: HTMLElement,
  preferredLeft: number,
  edgePx: number = FLOATING_VIEWPORT_EDGE_PX
): number {
  const rect = el.getBoundingClientRect();
  let left = preferredLeft;
  if (left + rect.width > window.innerWidth - edgePx) {
    left = Math.max(edgePx, window.innerWidth - edgePx - rect.width);
  }
  if (left < edgePx) {
    left = edgePx;
  }
  return left;
}
