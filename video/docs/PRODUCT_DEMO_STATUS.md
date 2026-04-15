# Product Demo — Beats 1 & 2 Status

Handoff document for the `feat/demo-foundation-beats-1-2` branch. This
captures the foundation layer (scaffolding, AppScene orchestrator, four real
app-screens, and the full Beat 1 + Beat 2 wiring) and lists the out-of-band
steps that must run before the composition can render a full-fidelity
preview.

## What's done

All work is on `feat/demo-foundation-beats-1-2`, composed of 9 commits.

### Phase 0 — Frontend bridge + scaffolding

Scaffolded the "real frontend inside Remotion" infrastructure before any
screens were built. Five commits, `d51e5233` → `e61b6065`:

- **`d51e5233`** `feat(video): frontend bridge for rendering real app components`
  Shims + determinism patches so the frontend's React trees mount cleanly
  inside Remotion's SSR-compatible renderer (RAF, random, fetch, etc.).
- **`c5cc9adc`** `feat(video): add appScene type + BrowserChrome 3-variant helper`
  `appScene` discriminator in `config/scenes.ts`; `BrowserChrome` supporting
  `mac` / `browser` / `none` variants.
- **`44d5ca5e`** `feat(video): animation primitives for choreographed product demos`
  `Assemble`, `ClickRipple`, `ConicTrace`, `AudioBed`, and related primitives
  under `remotion/primitives/`.
- **`1bdfc241`** `feat(video): voiceover alignment pipeline with {{MARK}} resolution`
  `scripts/resolveMarks.ts` + `useVoiceoverAlignment` hook; alignment sidecar
  format (`*.alignment.json`) defined in `config/scenes.ts`.
- **`e61b6065`** `feat(video): scaffold fixtures + audio asset directories for demo scenes`
  Empty `fixtures/` + `public/sfx/` + `public/audio/` + `public/voiceover/main/`
  with READMEs describing the missing assets.

### Task 6 — AppScene orchestrator (`5d863830`)

`feat(video): AppScene orchestrator with screen registry + tsc paths`

`remotion/scenes/AppScene/index.tsx` dispatches on `scene.screen`. Screens
are registered via a lookup table so new screens plug in with one entry. TS
path aliases (`@frontend/*`, `@landing/*`) added so real app components
import cleanly from the video workspace.

### Task 7 — HomeScreen de-risk (`07f6dbd8`)

`feat(video): HomeScreen — real HomePage mounts inside AppScene`

Proof that the real `frontend/src/pages/HomePage.tsx` can mount inside
Remotion without runtime errors. `HomeScreen` renders the real `HomePage`
under `AppShell`, fades in via `useFadeIn`, and is registered under
`screen: "home"` with `chrome: "mac"`.

### Task 8 — LoginScreen + SignupScreen (`08e6df8c`)

`feat(video): Beat 2 — LoginScreen + SignupScreen + timeline fixtures`

Mounts the real `LoginForm` and `SignupForm` inside Remotion. The signup
flow uses `useTypeIntoInput` (via the React-compatible value setter) to type
into the real form inputs, which trigger `PasswordStrength` and
`PasswordMatch` re-renders naturally. Timeline fixture
`fixtures/timelines/signup-ayush.ts` carries cursor waypoints, click events,
typing schedules per field, the submit + navigate events, and an SFX track.

### Task 9 — Beat 1 Landing scroll (`82c7c9ab`)

`feat(video): Beat 1 — landing-scroll scene with 4 live React overlays`

`LandingScene` mounts the captured full-page PNG (`landing-full.png`) under
four live React overlays (animated hero, feature tiles, notebook deep-dive,
closing CTA), then drives scroll via a keyframe list in
`fixtures/timelines/landing-scroll.ts`. Hotspots from `hotspots.json` anchor
the overlays in the composite canvas.

### Task 10 — Final integration (this commit)

`feat(video): wire Beat 1 + Beat 2 appScenes into the main composition`

Replaces the Task 7 smoke-test scene in `video/remotion/Root.tsx`'s
`DEFAULT_SCENES` with the real 4-scene product-demo flow:

| # | screen    | chrome   | duration (frames)     | notes                                  |
| - | --------- | -------- | --------------------- | -------------------------------------- |
| 1 | `landing` | `none`   | 3600 (60s) or MP3 len | full-bleed, Beat 1                     |
| 2 | `login`   | `browser`| 400 (6.7s)            | pause before signup-link click         |
| 3 | `signup`  | `browser`| 900 (15s) or MP3 len  | types Ayush's details + submits        |
| 4 | `home`    | `mac`    | 240 (4s)              | arrival dwell                          |

Both VO scripts now exist under `voiceover/scripts/`. User runs
`npm run voiceover` to synthesize the MP3s + alignment sidecars.

## Calc-metadata shared-VO finding

`calc-metadata.resolveSceneData` calls `getAudioDurationInSeconds` per scene.
Three scenes referencing the same MP3 would add its duration **3×** into the
total composition length — not the desired behavior.

