/** Shared SVG primitives for illustration components. */

export function GrainFilter({ id, seed = 1 }: { id: string; seed?: number }) {
  return (
    <defs>
      <filter id={id} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" seed={seed} result="noise" />
        <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
        <feBlend in="SourceGraphic" in2="mono" mode="soft-light" />
      </filter>
    </defs>
  );
}

export function DotGrid({ cx, cy, gap = 8 }: { cx: number; cy: number; gap?: number }) {
  return (
    <>
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => (
          <circle key={`${r}-${c}`} cx={cx + c * gap} cy={cy + r * gap} r={0.8} fill="currentColor" opacity={0.07} />
        ))
      )}
    </>
  );
}
