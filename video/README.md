# `video/` — Capstone video workspace

Remotion-based workspace that produces the final capstone video for the
Agentic AutoML Platform (CSE 449). Animated slides + polished product
demo footage, composed and rendered from React.

For agent/slide-authoring conventions, read `AGENTS.md`.
For screen-recording how-to, read `docs/CAPTURE.md`.

## Requirements

- Node ≥ 20 (we use 22 in the monorepo)
- ffmpeg on PATH for `@remotion/renderer` (the official installer handles
  this on most platforms the first time you run a render)

## Install

From the monorepo root:

```bash
npm run install:video
```

Or directly in this folder:

```bash
npm install
```

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Open Remotion Studio at `localhost:3000` (hot-reload preview) |
| `npm run build:draft` | Fast, low-quality full render (540p, CRF 28) → `out/draft.mp4` |
| `npm run build` | Final render (1080p, CRF 18) → `out/final.mp4` |
| `npm run voiceover` | Regenerate VO MP3s from `voiceover/scripts/*.txt` |
| `npm run lint` | ESLint across the workspace |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run render:lambda` | Opt-in AWS Lambda render (see `scripts/render-lambda.mts` header for setup) |

From the monorepo root, the same scripts are available as
`video:dev`, `video:build`, `video:build:draft`, `video:voiceover`,
`video:present:build`, `video:present:export-pdf`, `lint:video`, and
`assets:check`.

## Project layout

```
video/
├── config/                Zod schemas + shared tokens
│   ├── scenes.ts          scene discriminated union (add a variant here)
│   ├── themes.ts          color palette (light + dark)
│   ├── fonts.ts           Plus Jakarta Sans + Instrument Serif + Monaspace
│   ├── fps.ts             fps constant (60)
│   ├── layout.ts          canvas dimensions
│   └── endcard.ts         brand/platform/link types
├── remotion/              the composition
│   ├── index.ts           registerRoot
│   ├── Root.tsx           <Composition> + default scene list
│   ├── Main.tsx           scene iterator
│   ├── scenes/
│   │   ├── Scene.tsx      dispatcher (add a case here for new scene types)
│   │   ├── Slide/         per-id slide dispatch + IntroSlide/TeamSlide/ProblemSlide
│   │   ├── CodeReveal/    shiki-based code card
│   │   ├── Demo/          OffthreadVideo inside BrowserChrome + overlays
│   │   ├── Title/         full-screen title card
│   │   ├── EndCard/       capstone thank-you
│   │   └── TableOfContents/
│   ├── calculate-metadata/  resolves scene durations from VO MP3 lengths
│   └── helpers/           BrowserChrome, WaitForFonts, small utilities
├── public/
│   ├── fonts/             self-hosted Monaspace Neon (.woff2)
│   ├── main/              committed Shree release/demo MP4 source assets
│   └── voiceover/main/    committed Shree VO MP3s + alignment sidecars
├── voiceover/scripts/     hand-written narration .txt files
├── scripts/
│   ├── voiceover.mts      .txt → MP3 driver
│   └── render-lambda.mts  optional cloud render
├── docs/
│   └── CAPTURE.md         how to shoot demo footage
├── out/                   render outputs (gitignored)
├── AGENTS.md              handoff contract for slide-authoring agents
├── remotion.config.ts     h264 / CRF 18 / yuv420p defaults
└── package.json
```

Shree's current `public/main/*.mp4`, `public/voiceover/main/*.mp3`, and paired
`.alignment.json` files are intentional committed deliverables. Keep generated
music, SFX, capture scratch files, and render outputs local/ignored.

## What goes where (cheatsheet)

Want to add content? → **Edit `remotion/Root.tsx`** scene list, and create
a slide component under `remotion/scenes/Slide/`.

Want to change a color? → **Edit `config/themes.ts`**. One file, two palettes.

Want to add a font? → **Edit `config/fonts.ts`**. Use `@remotion/google-fonts`
(already installed) or `@remotion/fonts` for self-hosted files in `public/fonts/`.

Want to speed up preview? → Use `build:draft` instead of `build`.

Want a faster final render? → Read `scripts/render-lambda.mts` header and
follow the one-time Lambda setup.

## Rendering options

| Option | Wall time | Cost | When |
| --- | --- | --- | --- |
| `npm run build` locally | 1–3 h | $0 | Default; fine for a one-shot deliverable |
| `npm run render:lambda` | 1–3 min | ~$0.30/run | T-minus hours; set up once |
| Vast.ai / RunPod 4090 | 45–90 min | ~$0.30–0.50/run | Have an account already |
| Colab Pro (H100) | 2–3 h | $0 already paid | **Not recommended** — Remotion doesn't support NVENC, H100 ≈ 0% speedup |
| GitHub Actions | 3–5 h | $0 (public repo) | Background CI renders |

## Troubleshooting

**Studio shows a black composition.**
Check you've added scenes to `DEFAULT_SCENES` in `Root.tsx`. Empty array →
gray "add scenes" placeholder.

**Font doesn't render (boxes / wrong fallback).**
Inspect the browser console in the Studio. `waitForFonts` in
`config/fonts.ts` may have cancelled the render — check `public/fonts/MonaspaceNeon.woff2`
exists and the Google Fonts network request succeeded.

**Recording doesn't play in a `demo` scene.**
Confirm `videoFile: "<name>.mp4"` matches an existing file in `public/main/`
(case-sensitive). Refresh the Studio. OffthreadVideo decodes via ffmpeg —
very rarely an unusual codec causes an error; re-export from Open Recorder
as plain H.264 MP4.

**`Cannot find module "@remotion/lambda"` when running `render:lambda`.**
Lambda is opt-in. Install with `npm i -D @remotion/lambda` and follow the
one-time setup in `scripts/render-lambda.mts`.

**The composition's duration looks wrong.**
The composition length is the sum of per-scene durations. VO-backed scenes
derive duration from the MP3 — regenerate VO if the script changed
(`npm run voiceover --force scene-foo`). Fallback scenes use
`durationInFrames`; bump it on the scene entry.
