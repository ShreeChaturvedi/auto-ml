/**
 * Evaluates CSS `cubic-bezier(x1, y1, x2, y2)` as easing f(t) for t ∈ [0, 1],
 * matching browser timing-function semantics (solve x(u)=t, return y(u)).
 */

export function parseCssCubicBezier(
  value: string,
): readonly [number, number, number, number] | null {
  const m = value.trim().match(/^cubic-bezier\(\s*([^)]+)\s*\)$/i);
  if (!m) return null;
  const parts = m[1].split(',').map((s) => Number.parseFloat(s.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2], parts[3]] as const;
}

function axisAtU(p1: number, p2: number, u: number): number {
  const inv = 1 - u;
  return 3 * inv * inv * u * p1 + 3 * inv * u * u * p2 + u * u * u;
}

/** Returns easing function for the given cubic-bezier control points. */
export function createCssCubicBezierEase(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    let lo = 0;
    let hi = 1;
    let u = 0.5;
    for (let i = 0; i < 14; i++) {
      u = (lo + hi) / 2;
      const x = axisAtU(x1, x2, u);
      if (x < t) lo = u;
      else hi = u;
    }
    return axisAtU(y1, y2, u);
  };
}

/** Reads `cubic-bezier(...)` from a CSS custom property on `element` (inherited). */
export function getCssVarCubicBezierEase(
  element: Element,
  varName: string,
  fallback: readonly [number, number, number, number],
): (t: number) => number {
  const raw = getComputedStyle(element).getPropertyValue(varName).trim();
  const parsed = parseCssCubicBezier(raw);
  const [a, b, c, d] = parsed ?? fallback;
  return createCssCubicBezierEase(a, b, c, d);
}
