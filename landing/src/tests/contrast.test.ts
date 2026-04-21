import { describe, expect, it } from "vitest";

/**
 * WCAG AA contrast audit for the landing page token matrix.
 *
 * Parameterized across BOTH themes (dark + light). Tokens are hardcoded
 * from `landing/src/styles/theme.css` (dark block lines 50-67, light block
 * lines 89-106). If someone tweaks a grayscale value, this test will flag
 * the regression before it lands in CI.
 *
 * Thresholds:
 *   - 4.5:1 for body text (<=18.66px / <14px bold)
 *   - 3.0:1 for large text (>=18.66px / >=14px bold)
 */

function luminance(hex: string): number {
  const rgb = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function ratio(fg: string, bg: string): number {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const THEMES = {
  dark: {
    backgrounds: {
      "--bg": "#0A0A0B",
      "--surface-0": "#0F1011",
      "--surface-1": "#131416",
      "--surface-2": "#1A1B1D",
    },
    foregrounds: {
      "--text": "#F7F8F8",
      "--text-muted": "#8A8F98",
      "--text-dim": "#828794",
    },
  },
  light: {
    backgrounds: {
      "--bg": "#FFFFFF",
      "--surface-0": "#F7F8F8",
      "--surface-1": "#F0F1F2",
      "--surface-2": "#E8E9EB",
    },
    foregrounds: {
      "--text": "#0A0A0B",
      "--text-muted": "#4A4E54",
      "--text-dim": "#5A5D64",
    },
  },
} as const;

const AA_BODY = 4.5;

type ThemeKey = keyof typeof THEMES;

for (const themeKey of Object.keys(THEMES) as ThemeKey[]) {
  const { backgrounds, foregrounds } = THEMES[themeKey];

  describe(`WCAG AA contrast: ${themeKey} theme token matrix`, () => {
    const table: Array<{ fg: string; bg: string; r: number }> = [];

    for (const fg of Object.keys(foregrounds)) {
      for (const bg of Object.keys(backgrounds)) {
        table.push({
          fg,
          bg,
          r: ratio(
            foregrounds[fg as keyof typeof foregrounds],
            backgrounds[bg as keyof typeof backgrounds],
          ),
        });
      }
    }

    it("prints the computed matrix for audit", () => {
      const rows = table.map(
        ({ fg, bg, r }) =>
          `${fg.padEnd(13)} on ${bg.padEnd(12)} = ${r.toFixed(2)}:1  (>= ${AA_BODY.toFixed(1)})`,
      );
      console.log([`${themeKey} contrast matrix:`, ...rows].join("\n"));
      expect(rows.length).toBe(
        Object.keys(foregrounds).length * Object.keys(backgrounds).length,
      );
    });

    for (const fg of Object.keys(foregrounds)) {
      for (const bg of Object.keys(backgrounds)) {
        const r = ratio(
          foregrounds[fg as keyof typeof foregrounds],
          backgrounds[bg as keyof typeof backgrounds],
        );
        it(`${fg} on ${bg} meets AA body (>= 4.5:1)`, () => {
          expect(r).toBeGreaterThanOrEqual(AA_BODY);
        });
      }
    }
  });
}

describe("contrast helper sanity", () => {
  it("sanity: luminance(#000000) === 0 and luminance(#ffffff) === 1", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("sanity: ratio is symmetric", () => {
    const a = ratio("#F7F8F8", "#0A0A0B");
    const b = ratio("#0A0A0B", "#F7F8F8");
    expect(a).toBeCloseTo(b, 10);
  });
});
