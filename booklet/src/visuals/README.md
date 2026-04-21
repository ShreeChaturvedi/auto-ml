# booklet/src/visuals — contract

These components are copied from `/poster/src/visuals/` rather than imported
cross-workspace. Sharing modules across two Vite projects with separate
`tsconfig.json` files requires path-alias surgery; the cost of that coupling
exceeded the ~200 LOC of static visual code we duplicate here.

**Rule.** When a poster visual meaningfully changes, reconcile by hand:

1. Diff `poster/src/visuals/<Visual>.tsx` against `booklet/src/visuals/<Visual>.tsx`.
2. Port intentional changes; reject poster-scale-only tweaks that don't
   translate to booklet scale.
3. Keep both files' token imports local to their own workspace
   (`../theme` in booklet, `../tokens` in poster). Never re-export across.

**Why the booklet doesn't import from poster.** The poster ships at 48"×36"
and tokens (TYPE, CARD dimensions) are sized for 5-foot viewing. The booklet
ships at 8.5"×11" and its TYPE scale is a clean reset. Shared logic lives in
shape-only files (`../diagrams/primitives.ts`) where the values don't depend
on page size.

**ChartCard.** `SpeedBarChart` and `GuardrailTable` in the poster import a
`ChartCard` wrapper from `poster/src/regions/Section4Results.tsx`. The
booklet copies inline an equivalent `ChartCard` at the top of each visual
so the copy is self-contained.
