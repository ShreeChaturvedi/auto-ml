/**
 * CSS color blending utilities — generic, Remotion-agnostic. Extracted from
 * `TechStackSlide` so any slide can ease a color transition (e.g. a stat
 * crossfading to success green) without pulling in slide-local helpers.
 *
 * Supports:
 *   - `#RRGGBB` hex (the palette in `config/themes.ts`)
 *   - `rgb(r, g, b)` / `rgba(r, g, b, a)` (the `WORD_COLOR_ON_BG_GREYED` tokens)
 *
 * Silently falls back to the `to` color on an unparseable input so callers
 * don't have to branch.
 */

export type ParsedColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

/**
 * Parse a hex or `rgba()` color string into normalized RGBA. Returns `null`
 * on anything else (HSL, named colors, etc.) — callers should treat `null` as
 * "unparseable, fall back to the target color".
 */
export const parseColor = (value: string): ParsedColor | null => {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (rgba) {
    const parts = rgba[1]!.split(",").map((s) => Number(s.trim()));
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts[3] ?? 1 };
    }
  }
  return null;
};

/**
 * Linearly blend two CSS colors by `t ∈ [0, 1]`. Clamps at the endpoints so
 * callers can hand in raw `interpolate()` output without pre-clamping.
 *
 * Returns an `rgba()` string, which renders identically to the original hex
 * once `t === 1` (just in a different serialization).
 */
export const blendColor = (from: string, to: string, t: number): string => {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return to;
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  const alpha = a.a + (b.a - a.a) * t;
  return `rgba(${r}, ${g}, ${bl}, ${alpha.toFixed(3)})`;
};
