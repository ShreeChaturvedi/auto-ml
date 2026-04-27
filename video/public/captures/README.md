# `public/captures/`

Playwright-driven screen captures of the live app and landing site. Produced
by `npm run capture:demo` (see `scripts/capture-demo.ts`). Each beat outputs
three files:

- `<beat>.webm` — the H.264/VP9 recording replayed by `scenes/Demo`.
- `<beat>.cursor.json` — `[{ t_ms, x, y, click? }, ...]`, consumed by
  `SyntheticCursor` + `ClickRipple` overlays.
- `<beat>.meta.json` — capture metadata (viewport, timestamp, git SHA).

Everything in this folder is gitignored; regenerate locally via the capture
script. The sole exception is this README.
