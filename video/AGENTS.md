# AGENTS.md — Video workspace handoff contract

Short guide for any agent/teammate working inside `video/`. If you only
skim one section, read **"Adding a new slide"** below.

## Skill

Before touching code, install the Remotion skill if it isn't already:

```bash
npx skills add remotion-dev/skills -g -a claude-code -y
```

The skill lives at `~/.agents/skills/remotion-best-practices/` and is
auto-discovered by Claude Code. It ships ~35 rule docs covering audio,
fonts, transitions, timing, etc. Reach for it before inventing.

## Mental model

The whole video is one Remotion composition (`id="main"` in
`remotion/Root.tsx`). Its body is an array of **scenes**, each a variant in
a Zod discriminated union (`config/scenes.ts`). Every scene's duration is
derived at build time by `remotion/calculate-metadata/calc-metadata.ts`:

- If the scene declares `voiceoverFile`, duration = MP3 length.
- Otherwise, duration = scene's own `durationInFrames`.

Total composition length is the sum of scene durations — **no hardcoded
total**. Add a scene, total grows; remove one, total shrinks.

Scene types today:

| Type | Component | Purpose |
| --- | --- | --- |
| `slide` | `remotion/scenes/Slide/index.tsx` (dispatcher by `id`) | Animated slide (intro, team, problem, …) |
| `codeReveal` | `remotion/scenes/CodeReveal/index.tsx` | Syntax-highlighted code card |
| `demo` | `remotion/scenes/Demo/index.tsx` | Screen recording inside `AppChrome` |
| `title` | `remotion/scenes/Title/Title.tsx` | Full-screen title card |
| `tableofcontents` | `remotion/scenes/TableOfContents/index.tsx` | Chapter list |
| `endcard` | `remotion/scenes/EndCard/index.tsx` | Closing thank-you |

## Adding a new slide

Three files, in order:

### 1. Create your slide component

`remotion/scenes/Slide/<PascalCase>Slide.tsx`:

```tsx
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TITLE_FONT } from "../../../config/fonts";
import { COLORS } from "../../../config/themes";
import type { SlideBodyProps } from "./index";

export const MySlide: React.FC<SlideBodyProps> = ({ theme, meta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame, config: { damping: 200 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        color: COLORS[theme].WORD_COLOR_ON_BG_APPEARED,
        opacity,
      }}
    >
      <div style={{ ...TITLE_FONT, fontSize: 72 }}>
        {(meta?.title as string) ?? "Hello"}
      </div>
    </AbsoluteFill>
  );
};
```

### 2. Wire it into the Slide dispatcher

Edit `remotion/scenes/Slide/index.tsx`:

```diff
 import { ProblemSlide } from "./ProblemSlide";
+import { MySlide } from "./MySlide";

   switch (id) {
     case "intro": return <IntroSlide {...bodyProps} />;
     case "team": return <TeamSlide {...bodyProps} />;
     case "problem": return <ProblemSlide {...bodyProps} />;
+    case "my": return <MySlide {...bodyProps} />;
```

### 3. Reference it from the scene list

Edit `remotion/Root.tsx` (or a dedicated `config/scene-list.ts` if we
break that out):

```diff
 const DEFAULT_SCENES: SelectableScene[] = [
   { type: "slide", id: "intro", durationInFrames: 360 },
+  { type: "slide", id: "my", voiceoverFile: "scene-my.mp3", meta: { title: "Section 2" } },
   { type: "slide", id: "team", durationInFrames: 360 },
   …
 ];
```

That's it — three files, each a focused edit.

## Voiceover workflow

1. Write narration text in `voiceover/scripts/scene-<id>.txt`.
2. Export `ELEVENLABS_API_KEY` (and optionally `ELEVENLABS_VOICE_ID`).
3. Run `npm run voiceover` (or `npm run voiceover scene-my` for one file).
4. MP3 lands in `public/voiceover/main/scene-<id>.mp3`.
5. Reference from the scene: `{ ..., voiceoverFile: "scene-my.mp3" }`.
6. `calculate-metadata` picks the new duration automatically.

The script is idempotent: it skips files whose MP3 is newer than the
source `.txt`. Pass `--force` to regenerate.

## Preview workflow

```bash
npm start               # opens Remotion Studio at http://localhost:3000
```

The Studio hot-reloads on code + asset changes. Drag the time cursor to
scrub. The sidebar lists the `main` composition (and any isolated
scene-compositions we add for iteration).

## Test render

```bash
npm run build:draft     # 540p, CRF 28, fast preset — minutes
npm run build           # 1080p, CRF 18 — final quality, 1–3 h
```

Draft renders let you review pacing / transitions without waiting for a
full 20-min render.

## Theming

Palette lives in `config/themes.ts` (`COLORS.light` and `COLORS.dark`).
The default theme is `dark` (cinematic, matches Linear/Vercel aesthetic).
Flip by changing `DEFAULT_THEME` in that file, OR by changing the `theme`
prop on the `<Composition>` in `Root.tsx`, OR by overriding it in
`defaultProps`.

Accent color (today: blue) is set in one place per-theme: `ACCENT_COLOR`
and `WORD_HIGHLIGHT_COLOR`. To swap to indigo/purple/etc., update those
two values per palette.

Fonts are declared in `config/fonts.ts`. Use `REGULAR_FONT`, `TITLE_FONT`,
`SERIF_FONT`, `MONOSPACE_FONT`, `ENDCARD_FONT` — don't reach for raw
`font-family` strings. Adding a new Google Font: `npm i @remotion/google-fonts`
(already installed) and import from `@remotion/google-fonts/<FontName>`.

## Recording footage

See `docs/CAPTURE.md`. Short version: Open Recorder → 60 fps 1920×1080
MP4 → drop into `public/main/<name>.mp4` → reference from a `demo` scene.

## Inline-styles vs Tailwind

The composition uses inline styles. This keeps Remotion renders
deterministic and avoids Tailwind-in-server-side-rendering footguns. If
you really want Tailwind for a particular slide, install
`tailwindcss@^3` locally + configure a utility-only `@layer utilities`
scope, but it's usually not worth it for a 3-slide burst.

## Don'ts

- Don't add top-level Tailwind — we removed it on purpose.
- Don't add a second `Composition` unless you're building an isolated
  iteration sandbox. The whole video is one composition.
- Don't hardcode `durationInFrames` on a scene that has a voiceover — the
  VO drives duration automatically.
- Don't commit MP3/MP4 files — they're `.gitignored` for repo-size
  reasons. Generate locally or pull from shared storage.
- Don't use raw `<video>`; use `<OffthreadVideo>` so Remotion can render
  deterministically.
- Don't break the `SelectableScene` discriminated union — if you add a
  variant, add a `case` in `scenes/Scene.tsx` too (the `default: never`
  branch will tell the type checker if you forgot).
