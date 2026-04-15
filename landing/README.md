# Landing Page

Public marketing landing page for the Agentic AutoML Platform.

> Note: this repo does **not** use npm workspaces. Use the `--prefix` scripts from the repo root (or `cd landing`).
>
> Also: the landing page imports “real app” preview components from `../frontend/src`, so you must have **frontend deps installed** too.

## Dev

From the repo root:

```bash
npm run install:all
npm run dev:landing

# or (explicit)
npm --prefix frontend install
npm --prefix landing install
npm --prefix landing run dev
```

Opens at http://localhost:4321.

## Build

From the repo root:

```bash
npm run build:landing
# or
npm --prefix landing run build
```

## Test

From the repo root:

```bash
npm run test:landing
# or
npm --prefix landing run test
```

See `docs/superpowers/specs/2026-04-10-landing-page-design.md` for the design spec and `docs/superpowers/plans/2026-04-10-landing-page.md` for the implementation plan.
