/**
 * Seeded topographic contour generator for the booklet covers.
 *
 * Per the side-plan spec: 5-octave fractal simplex noise sampled on a
 * 180×240 grid over an 8.75×11.25 inch canvas, biased toward a gaussian
 * peak at (0.5, 0.36) on the front / valley at (0.5, 0.70) on the back.
 * d3-contour extracts 32 evenly spaced threshold polygons from that
 * elevation field; the innermost ring is flagged `apex: true` so the
 * renderer can colour it Miami Red.
 *
 * The back variant translates the sample grid by -halfWidth on x so the
 * two covers share one noise field and read as a continuous wraparound
 * spread across the fold.
 */

import { createNoise2D } from "simplex-noise";
import alea from "alea";
import { contours } from "d3-contour";
import { COLORS } from "../theme";

export type ContourPath = {
  /** Threshold index (0 = lowest elevation, N-1 = apex). */
  k: number;
  /** SVG `d` attribute for the polygon set at this threshold. */
  d: string;
  /** Stroke colour — interpolated ACCENT→TEAL_EXT, or MIAMI_RED on apex. */
  stroke: string;
  /** True for the innermost contour on the front cover only. */
  apex: boolean;
};

export type TerrainGeometry = {
  /** Logical canvas in hundredths of an inch (matches SVG viewBox). */
  viewBoxW: number;
  viewBoxH: number;
  paths: ContourPath[];
  /** Peak location in viewBox coordinates — useful for aligning marks. */
  peak: { x: number; y: number };
};

// ---------------------------------------------------------------------------
// Tunables — see side-plan §Algorithm for sourcing.
// ---------------------------------------------------------------------------

const GRID_W = 180;
const GRID_H = 240;
const THRESHOLD_COUNT = 22;
const OCTAVES: readonly number[] = [1, 0.5, 0.25, 0.125, 0.0625];
const NOISE_FREQ = 1.9;        // base spatial frequency of the first octave
const PEAK_SIGMA = 0.26;       // gaussian spread of the biasing peak
const NOISE_WEIGHT = 0.5;      // elevation = NOISE_WEIGHT*noise + (1-NOISE_WEIGHT)*peak
const VIEWBOX_SCALE = 100;     // 1in = 100 viewBox units
/** d3-contour can emit many tiny polygons per threshold on noisy fields;
 *  drop anything below this (in viewBox units²) to keep the rings clean. */
const MIN_RING_AREA = 140;

// ---------------------------------------------------------------------------
// Elevation field
// ---------------------------------------------------------------------------

function gaussian(dx: number, dy: number, sigma: number): number {
  const d2 = dx * dx + dy * dy;
  return Math.exp(-d2 / (2 * sigma * sigma));
}

