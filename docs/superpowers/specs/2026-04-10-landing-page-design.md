# Agentic AutoML Platform — Landing Page Design Spec

**Date:** 2026-04-10
**Status:** Draft — pending user review
**Owner:** @shree

---

## 1. Overview

This spec defines the design for the public marketing landing page of the Agentic AutoML Platform. The page is a single-page dark-mode experience whose purpose is to convert ML engineers and data scientists (and craft-appreciating reviewers) to click **Sign in to get started** by showcasing the product through real, interactive UI rather than screenshots or abstract marketing art.

The page is inspired by Linear, Factory.ai, Midday, and Obsidian. It borrows Linear's layout discipline and typography cadence, Factory's mono-chrome engineer-built feel, Midday's restraint and grayscale discipline, and Obsidian's scroll-progressed feature lists. It does **not** copy any one of them literally.

### Primary goals

- Demonstrate the product by embedding a partially interactive clone of the real 7-tab workspace as a "half-visible app preview" below the hero.
- Walk visitors through the agentic workflow with a Factory-style pinned scrollytelling sequence across seven numbered phases.
- Showcase three signature leaf components (LLM chat, question planner, notebook) as live, scripted deep-dives.
- Enforce a grayscale discipline so the product's own dynamic accent colors are the only chromatic content on the page.
- Meet WCAG 2.2 AA accessibility requirements and a Lighthouse performance budget of ≥ 90.

### Non-goals

- Pricing page, customer logos, case studies, testimonials, or blog.
- Multi-page site. Only `/` exists.
- Light mode.
- Mobile-first optimization. Desktop (≥ 1024px) is the primary target; tablet and mobile degrade gracefully but are not the focus of craft.
- Auth flows, email capture, or any backend dependency beyond linking to the existing `/login` route in the `frontend/` workspace.

---

## 2. Architecture

### 2.1 Workspace layout

A new `landing/` workspace is added as a sibling of `backend/` and `frontend/` in the monorepo. It declares its own `package.json` and joins the root `workspaces` array.

```
agentic-automl-platform/
├── backend/
├── frontend/
├── landing/                    ← new
│   ├── astro.config.mjs
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── public/
│   │   ├── assets/
│   │   │   └── preview-glow.png          ← Gemini-deferred
│   │   └── fonts/
│   └── src/
│       ├── pages/
│       │   └── index.astro               ← the landing page
│       ├── layouts/
│       │   └── Root.astro                ← <html class="dark">, meta, fonts
│       ├── components/                   ← landing-specific marketing UI
│       │   ├── Nav.astro
│       │   ├── Hero.astro
│       │   ├── HowItWorks.tsx            ← pinned scroll island
│       │   ├── DeepDive.astro
│       │   ├── MetaCardRow.astro
│       │   ├── IntegrationsMarquee.astro
│       │   ├── FooterCta.astro
│       │   └── Footer.astro
│       ├── preview/                      ← interactive app preview
│       │   ├── PreviewShell.tsx
│       │   ├── PreviewContextProvider.tsx
│       │   ├── previewStore.ts
│       │   ├── tabs/
│       │   │   ├── UploadView.tsx
│       │   │   ├── DataViewerView.tsx
│       │   │   ├── PreprocessingView.tsx
│       │   │   ├── FeatureEngineeringView.tsx
│       │   │   ├── TrainingView.tsx
│       │   │   ├── ExperimentsView.tsx
│       │   │   └── DeploymentView.tsx
│       │   └── fixtures/
│       │       ├── project.ts
│       │       ├── plan.ts
│       │       ├── chats.ts
│       │       ├── notebooks.ts
│       │       ├── experiments.ts
│       │       ├── deployment.ts
│       │       └── query.ts
│       ├── islands/                      ← Astro React islands
│       │   ├── PreviewIsland.tsx
│       │   ├── ChatDeepDiveIsland.tsx
│       │   ├── PlanDeepDiveIsland.tsx
│       │   └── NotebookDeepDiveIsland.tsx
│       ├── assets/                       ← Gemini-deferred SVGs
│       │   ├── hero-background.svg
│       │   ├── meta-sandbox.svg
│       │   ├── meta-optimization.svg
│       │   ├── meta-orchestration.svg
│       │   ├── divider-{1,2,3}.svg
│       │   └── icons/
│       ├── lib/
│       │   ├── useCursorOutline.ts
│       │   └── easingTokens.ts
│       ├── styles/
│       │   ├── theme.css                 ← imports frontend's + layers extras
│       │   ├── motion-policy.css
│       │   └── grain.css
│       └── tests/
│           ├── preview-components.test.tsx
│           ├── a11y.test.ts
│           └── contrast.test.ts
```

### 2.2 Framework and stack

- **Astro 5** as the static-site generator + islands architecture
- **React 19** for interactive islands (pinned in the root `package.json` to match `frontend/`)
- **GSAP + ScrollTrigger** loaded dynamically only inside the pinned how-it-works section (~45 KB gzipped); every other motion uses native Web Animations API + IntersectionObserver to keep the base bundle near-zero
- **Tailwind 3** with shared tokens imported from `frontend/src/styles/theme.css`
- **TypeScript strict mode**

`landing/package.json` adds these deps beyond the shared root workspaces:
```jsonc
{
  "dependencies": {
    "astro": "^5",
    "@astrojs/react": "^3",
    "@astrojs/tailwind": "^5",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "gsap": "^3.12",
    "@fontsource-variable/inter": "^5",
    "@fontsource-variable/geist-mono": "^5",
    "simple-icons": "^13"
  },
  "scripts": {
    "dev": "astro dev --port 4321",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run",
    "lint": "eslint ."
  }
}
```

### 2.3 Typography

Two font roles only.

| Role | Face | Weights | Usage |
|---|---|---|---|
| Display + body | Inter Variable | 400 / 510 / 590 | H1, H2, H3, body paragraphs, button labels |
| Mono chrome | Geist Mono Variable | 400 / 510 | Nav links, eyebrows, subheads, numbered step labels, kbd badges, counters, footer small text |

Both fonts are self-hosted via `@fontsource-variable/*` with `font-display: swap`. Negative letter-spacing on headings follows Linear's formula (~`-0.022em` for display, `-0.01em` for small).

The Geist Mono role is the single biggest visual-vocabulary decision on the page. It gives the site a Factory-grade engineer-built feel without copying anything literal.