**Mitigation chosen:** only the Signup scene references
`scene-signup-ayush.mp3`. Login + Home deliberately omit `voiceoverFile` and
fall back to their local `durationInFrames`. The narration covers all three
beats via the Signup scene's resolved duration (login-pause + home-dwell are
bracketing beats with no speech).

If finer-grained alignment is needed later, two follow-up options exist:
1. Split the narration into `scene-login-pause.mp3` + `scene-signup-ayush.mp3`
   + `scene-home-dwell.mp3`.
2. Add filename-keyed memoization to `loadDuration` so shared MP3s resolve
   once and can be distributed across scenes.

## What's deferred

These must run before the demo can render with real voiceover and real
landing imagery:

### 1. Run landing capture

```bash
npm --prefix landing install
npm --prefix video install
npx --prefix video playwright install chromium
cd video && npm run capture:landing
```

Produces `public/landing/landing-full.png` + `public/landing/hotspots.json`.
Without this, Beat 1 renders a black placeholder where the captured landing
page would appear.

### 2. Generate voiceover

```bash
export ELEVENLABS_API_KEY=...
cd video && npm run voiceover
```

Reads every `voiceover/scripts/*.txt`, synthesizes an MP3, and writes the
alignment sidecar (`*.alignment.json`) next to the MP3 in
`public/voiceover/main/`. `{{MARK}}` tokens in each script are resolved to
absolute character-time offsets at synthesis.

### 3. Populate SFX assets

Drop the 8 MP3 files listed in `public/sfx/README.md` into that directory
(`click-soft.mp3`, `success-chime.mp3`, `whoosh-forward.mp3`, etc.). Without
them, `SfxTrigger` events render silently — the composition still completes
but the timeline SFX events no-op.

### 4. Populate audio bed

Drop a `bed.mp3` per `public/audio/README.md`. Without it, scenes have no
music bed but nothing errors — `AudioBed` detects the missing file.

### 5. Visual review + y-offset tuning

The scroll keyframes in `fixtures/timelines/landing-scroll.ts` (at frames
0 / 800 / 1800 / 2800 / 3800 / 4800) are **plan-stated guesses**. After the
real capture populates `hotspots.json`, scrub through LandingScroll in
`npm start` and adjust each keyframe y-offset to land its section cleanly.

## Architectural trade-offs

Documented so future passes don't re-litigate these decisions.

### Whole-form fade-in instead of per-piece Assemble

Beat 2 screens (`LoginScreen`, `SignupScreen`, `HomeScreen`) use
`useFadeIn` on the form container rather than per-element `Assemble` choreography.

**Why:** the real `LoginForm` / `SignupForm` / `HomePage` are monolithic
React components. Breaking them into piece-by-piece animated slots would
require forking a demo-only variant, doubling the surface to maintain. The
choreography piece lists in `fixtures/choreography/{login,signup,home}.ts`
are preserved for reference and could drive a future fine-grained pass if
visual review calls for it.

### Typing via useTypeIntoInput (not useForm internals)

`useTypeIntoInput` drives the real DOM inputs by setting `.value` via the
React-compatible prototype setter and dispatching a synthetic `input` event.

**Why:** this is React's sanctioned "write from outside React" escape hatch.
The alternative — reaching into the form's `useForm()` hook state — would
hard-couple the video pipeline to react-hook-form's internal API and break
on every library upgrade. With this approach, `PasswordStrength` and
`PasswordMatch` re-render naturally from the value change.

### FeaturesLiveChat is a static replica

`LandingScreen`'s "live chat" overlay is a static replica, not the real
`FeaturesSection` component from the landing page.

**Why:** the real component's dep graph includes client-only React islands
(framer-motion portal mounts, intersection-observer hooks) that don't mount
cleanly inside Remotion's SSR-compatible pipeline without substantial
shimming. A static replica captures the visual beat for Beat 1 and avoids
an unstable mount.

### Scroll y-offsets are placeholder values

`landing-scroll.ts` keyframes were chosen from the plan's section
measurements, not the actual captured PNG. Final values require visual
review against the real capture (see Deferred #5).

## Next follow-up plan (Beats 3–9)

Documented so the next work session has a clear starting point:

- **UCI Student Dropout dataset + Miami retention policy doc** — tweak list
  in `fixtures/dataset/README.md`. Backs the rest of the product-demo
  narrative (upload through experiments).
- **Per-phase mock LLM streams** — scripted token deltas for each of the 7
  phases (Upload → EDA → NL-SQL → Preprocess → Features → Train →
  Experiments → Deploy). Drives the `llmToken` timeline-event kind.
- **Voice cloning** — user records ~30 s of clean speech for the ElevenLabs
  voice model so the generated VO matches the narrator's voice.
- **Music bed selection + color grade** — final `bed.mp3` + a final-render
  LUT pass.

## Verification (as of this commit)

```
npm run typecheck  # tsc --noEmit — clean
npm run lint       # eslint . — clean
npm test           # vitest run — 37 passed / 37 total
```

`npm run build:draft` is intentionally **not** part of this verification
loop — it's too slow for a foundation commit and would block on the
missing `landing-full.png` anyway. Run it as part of final-render prep
after Deferred items #1 and #2 land.