function buildElevation(
  seed: string,
  variant: "front" | "back" | "endpaper",
): { values: Float64Array; peakXY: [number, number] } {
  const prng = alea(seed);
  const noise2D = createNoise2D(prng);

  // Logical world is twice as wide as one page so back=left-half, front=right-half.
  // Endpaper samples its own third window — an entirely different patch of
  // the noise field so its contours don't echo the front cover.
  //   front    → right half  (start at GRID_W on an extended 2*GRID_W field)
  //   back     → left half   (start at 0)
  //   endpaper → offset into a third, further-right window so the terrain
  //              is visually independent of the cover
  const xOffset =
    variant === "front" ? GRID_W : variant === "endpaper" ? GRID_W * 2 : 0;

  // Peak center in LOCAL cover coords (0..1 of the 180×240 window).
  // Front:    apex centered on the 'A' mark. The mark is positioned at
  //           top=2.4in, height=96px — its visual summit (the dot) sits at
  //           ~2.55in. 2.55 / 11.25 = 0.227.
  // Back:     focal valley lower-center.
  // Endpaper: peak pulled OFF-page to the lower-right so contours radiate
  //           toward the page as soft diagonal sweeps. Upper-left stays
  //           calm for "Welcome." and the abstract body block.
  const peakLocal: [number, number] =
    variant === "front"
      ? [0.5, 0.227]
      : variant === "endpaper"
        ? // Just past the lower-right corner so the NE flank of the peak
          // spreads a clean diagonal gradient across the whole page. Closer
          // than [1.45,1.35] so the gradient is visible; farther than [1,1]
          // so the peak doesn't sit on-page as a focal point.
          [1.22, 1.18]
        : [0.5, 0.78];

  // Per-variant base noise frequency. The endpaper uses a slightly lower
  // frequency (bigger features) and a much wider peak sigma so the overall
  // field reads as a single sloping ridge with organic undulations rather
  // than a busy mosquito-net texture. Front/back keep the original cover
  // tuning.
  const noiseFreq = variant === "endpaper" ? 1.35 : NOISE_FREQ;
  const peakSigma = variant === "endpaper" ? 0.58 : PEAK_SIGMA;

  const values = new Float64Array(GRID_W * GRID_H);
  for (let j = 0; j < GRID_H; j++) {
    for (let i = 0; i < GRID_W; i++) {
      // Fractal noise in WORLD coords so front/back share the same field.
      const worldX = (i + xOffset) / GRID_W; // 0..2 across the spread
      const worldY = j / GRID_H;             // 0..1
      let n = 0;
      let ampSum = 0;
      for (let o = 0; o < OCTAVES.length; o++) {
        const amp = OCTAVES[o] ?? 0;
        const freq = noiseFreq * Math.pow(2, o);
        n += amp * noise2D(worldX * freq, worldY * freq);
        ampSum += amp;
      }
      n = (n / ampSum) * 0.5 + 0.5; // → 0..1

      // Peak/valley bias in LOCAL coords.
      const localX = i / GRID_W;
      const localY = j / GRID_H;
      const peak = gaussian(
        localX - peakLocal[0],
        (localY - peakLocal[1]) * 1.18, // vertically tighter lobe
        peakSigma,
      );

      // Near the peak we dampen the noise contribution so the apex rings
      // are roughly concentric and legible — rather than amoeba-shaped.
      // Far from the peak, noise dominates and the terrain feels natural.
      const peakInfluence = peak; // already 0..1
      const localNoiseWeight = NOISE_WEIGHT * (1 - 0.45 * peakInfluence);
      const localPeakWeight = 1 - localNoiseWeight;

      const elev =
        variant === "front"
          ? localNoiseWeight * n + localPeakWeight * peak
          : variant === "endpaper"
            ? // endpaper: peak-dominated so contours read as a single slope
              // across the whole page. Noise still contributes ~45% so lines
              // meander organically rather than forming perfect ellipses.
              0.45 * n + 0.55 * peak
            : // back: invert the peak into a valley so contours converge.
              localNoiseWeight * n + localPeakWeight * (1 - peak * 0.82);

      values[j * GRID_W + i] = elev;
    }
  }

  // Peak in viewBox coordinates (single-cover canvas).
  const peakXY: [number, number] = [
    peakLocal[0] * 8.75 * VIEWBOX_SCALE,
    peakLocal[1] * 11.25 * VIEWBOX_SCALE,
  ];

  return { values, peakXY };
}

// ---------------------------------------------------------------------------
// Color ramp: ACCENT → TEAL_EXT (linear RGB lerp in #rrggbb space).
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t,
  );
}

// ---------------------------------------------------------------------------
// Polygon → SVG path — geometry from d3-contour is in GRID-space; we scale
// it into viewBox-space here.
// ---------------------------------------------------------------------------

function ringArea(ring: number[][], sx: number, sy: number): number {
  // shoelace — ring is [x,y] pairs in grid coords; scale into viewBox.
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    if (!p || !q) continue;
    const px = (p[0] ?? 0) * sx;
    const py = (p[1] ?? 0) * sy;
    const qx = (q[0] ?? 0) * sx;
    const qy = (q[1] ?? 0) * sy;
    a += px * qy - qx * py;
  }
  return Math.abs(a) / 2;
}