### 2.4 Color system

Midday-style grayscale discipline. No fixed accent hue. The only color that appears on the page comes from *inside* the app preview (where the real product's dynamic violet theme lives) and inside Recharts visualizations embedded in deep-dive #3.

```css
:root {
  /* Surfaces */
  --bg:          #0A0A0B;   /* page background */
  --surface-0:   #0F1011;   /* elevated card */
  --surface-1:   #131416;   /* inner panel */
  --surface-2:   #1A1B1D;   /* raised element */

  /* Borders */
  --border:        rgba(255,255,255,0.06);
  --border-strong: rgba(255,255,255,0.10);

  /* Text */
  --text:       #F7F8F8;   /* primary — 17.9:1 on --bg */
  --text-muted: #8A8F98;   /* secondary — 7.9:1 on --bg */
  --text-dim:   #62666D;   /* dimmed — 4.6:1 on --bg (used only for small labels) */
}
```

CTAs use a white-to-off-white micro-gradient background (no hue), dark text, with a subtle dark shadow ring.

### 2.5 Motion system

All easing and timing comes from a single token file that every transition, GSAP call, and `element.animate()` call must reference.

```css
:root {
  --ease-out-quart:      cubic-bezier(0.165, 0.84, 0.44, 1);
  --ease-out-expo:       cubic-bezier(0.19,  1,    0.22, 1);
  --ease-in-out-quint:   cubic-bezier(0.86,  0,    0.07, 1);
  --ease-in-out-expo:    cubic-bezier(1,     0,    0,    1);
  --ease-linear-default: cubic-bezier(0.25,  0.46, 0.45, 0.94); /* Linear's house curve */

  --dur-fast: 0.16s;
  --dur-med:  0.35s;
  --dur-slow: 0.60s;
}
```

Motion strategy by zone:

| Zone | Tech | Rationale |
|---|---|---|
| Global reveals | WAAPI + IntersectionObserver | Near-zero JS, matches Linear's actual technique |
| Cursor effects | CSS custom properties via hooks | 60 fps, no React re-renders |
| Pinned how-it-works | GSAP ScrollTrigger (lazy-loaded) | Industry-standard pinning, best reduced-motion fallback |
| Ambient loops (marquees, pulses) | CSS keyframes | No JS, automatically pause via `animation-play-state` |

### 2.6 Reduced-motion policy

A single `landing/src/styles/motion-policy.css` import enforces the fallback behavior for `prefers-reduced-motion: reduce`:

| Effect | Reduced-motion behavior |
|---|---|
| Pulse-dot announcement | Static dot |
| Hero staged WAAPI entry | Instant visible |
| Cursor-outline glow | Static 1px white-alpha border |
| Ambient internal animations | Paused at first frame |
| Pinned how-it-works | Unpinned; renders as vertical stack of 7 numbered `<li>` items with instant-visible content (no crossfades, no reveals, no pinning). Full content parity. |
| IO-triggered reveals | Instant final state |
| Marquees | `animation: none`, frozen at 50% of loop |
| SVG flow pulses | Frozen |

This approach is WCAG 2.2 SC 2.3.3 compliant and matches industry standards at Linear, Vercel, and Stripe.

---

## 3. Information Architecture

Single-page scroll, 8 sections in order:

```
1. Sticky nav                    fixed, backdrop-blur, 72px tall
2. Hero                          H1 + pulse-dot + subhead + single CTA
3. Interactive app preview       full-bleed, half-visible below hero
4. How it works                  Factory-style pinned scroll, 7 phases
5. Feature deep-dives            3 alternating split sections
6. Meta-features                 3-card horizontal row
7. Integrations marquee          dual-direction
8. Footer CTA + Footer           closer + columns + giant sunken wordmark
```

Nav links are in-page anchors: `#product` → app preview, `#features` → feature deep-dives, `#how-it-works` → pinned phases. The "Sign in" button is a real link to `frontend/`'s existing `/login` route.

---

## 4. Section-by-Section Spec

### 4.1 Sticky Nav

- Position: fixed top, `z-index: 100`, full-width with 1280px inner container
- Height: 72px
- Background: `linear-gradient(rgba(10,10,11,0.8), rgba(10,10,11,0.76))`, `backdrop-filter: blur(20px)`
- Border-bottom: `0.8px solid var(--border)`
- Permanent — no shrink, no background-change on scroll (matches Linear)

Layout:
- **Left:** wordmark in Inter 16px weight 590, white
- **Center:** three links in Geist Mono 13px muted: `Product · Features · How it works`. Links use `color var(--text-muted)`, hover → `var(--text)` via the `--dur-fast` transition. Active state when the corresponding section is in the viewport.
- **Right:** `Sign in` button — white-to-off-white gradient background, 32px tall small variant, Inter 14px weight 510

### 4.2 Hero

Intentionally short (target: 186px tall text block) so the app preview dominates the fold.

- Max-width: 880px, centered
- Top padding: ~120px from nav bottom

Content, top to bottom:

**1. Pulse-dot announcement link**
```
● GPT 5.4 class reasoning, now live →
```
- Geist Mono 13px, muted color
- Dot: 6px white circle with a 2s infinite pulse keyframe using `box-shadow: 0 0 0 0 currentColor → 0 0 0 4px transparent`
- Reduced motion: static dot
- Anchor: decorative for now (`href="#product"`)

**2. H1** — mixed-color two-line declarative (Linear cadence)
```html
<h1>
  <span style="color: var(--text)">The fastest way to build production ML models,</span>
  <span style="color: var(--text-muted)">agentically.</span>
</h1>
```
- Inter Variable, 64–72px fluid via `clamp()`, weight 510, line-height 1, letter-spacing `-0.022em`
- Max 2 lines on desktop; wraps naturally on narrower screens

**3. Subhead**
```
Upload a CSV. Describe your goal. Walk away. Come back to
deployed models, ranked experiments, and a notebook that
explains every decision.
```
- Geist Mono 18px, weight 400, color `var(--text-muted)`
- Max-width 620px
- Margin-top 24px

**4. Primary CTA**
```
[ Sign in to get started → ]
```
- Inter 16px weight 510
- 44px tall, 40px horizontal padding
- Background: `linear-gradient(180deg, #F7F8F8, #E6E6E6)`
- Color: `#0A0A0B`
- Subtle dark shadow ring: `0 0 0 1px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)`
- Hover: arrow icon translates 2px right via `transform` on `span`
- Destination: `/login` on the `frontend/` app
- Margin-top: 40px

### 4.3 Interactive App Preview

The heart of the page.

**Container.** Full-bleed, breaks out of the hero's 880px column to 1680px max-width. Top-margin: 64px below hero. Bottom of the section peeks into the fold so the sidebar + top-bar area are visible before scrolling.

**Frame.**
- `background: var(--surface-0)` (`#0F1011`)
- `border: 0.8px solid var(--border-strong)`
- `border-radius: 12px`
- No browser chrome, no macOS traffic lights — borderless
- Aspect ratio: 16:10 (1680 × 1050 on max width)
- Overflow: hidden, isolate stacking context for the outline-glow effect

**Outer glow (image-based, monochrome, subtle).**
- A large absolutely-positioned `<img src="/assets/preview-glow.png">` layer behind the frame
- `inset: -160px` so the halo bleeds far past the frame edges
- `opacity: 0.55` on load, `pointer-events: none`, `z-index: -1`
- PNG is pre-blurred at export time — no runtime `filter: blur()` cost
- Deferred to Gemini (Issue 2). Placeholder: an inline SVG radial gradient while the PNG is unavailable.

**Grain overlay (stronger than the app's).**
- Dedicated inside-frame layer using an inline SVG `feTurbulence` data URI
- Opacity `0.07` (vs the app's ~`0.03`)
- `mix-blend-mode: overlay`
- Pointer-events none
- Applied via a `.landing-grain-strong` class that can be tuned per-element

**Cursor-reactive outline glow.** A new `useCursorOutline()` hook, sibling to the existing `useMetallicBorder`:

```ts
// landing/src/lib/useCursorOutline.ts
interface UseCursorOutlineOptions {
  proximityThreshold?: number;  // default 220
  ringReach?: number;           // default 24 (how far outside the element the glow extends)
}

export function useCursorOutline({
  proximityThreshold = 220,
  ringReach = 24,
}: UseCursorOutlineOptions = {}) {
  // Tracks viewport-space cursor position relative to element
  // Sets CSS custom properties: --outline-x, --outline-y, --outline-opacity
  // Respects prefers-reduced-motion
}
```

CSS technique (in `landing/src/styles/theme.css`):
```css
.cursor-outline {
  --outline-x: 0px;
  --outline-y: 0px;
  --outline-opacity: 0;
  position: relative;
}

.cursor-outline::before {
  content: '';
  position: absolute;
  inset: -24px;            /* extends outside the frame */
  border-radius: inherit;
  padding: 24px;            /* the outline ring thickness */
  pointer-events: none;
  z-index: -1;
  background: radial-gradient(
    circle 480px at var(--outline-x) var(--outline-y),
    hsl(0 0% 100% / calc(var(--outline-opacity) * 0.35)) 0%,
    hsl(0 0% 100% / calc(var(--outline-opacity) * 0.12)) 30%,
    transparent 70%
  );
  filter: blur(14px);

  /* mask-composite trick: carve out the inner rectangle so only the ring shows */
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
}

@media (prefers-reduced-motion: reduce) {
  .cursor-outline::before {
    display: none;
  }
  .cursor-outline {
    outline: 1px solid var(--border);
    outline-offset: 0;
  }
}
```

Peak opacity caps at ~0.35 — subtle, not dramatic. The glow activates when the cursor enters a 220px radius around the frame and fades out over 400ms when it leaves. Monochrome white alpha only — no color. Differences from the existing `metallic-border`:

| Property | metallic-border | cursor-outline (new) |
|---|---|---|
| Thickness | 1px (border strip) | 24px (outline ring outside) |
| Position | on the element's edge | outside the element's bounds |
| Proximity threshold | 90px | 220px |
| Gradient radius | 68px | 480px |
| Blur | 0 | 14px |
| Max opacity | 1.0 | 0.35 |

**Staged WAAPI entry animation** (on first paint, only runs once):
- t=0: outer frame fades in, 400ms, `--ease-out-quart`
- t=400ms: sidebar fades + translates from `-8px` in 500ms
- t=700ms: topbar fades in, 400ms
- t=1000ms: main content area fades + translates from `2px` in 600ms
- t=1400ms: cursor-outline glow becomes interactive

**Initial tab state on load.** Data Viewer is the active tab (not Upload). Reasoning: Data Viewer is visually richest (table + query panel + file tabs + PDF tab), reads "real app" instantly, and doesn't spend the first 5 seconds playing the 3D cube animation. Visitors who click Upload trigger the cube animation fresh.

### 4.4 How It Works (Pinned Scroll Sequence)

**Section intro** (not pinned, 180px top padding, 80px bottom):
```
HOW IT WORKS                              Geist Mono 13px muted
From raw data to a deployed model         Inter 48px white
in seven agent-driven phases.             Inter 48px muted
```
Left-aligned, max-width 1280px centered container.

**Pinned viewport.** GSAP `ScrollTrigger.create({ pin: true, start: 'top top', end: '+=600%' })` pins for 6× viewport-height of scroll.

Inside the pin, a 12-column grid:
- **Cols 1–3 (sticky TOC):** vertical list of 7 numbered phase labels in Geist Mono 14px. Inactive items at `var(--text-dim)`, active at `var(--text)` with a 2px wide vertical accent bar (white, 32px tall) aligned to its left. A 1px horizontal progress bar below the list advances from 0 → 100% across the full pin range, scrubbed by ScrollTrigger's `progress` value.
- **Cols 5–12 (scrubbed scene area):** at any time, exactly one scene is visible. Scenes swap with a crossfade + 8px translate-up on their enter. ScrollTrigger's progress value is broken into 7 equal intervals (`0.000–0.143 = scene 1`, `0.143–0.286 = scene 2`, etc.) and the active scene changes when progress crosses the threshold.

Each scene contains:
- Giant step counter `N / 7` (Geist Mono 13px, muted, top)
- Two-line headline (Inter 56px, line 1 white + line 2 muted)
- Optional single-sentence body (Inter 17px muted)
- **Visual device** (~720×440 mini diorama)

**Numbered codename label + headline + visual device for each scene:**

| # | Code | Scene H2 line 1 (white) | Scene H2 line 2 (muted) | Visual diorama |
|---|---|---|---|---|
| 1 | `1.0 INGEST` | Upload your data. | Let the agent plan the work. | Drag-drop zone with a simulated cursor dropping `customers.csv`; a task-plan card fades in below with 5 agent-proposed bullets |
| 2 | `2.0 EXPLORE` | Ask in English. | Get SQL, answers, and charts. | Query panel mock: NL input `"which customers churned in Q2?"` → streamed SQL → small results table |
| 3 | `3.0 PREPROCESS` | Fix your data without | writing the code. | A notebook cell running `df.fillna(...)`, followed by a `✓ 5,432 missing values filled` output cell |
| 4 | `4.0 ENGINEER` | Derive features automatically. | Keep the ones that matter. | Horizontal bar chart of top-10 feature importances (monochrome bars) |
| 5 | `5.0 TRAIN` | Train models in parallel. | The champion is chosen for you. | Training progress card: 4 stacked models with streaming loss sparklines, star on winner |
| 6 | `6.0 EXPERIMENTS` | Every run, ranked and explained. | Understand why a model wins. | Compact leaderboard with 3 rows + a small SHAP bar visual on the active row |
| 7 | `7.0 DEPLOY` | Ship to an endpoint in one click. | Monitor it in real time. | Deployment status card: green dot + URL + p95 latency + rps + line chart |

**Dioramas are NOT the full app preview.** They're 7 small standalone compositions (~720×440 each) built from small HTML/CSS or a few leaf components (`NotebookCellOutput` for #3, Recharts for #4/5/7, a static TanStack Table for #6). This avoids maintaining a second pixel-perfect app clone.

**Ambient internal animations.** Each diorama has internal loops that run independently of scroll: loss sparklines breathe, leaderboard cursor blinks, deployment latency number increments by small random amounts every 2s. These give the dioramas life without scroll-coupling.

**Accessibility.** All 7 scenes render in the DOM as proper `<ol><li><h3>...</h3><p>...</p><figure>...</figure></li></ol>`. Screen readers get all content in reading order regardless of scroll state. TOC items are keyboard-focusable; pressing one scrolls the page to its corresponding offset. The progress bar has `role="progressbar"` with `aria-valuenow`.

**Reduced motion.** GSAP ScrollTrigger is gated behind `matchMedia('(prefers-reduced-motion: no-preference)').matches`. When reduced motion is preferred, no pin is created, and the 7 scenes render as a simple vertical stack of numbered `<li>` items with instant-visible content.

### 4.5 Feature Deep-Dives

Three full-width sections stacked vertically after how-it-works. Each uses a 12-column grid split 6/6 with alternating sides (L → R → L).

**Shared anatomy per deep-dive:**
- Eyebrow (Geist Mono 13px muted): `01 — CHAT` / `02 — PLAN` / `03 — NOTEBOOK`
- Headline (Inter 48px, two lines, Linear mixed-color cadence)
- Body (Inter 17px muted, max 2 sentences)
- Inline kbd hint (Geist Mono 12px in a `#1C1C1F` raised badge)
- Live component island on the opposite side
- Island is wrapped in the `.cursor-outline` frame from Section 4.3
- Section height: `min-height: 720px`, 180px vertical gutters
- Enter animation: IntersectionObserver + WAAPI `element.animate()`, 500ms, `--ease-out-quart`

**Deep-dive 1 — CHAT (visual left, copy right)**

Visual: a live `<LlmChatComposer>` Astro island mounted in read-only mode. A new `readOnly?: boolean` prop will be added to `frontend/src/components/llm/LlmChatComposer.tsx` (it does not currently exist): when true, it disables the send button action, keeps the composer visually identical, and short-circuits any `onSubmit` callback. This is a zero-risk single-prop addition to the real component so the landing page can reuse it safely. The island plays a scripted micro-sequence on IO-enter:
1. Dynamic placeholder cycles through `"Describe your goal…"`, `"e.g. predict churn"`, `"ask about a column"` (reuses the app's real placeholder animation)
2. A CSS-only cursor sprite glides to the voice-input button and "clicks" it
3. A mock transcription types `"train a churn model and tell me which features matter"` character-by-character using the app's existing transcription animation
4. Send button pulses once
5. A `<ToolIndicator>` strip of streaming tool-call rows fades in: `Read dataset → Profile columns → Propose transforms → Create plan`

Copy:
- Eyebrow: `01 — CHAT`
- H2 line 1 (white): `Talk to your data like a colleague.`
- H2 line 2 (muted): `Voice, text, or keyboard — the agent understands.`
- Body: `Ask in plain English. Watch tool calls stream in real time as the agent reads your tables, proposes transformations, and explains its reasoning.`
- kbd hint: `⌘K to open chat in any tab`

**Deep-dive 2 — PLAN (visual right, copy left)**

Visual: a live `<QuestionCards>` Astro island wired to a 3-step static flow:
1. *What's your target variable?* → radio `is_active / mrr_usd / escalated`
2. *Which modeling task?* → radio `Classification / Regression / Clustering / Time-series`
3. *How much compute?* → radio `Quick (5 min) / Standard (15 min) / Deep (1h)`

"Next" button advances through steps locally. Final "Create plan" button is no-op.

Copy:
- Eyebrow: `02 — PLAN`
- H2 line 1 (white): `Turn intent into a training plan.`
- H2 line 2 (muted): `Radio buttons, not prompt engineering.`
- Body: `Four to five cards constrain the plan before training begins — target column, task type, compute budget, interpretability preference. Each answer narrows the model candidates, CV strategy, and feature pipeline the planner will execute.`
- kbd hint: `Enter to advance`

**Deep-dive 3 — NOTEBOOK (visual left, copy right)**

Visual: two stacked cells inside a minimal notebook frame.
- *Top cell (code):* pre-styled Python cell with a static 8-line snippet using real NovaCraft columns (`df[['mrr_usd', 'avg_session_minutes', 'api_calls']].describe()`) plus a blinking "running" indicator for 1.2s after IO-enter, then the output appears. Rendered via `streamdown` syntax highlighting (not Monaco — see Section 5).
- *Bottom cell (output):* a live `<NotebookCellOutput>` island rendering pre-seeded `RichOutput[]` containing (a) a small static `<table>` with the `describe()` summary stats and (b) a small Recharts histogram of `mrr_usd` distribution (right-skewed). Both are real components from `frontend/src/`, fed from static fixtures.

Copy:
- Eyebrow: `03 — NOTEBOOK`
- H2 line 1 (white): `A real notebook, not a pipeline.`
- H2 line 2 (muted): `Pandas, sklearn, Plotly — every cell editable.`
- Body: `Every preprocessing step, feature transform, and model fit lands as a Jupyter cell with real sklearn and pandas code. Edit a line, re-run the cell, or drop in your own — the kernel is yours.`
- kbd hint: `shift+enter to run`

### 4.6 Meta-Feature Cards

A single section with a 3-card horizontal row below the deep-dives.

**Layout.** 12-column grid, each card spans 4 columns, 24px gap, max-width 1200px, 120px vertical padding.

**Card shape.** 16:10 tall (`~380×480`).
- Background: `var(--surface-0)` (`#0F1011`)
- Border: `0.8px solid var(--border)`
- Border-radius: 12px
- Padding: 32px

**Card anatomy (top to bottom):**
1. Hero SVG area (~60% of card height) — deferred Gemini asset
2. Eyebrow (Geist Mono 13px muted)
3. Title (Inter 24px weight 590, white)
4. Body (Inter 15px muted, max 2 lines)
5. `Learn more →` link (Inter 14px muted, brightens on hover). Links are styled placeholders — they do not navigate anywhere.

**The three cards:**

| # | Eyebrow | Title | Body | Gemini concept |
|---|---|---|---|---|
| 1 | `SANDBOX` | Executes in isolation. | Every agent action runs in a Docker-sandboxed Python runtime with strict resource limits. Your data never leaves your environment. | Isolated glowing cube surrounded by a containing field, with inbound/outbound data flow lines |
| 2 | `OPTIMIZATION` | Finds the optimal model. | Optuna-backed hyperparameter search explores thousands of configurations, pruning weak branches early. You get the winner, not the search. | Scatter constellation with pulses converging toward a bright optimum |
| 3 | `ORCHESTRATION` | Sub-agents in lockstep. | LangGraph routes work between specialized agents for preprocessing, feature engineering, and training. A single loop, many hands. | Directed node graph with pulses flowing between nodes |

**Motion.** Cards fade-up-and-in on IO-enter with a 120ms stagger. SVG internal animations loop after IO-enter; reduced-motion freezes them.

**Responsive.** Below 1024px viewport, cards wrap to a single-column stack.

### 4.7 Integrations Marquee

**Section header** (centered, above the marquees):
```
ECOSYSTEM                              Geist Mono 13px muted
Plug into your data, your models,      Inter 40px white
and your frontier LLM of choice.       Inter 40px muted
```

**Layout.** Full-width section, `padding: 140px 0`. Two stacked rows, 24px vertical gap. Each row is 56px tall and repeats its contents twice for seamless loop.

**Row 1 — Data sources & compute (scrolls left, 50s loop):**
`Postgres · MySQL · SQLite · S3 · GCS · Azure Blob · BigQuery · Snowflake · Databricks · Parquet · CSV · JSON · Feather · DuckDB · Docker · Kubernetes`

**Row 2 — ML frameworks & model providers (scrolls right, 55s loop):**
`PyTorch · scikit-learn · XGBoost · LightGBM · CatBoost · Optuna · Hugging Face · Transformers · LangGraph · LangChain · OpenAI · Anthropic · Google DeepMind · Mistral · Together · Groq`

**Logo chip style:**
- 40px tall pill, `background: var(--surface-0)`, `border: 0.8px solid var(--border)`, padding `8px 20px`, border-radius 20px
- Monochrome icon (16px) + wordmark (Inter 14px muted)
- Icons grayscale-filtered, brighten to white on row hover
- 16px gap between chips

**Motion:**
```css
@keyframes marquee-left  { 0% { transform: translateX(0) }   100% { transform: translateX(-50%) } }
@keyframes marquee-right { 0% { transform: translateX(-50%) } 100% { transform: translateX(0) } }
```
Hover pauses the row: `.marquee-row:hover { animation-play-state: paused }`.

**Edge fades.** Two absolutely-positioned 120px-wide overlay divs on left and right edges with `linear-gradient(to right, var(--bg) 0%, rgba(10,10,11,0.9) 40%, transparent 100%)` and `pointer-events: none`. No `mask-image` (Safari banding).

**Logo sourcing.** `simple-icons` npm package. Brands not in simple-icons get a custom single-path SVG in `landing/src/assets/logos/`, or are deferred to Gemini.

**Accessibility.** The marquee container has `role="region"`, `aria-label="Supported integrations"`, and `aria-roledescription="marquee"`. Each logo has an `aria-label="<brand name>"`. Reduced motion freezes both rows.

### 4.8 Footer CTA

Last hook before the footer. Full-width, center-aligned, `padding: 200px 0`. A subtle monochrome radial vignette SVG sits behind the content.

Content (top to bottom):
```
READY WHEN YOU ARE                       Geist Mono 13px muted

Stop babysitting                         Inter 72px white
your notebooks.                          Inter 72px muted

The agent reads your data, writes the    Geist Mono 18px muted
code, trains the models, and hands you
a reproducible result.

    [ Sign in to get started → ]         large variant, 48px tall
```

### 4.9 Footer

**Layout.** Three-column grid: brand column (cols 1–5) + two link columns (cols 7–9, 10–12). Max-width 1280px, 80px top padding, 48px bottom padding.

**Brand column (left):**
- Wordmark (Inter 16px, weight 590, white)
- Tagline (Inter 13px muted): `Agentic machine learning, from raw CSV to deployed model.`
- Social row: GitLab · X · LinkedIn (16px stroke icons, muted → white on hover)

**Link column 1 — Product:**
```
Features
How it works
Integrations
Changelog (coming soon)
Roadmap (coming soon)
```

**Link column 2 — Resources:**
```
Docs (coming soon)
GitLab repo
Security (coming soon)
Privacy (coming soon)
Contact
```

Every link: `color: var(--text-muted)`, Inter 13px, hover → `var(--text)` via `--dur-fast`. "Coming soon" links are `<a aria-disabled="true" tabindex="-1">` with the suffix label in `var(--text-dim)`.

**Giant sunken wordmark.** A single decorative element at the very bottom of the footer:
```html
<h1 class="footer-wordmark" aria-hidden="true">AGENTIC AUTOML</h1>
```
```css
.footer-wordmark {
  font-family: 'Inter Variable', sans-serif;
  font-size: clamp(160px, 22vw, 320px);
  font-weight: 510;
  letter-spacing: -0.035em;
  color: #141415;                  /* barely darker than --bg, reads as a pressed watermark */
  text-align: center;
  position: relative;
  translate: 0 35%;                /* bottom ~1/3 clips below viewport edge */
  line-height: 0.9;
  white-space: nowrap;
  user-select: none;
}
.footer-overflow-clip { overflow: clip; }  /* on footer parent */
```

**Copyright strip** sits above the giant wordmark as a 1px-top-bordered row:
```
© 2026 Agentic AutoML Platform · All rights reserved.
```
Geist Mono 12px dim, centered.

---

## 5. App Preview Technical Mechanics

### 5.1 Directory layout

See `landing/src/preview/` in Section 2.1.

### 5.2 previewStore

A single landing-local Zustand store that replaces all real app stores. **Zero API calls. Zero WebSocket connections. Zero auth state.**

```ts
// landing/src/preview/previewStore.ts
import { create } from 'zustand';
import { mockProject, mockUser } from './fixtures/project';

export type WorkflowPhase =
  | 'upload' | 'data-viewer' | 'preprocessing'
  | 'feature-engineering' | 'training' | 'experiments' | 'deployment';

interface PreviewStore {
  activeTab: WorkflowPhase;
  activeSubTab: string | null;
  setActiveTab: (tab: WorkflowPhase) => void;
  setActiveSubTab: (sub: string | null) => void;

  // Read-only fake identity
  fakeUser: typeof mockUser;
  fakeProject: typeof mockProject;

  // Per-tab interaction state
  dataViewer: {
    activeFileTabId: string;
    queryMode: 'english' | 'sql';
    queryResult: { english: string; sql: string; rowCount: number };
  };
  preprocessing: { activeCellId: string | null };
  featureEngineering: { activeCellId: string | null };
  training: { activeCellId: string | null; selectedModelId: string | null };
  experiments: { selectedModelId: string | null; sortBy: string; filters: Record<string, unknown> };
  deployment: { activeSubTab: 'overview' | 'playground' | 'api' | 'logs' | 'monitoring' };
}

export const usePreviewStore = create<PreviewStore>((set) => ({
  activeTab: 'data-viewer',  // initial tab per spec
  activeSubTab: null,
  // ... initial values hydrated from fixtures
}));
```

All mutators are pure setters. All initial state comes from `fixtures/`.

### 5.3 PreviewContextProvider

Wraps the entire preview subtree. Replaces:
- `AuthProvider` → `useAuth()` returns `{ user: fakeUser, isAuthenticated: true }`
- Project store → `useProject()` returns `mockProject`
- `useProjectTheme()` → returns violet-themed `projectColorClasses`
- Adds `useIsDemoMode()` which always returns `true`

The app preview's interior is allowed to use the project's violet accent. The landing page outside stays grayscale.

### 5.4 Mock project identity

```ts
// landing/src/preview/fixtures/project.ts
export const mockProject = {
  id: 'prj_demo_novacraft',
  name: 'NovaCraft — Customer Churn',
  color: 'violet' as const,
  icon: 'TrendingDown',
  createdAt: '2026-03-12T10:23:00Z',
  phases: {
    upload:             'completed',
    explore:            'completed',
    preprocess:         'completed',
    featureEngineering: 'completed',
    train:              'completed',
    experiments:        'completed',
    deploy:             'completed',
  },
};

export const mockUser = {
  id: 'usr_demo',
  name: 'Demo',
  email: 'demo@agentic-automl.dev',
  avatarUrl: null,
};
```

All 7 phases are marked `completed` so every tab reads as "finished" — no locked or in-progress states visible in the sidebar.

### 5.5 Per-tab build approach

**Rule: never import a phase panel.** Only import leaf components. Everything else is reconstructed inside `landing/src/preview/tabs/`.

| Tab | Build | Reused from `frontend/src/` | Fixtures |
|---|---|---|---|
| **1. Upload** | Custom view showing completed state: file card for `customers.csv`, a `<QuestionCards>` island pre-loaded with planner questions (completed), embedded `<ComputeAnimation>` island (replays on tab enter) | `ComputeAnimation`, `QuestionCards` | `plan.ts` (5-step agent plan card) |
| **2. Data Viewer** | Custom layout: sidebar file tabs (4 mock files + 1 PDF tab), main panel showing a static TanStack data table, right-side query panel in English-mode completed state. Clicking file tabs swaps the data table. PDF tab mounts `<PdfViewer>` with the NovaCraft PDF. | `PdfViewer`, TanStack Table v8 | `query.ts`, 4 mock file datasets |
| **3. Preprocessing** | Custom split-pane: left = scrollable chat log with `<LlmChatComposer>` at bottom (static state, conversation rendered via `<ToolIndicator>` + `<ToolResultRenderer>`), right = notebook with static code cells + `<NotebookCellOutput>` cells | `LlmChatComposer`, `ToolIndicator`, `ToolResultRenderer`, `NotebookCellOutput` | `chats.preprocessing`, `notebooks.preprocessing` |
| **4. Feature Engineering** | Same pattern as Preprocessing, different content | same | `chats.featureEngineering`, `notebooks.featureEngineering` |
| **5. Training** | Same split-pane + custom-built training progress card and model recommendation card (from scratch, ~200 LOC each since the real ones are tightly coupled) | `LlmChatComposer`, `ToolIndicator`, `NotebookCellOutput` | `chats.training`, `notebooks.training`, training progress snapshot |
| **6. Experiments** | Custom view: leaderboard (TanStack Table), model detail drawer on right, mock "AI report" pane. Clicking a row updates the detail drawer. | none | `experiments.ts` (4 mock ModelRecord objects) |
| **7. Deployment** | Custom view with 5 sub-tabs (Overview / Playground / API / Logs / Monitoring). Sub-tab navigation is real, content is static. Playground input is a no-op. Logs tab shows ~20 static log lines. Monitoring tab shows 3 Recharts line charts. | Recharts | `deployment.ts` |

### 5.6 Data Viewer — explicit query state

Per the original requirements, Data Viewer must show:
- Query builder in English mode, completed state, with both original English and final SQL visible
- SQL result as a tab
- 3–4 other file tabs open + 1 PDF tab

File tabs rendered (active ⬇):
```
[customers.csv] [subscriptions.csv] [SQL: Q2 churn] ⬇  [novacraft_business_context.pdf]
```

When SQL tab is active, main area shows the query result. Query panel (right side) displays:
```
English query: which customers churned in Q2?
─────────────────────────────────
SELECT c.customer_id, c.company_name, c.plan_tier
FROM customers c
LEFT JOIN subscriptions s ON s.customer_id = c.customer_id
WHERE c.is_active = false
  AND s.end_date BETWEEN '2026-04-01' AND '2026-06-30'
ORDER BY c.annual_revenue_usd DESC;
─────────────────────────────────
→ 1,249 rows returned · 0.42s
```

### 5.7 3D cube animation duration reduction

The existing `ComputeAnimation` has these durations hardcoded in `frontend/src/components/upload/computeAnimationSvgStyles.ts` and `frontend/src/lib/animation/flowPulseTokens.ts`:

| Element | Original | Reduced (25% faster) |
|---|---|---|
| Cube rotation | `12s` | `9s` |
| Atomic orbit 1 | `6.4s` | `4.8s` |
| Atomic orbit 2 | `7.2s` | `5.4s` |
| Atomic orbit 3 | `8s` | `6s` |
| Electron spin 1 | `1.25s` | `0.94s` |
| Electron spin 2 | `1.5s` | `1.13s` |
| Electron spin 3 | `1.75s` | `1.31s` |
| Flow particles | `1.5s` | `1.13s` |

**Implementation strategy:** The `ComputeAnimation` component accepts a `durationScale` prop (new, defaults to 1.0) that multiplies all internal durations. The landing page imports `ComputeAnimation` with `durationScale={0.75}`. This keeps the real app unchanged while letting the landing page pass a prop to speed it up. The patch to `frontend/src/components/upload/ComputeAnimation.tsx` and its style module is minimal and part of the landing implementation scope.

### 5.8 Leaf component integration

For each imported EASY/NEEDS-MOCKING component:
1. **Wrap in a landing island** (`landing/src/islands/`) with `client:idle` or `client:visible` Astro directives
2. **Mock any store hooks** inside the island via `PreviewContextProvider`
3. **Guard any API calls** — a one-file patch at `frontend/src/lib/api/client.ts` short-circuits `apiFetch` to throw a `DemoModeError` if `window.__AGENTIC_DEMO_MODE__ === true`. The landing page sets this flag at the top of `index.astro`. Belt-and-suspenders against accidental fetches.

### 5.9 Monaco replacement

For read-only code cells in the preview, use `streamdown` (already in `frontend/` deps, ~40 KB) for syntax highlighting instead of loading Monaco (~2 MB). Visual fidelity: 95%. Edit capability: 0% (the preview is read-only).

### 5.10 Risk mitigation

| Risk | Mitigation |
|---|---|
| Component drift | `landing/src/tests/preview-components.test.tsx` smoke test mounts every imported component with its fixture props |
| Accidental real API calls | `DemoModeError` guard at `apiFetch`; `previewStore` never triggers fetch code paths |
| Bundle size | Each tab view is a separate Astro island with `client:idle` / `client:visible`; initial bundle only includes the Data Viewer tab |
| WebSocket connections | Never imported — only leaf components are used, all of which are WebSocket-free |
| Auth gate | `PreviewContextProvider` provides a fake `useAuth()` that short-circuits any `isAuthenticated` check |

---

## 6. Accessibility

### 6.1 Contrast

All text-on-surface pairs meet WCAG 2.2 AA:

| Pair | Ratio | Level |
|---|---|---|
| `--text` on `--bg` | 18.6 : 1 | AAA |
| `--text-muted` on `--bg` | 6.1 : 1 | AA (body text) |
| `--text-dim` on `--bg` | 5.5 : 1 | AA (body text) |
| `--text` on `--surface-2` | 15.6 : 1 | AAA |
| `--text-muted` on `--surface-2` | 5.3 : 1 | AA (body text) |
| `--text-dim` on `--surface-2` | 4.8 : 1 | AA (body text) |

All three text tokens clear WCAG AA body (≥ 4.5:1) on every surface in the palette. `--text-dim` is reserved for small labels (kbd badges, counters, table headers, chart ticks) where the `--text-muted` → `--text-dim` step preserves hierarchy without sacrificing legibility.

### 6.2 Semantic HTML

- Single `<h1>` on the page (the hero)
- `<header>` for nav, `<main>` for sections 2–7, `<footer>` for section 8
- Each major section is `<section aria-labelledby="section-N-heading">`
- The pinned how-it-works uses `<ol>` for both the TOC and the content
- Decorative elements (giant wordmark, background SVGs) are `aria-hidden="true"`

### 6.3 Keyboard navigation

- Tab order follows visual order everywhere
- Visible focus rings on all interactive elements: `outline: 2px solid var(--text); outline-offset: 2px; border-radius: 4px`
- The app preview exposes a skip-link above it: `Skip interactive preview` → jumps past the preview to the next section
- Inside the preview, tab navigation uses proper ARIA tab widgets: `role="tab"` + `aria-selected` + arrow-key navigation + `Home` / `End` support
- All "coming soon" links are `aria-disabled="true"` and not in the tab order

### 6.4 Screen reader

- Pinned how-it-works renders all 7 scenes in DOM order as `<ol><li>` regardless of scroll state
- Deep-dive component islands are wrapped in `<div role="img" aria-label="..."/>` with descriptive labels (e.g., `"Interactive demo of the chat composer streaming tool calls"`)
- Marquee container: `role="region"` + `aria-label="Supported integrations"` + `aria-roledescription="marquee"`
- Marquee logos: `aria-label="<brand>"`
- Pulse-dot announcement: focusable `<a>` with a descriptive `aria-label`

### 6.5 Focus visibility

Shared `:focus-visible` style used consistently. Never removed, never replaced with color-only affordances.

### 6.6 Automated a11y audit

`@axe-core/playwright` runs in `landing/src/tests/a11y.test.ts` against the built page and asserts zero violations on WCAG 2.2 AA rules. Runs in CI.

### 6.7 Contrast CI gate

`landing/src/tests/contrast.test.ts` programmatically checks every `--text-*` token against `--bg` and `--surface-*` for WCAG AA. Runs in CI.

---

## 7. Gemini Asset Delegation

The 7 visual assets deferred to Gemini 3 Pro. Each has a placeholder in `landing/src/assets/` or `landing/public/assets/` and a corresponding GitLab issue (created in parallel by a background agent; see Section 11).

**Note to the implementation agent:** Do NOT implement these assets. Ship the placeholders. Gemini will overwrite each file in place once the landing page is complete. Your job is to reference the placeholder path in the relevant component.

| # | Asset | File | Placeholder strategy | GitLab issue |
|---|---|---|---|---|
| 1 | Hero background art | `landing/src/assets/hero-background.svg` | Dashed border box labeled `GEMINI · HERO BACKGROUND` via inline SVG | [#309](https://gitlab.csi.miamioh.edu/2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain/-/issues/309) |
| 2 | App preview outer glow PNG | `landing/public/assets/preview-glow.png` | Inline SVG radial gradient served as fallback until the PNG exists | [#310](https://gitlab.csi.miamioh.edu/2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain/-/issues/310) |
| 3 | Sandbox meta-card SVG | `landing/src/assets/meta-sandbox.svg` | Dashed box `GEMINI · SANDBOX` | [#311](https://gitlab.csi.miamioh.edu/2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain/-/issues/311) |
| 4 | Optimization meta-card SVG | `landing/src/assets/meta-optimization.svg` | Dashed box `GEMINI · OPTIMIZATION` | [#312](https://gitlab.csi.miamioh.edu/2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain/-/issues/312) |
| 5 | Orchestration meta-card SVG | `landing/src/assets/meta-orchestration.svg` | Dashed box `GEMINI · ORCHESTRATION` | [#313](https://gitlab.csi.miamioh.edu/2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain/-/issues/313) |
| 6 | Section divider SVGs (3) | `landing/src/assets/divider-{1,2,3}.svg` | Thin 1px hairline | [#314](https://gitlab.csi.miamioh.edu/2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain/-/issues/314) |
| 7 | Feature icon set (8 icons) | `landing/src/assets/icons/*.svg` | `lucide-react` fallbacks: `MessageSquare`, `ListChecks`, `FileCode`, `Box`, `Target`, `GitBranch`, `Database`, `Rocket` | [#315](https://gitlab.csi.miamioh.edu/2026-senior-design-projects/ai-augmented-automl-toolchain/ai-augmented-auto-ml-toolchain/-/issues/315) |

The giant footer wordmark is **not** deferred — it's pure CSS typography and ships in code.

---

## 8. Build and Tooling

### 8.1 Workspace integration

`landing` is added to the root `package.json` workspaces array. The root scripts gain:
- `npm run dev` — runs backend + frontend + landing concurrently
- `npm run build` — builds all three
- `npm run lint` — lints all three
- `npm run test` — runs tests in all three

### 8.2 Shared theme

`landing/src/styles/theme.css` imports `../../../frontend/src/styles/theme.css` and layers landing-specific additions (easing tokens, Geist Mono stack, grain classes) on top.

### 8.3 Tailwind configuration

`landing/tailwind.config.ts` scans:
- `landing/src/**/*.{astro,tsx,ts,js,mjs}`
- Specific paths in `frontend/src/components/**/*.tsx` that are imported by landing

The theme extends from `frontend/tailwind.config.ts` to keep color/spacing/border-radius tokens in sync.

### 8.4 TypeScript

`landing/tsconfig.json` extends `frontend/tsconfig.json` and adds a path alias:
```jsonc
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@frontend/*": ["../frontend/src/*"]
    }
  }
}
```

### 8.5 CI pipeline

A new CI job `landing` runs in parallel with the existing backend/frontend jobs:
```
landing:
  - install (shared workspace)
  - lint
  - test (vitest)
  - build (astro)
  - a11y audit (@axe-core/playwright)
  - Lighthouse CI (performance ≥ 90, a11y = 100, best practices ≥ 95)
```

---

## 9. Testing Strategy

### 9.1 Preview component smoke tests

`landing/src/tests/preview-components.test.tsx` — mounts every imported `frontend/src/` component with its fixture props and asserts it renders without throwing. Catches component drift.

### 9.2 A11y tests

`landing/src/tests/a11y.test.ts` — `@axe-core/playwright` against the built landing page. Asserts zero WCAG 2.2 AA violations.

### 9.3 Contrast tests

`landing/src/tests/contrast.test.ts` — programmatic verification of every `--text-*` token against every surface token.

### 9.4 Lighthouse budget

`landing/lighthouse.config.js`:
- Performance ≥ 90
- Accessibility = 100
- Best Practices ≥ 95
- SEO ≥ 90 (lower priority but measured)

### 9.5 Visual regression

**Skipped for now.** Component smoke tests + a11y + Lighthouse provide adequate coverage. Visual regression can be added later if drift becomes a problem.

---

## 10. Hero Copy Lock-In

Locked, ready to ship:

- **Pulse dot:** `GPT 5.4 class reasoning, now live →`
- **H1 line 1 (white):** `The fastest way to build production ML models,`
- **H1 line 2 (muted):** `agentically.`
- **Subhead:** `Upload a CSV. Describe your goal. Walk away. Come back to deployed models, ranked experiments, and a notebook that explains every decision.`
- **Primary CTA:** `Sign in to get started →` → `/login`

Footer CTA is also locked:
- **Eyebrow:** `READY WHEN YOU ARE`
- **H2 line 1 (white):** `Stop babysitting`
- **H2 line 2 (muted):** `your notebooks.`
- **Body:** `The agent reads your data, writes the code, trains the models, and hands you a reproducible result.`

---

## 11. Status

All open items from earlier drafts have been resolved.

### 11.1 Deep-dive copy — locked

| # | H2 line 1 (white) | H2 line 2 (muted) |
|---|---|---|
| 1 — CHAT | `Talk to your data like a colleague.` | `Voice, text, or keyboard — the agent understands.` |
| 2 — PLAN | `Turn intent into a training plan.` | `Radio buttons, not prompt engineering.` |
| 3 — NOTEBOOK | `A real notebook, not a pipeline.` | `Pandas, sklearn, Plotly — every cell editable.` |

### 11.2 Gemini asset issues — created

GitLab issues #309 through #315 exist with the `design`, `landing-page`, `deferred-to-gemini` labels on the `ai-augmented-auto-ml-toolchain` project. The implementation agent should reference the placeholder files only and leave the actual asset creation to Gemini.

### 11.3 Next step

The spec is ready for user review. After approval, the `superpowers:writing-plans` skill will produce a detailed step-by-step implementation plan.