function ringsToPath(
  coords: number[][][][],
  sx: number,
  sy: number,
): { d: string; totalArea: number; centroid: [number, number] | null } {
  // d3-contour emits a MultiPolygon: polygons → rings → [x,y] pairs.
  // We drop speckle (rings below MIN_RING_AREA in viewBox units²) so the
  // lines read as a topography, not JPEG artefacts.
  let out = "";
  let totalArea = 0;
  let cx = 0;
  let cy = 0;
  let cxArea = 0;
  for (const polygon of coords) {
    for (const ring of polygon) {
      const a = ringArea(ring, sx, sy);
      if (a < MIN_RING_AREA) continue;
      for (let i = 0; i < ring.length; i++) {
        const pt = ring[i];
        if (!pt) continue;
        const x = (pt[0] ?? 0) * sx;
        const y = (pt[1] ?? 0) * sy;
        out += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
        cx += x;
        cy += y;
      }
      out += "Z ";
      totalArea += a;
      cxArea += ring.length;
    }
  }
  const centroid: [number, number] | null =
    cxArea > 0 ? [cx / cxArea, cy / cxArea] : null;
  return { d: out.trim(), totalArea, centroid };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildContourPaths(
  seed: string,
  variant: "front" | "back" | "endpaper",
): TerrainGeometry {
  const { values, peakXY } = buildElevation(seed, variant);

  // Even thresholds across the elevation min..max so rings are visually balanced.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? 0;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  // Endpaper gets slightly fewer rings so the composition breathes — each
  // contour is a longer, more elegant stroke instead of one line among many.
  const thresholdCount = variant === "endpaper" ? 18 : THRESHOLD_COUNT;
  const thresholds: number[] = [];
  for (let k = 0; k < thresholdCount; k++) {
    // skip the very outermost band — it's just noise at the edge.
    const t = lo + ((k + 1) / (thresholdCount + 1)) * (hi - lo);
    thresholds.push(t);
  }

  const contour = contours().size([GRID_W, GRID_H]).thresholds(thresholds);
  const polygons = contour(Array.from(values) as number[]);

  // Scale from grid coords → viewBox coords (8.75×11.25 in at 100/in).
  const sx = (8.75 * VIEWBOX_SCALE) / GRID_W;
  const sy = (11.25 * VIEWBOX_SCALE) / GRID_H;

  // First pass: build paths & check which rings are substantive.
  type Built = {
    k: number;
    d: string;
    area: number;
    centroid: [number, number] | null;
    t: number;
  };
  const built: Built[] = polygons.map((p, k) => {
    const { d, totalArea, centroid } = ringsToPath(p.coordinates, sx, sy);
    return { k, d, area: totalArea, centroid, t: k / Math.max(1, polygons.length - 1) };
  });

  // Apex selection (front only): pick the innermost substantive ring that
  // is centered on (or near) the gaussian peak. We walk from innermost to
  // outermost and take the FIRST ring whose centroid is within APEX_PEAK_RADIUS
  // of the target peak AND whose area is above APEX_AREA_MIN (so we skip the
  // dot-sized interior ring). This guarantees a visible ~0.7in Miami Red ring.
  const APEX_AREA_MIN = 6500;   // viewBox units² — ~0.9in diameter, reads as a ring
  const APEX_PEAK_RADIUS = 220; // viewBox units — generous near-peak window
  let apexK = -1;
  if (variant === "front") {
    for (let i = built.length - 1; i >= 0; i--) {
      const b = built[i];
      if (!b || !b.d || !b.centroid) continue;
      if (b.area < APEX_AREA_MIN) continue;
      const dx = b.centroid[0] - peakXY[0];
      const dy = b.centroid[1] - peakXY[1];
      if (Math.hypot(dx, dy) <= APEX_PEAK_RADIUS) {
        apexK = b.k;
        break;
      }
    }
    // Absolute fallback: if NO ring qualifies (e.g. degenerate noise seed),
    // promote the second-innermost ring to apex so we always have a
    // Miami Red signal on the cover.
    if (apexK < 0) {
      for (let i = built.length - 2; i >= 0; i--) {
        const b = built[i];
        if (b && b.d && b.area >= APEX_AREA_MIN) {
          apexK = b.k;
          break;
        }
      }
    }
  }

  const paths: ContourPath[] = built
    .filter((b) => b.d) // drop empty paths (everything was speckle)
    .map((b) => {
      const isApex = b.k === apexK;
      const stroke = isApex
        ? COLORS.MIAMI_RED
        : lerpColor(COLORS.ACCENT, COLORS.TEAL_EXT, b.t);
      return { k: b.k, d: b.d, stroke, apex: isApex };
    });

  return {
    viewBoxW: 8.75 * VIEWBOX_SCALE,
    viewBoxH: 11.25 * VIEWBOX_SCALE,
    paths,
    peak: { x: peakXY[0], y: peakXY[1] },
  };
}
