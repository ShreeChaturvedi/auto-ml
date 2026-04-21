# Capture Pipeline Playbook

Hard-won lessons from building and debugging the Playwright + Remotion demo capture pipeline. Read this before modifying any capture driver, Remotion scene, or browser chrome component.

---

## Playwright Video Recording

### `deviceScaleFactor: 2` does NOT produce 2x video

Playwright's `recordVideo` captures at **CSS viewport resolution**, not device-pixel resolution. Setting `deviceScaleFactor: 2` with `recordVideo.size: viewport * 2` creates a frame where content fills only the **top-left quadrant** — the remaining 3/4 is gray padding.

```ts
// BROKEN — content fills 1/4 of frame
context = await browser.newContext({
  viewport: { width: 1728, height: 848 },
  recordVideo: { size: { width: 3456, height: 1696 } },
  deviceScaleFactor: 2,
});

// CORRECT — content fills full frame
context = await browser.newContext({
  viewport: { width: 1728, height: 848 },
  recordVideo: { size: { width: 1728, height: 848 } },
  deviceScaleFactor: 1,
});
```

If you need higher fidelity, the only path is CDP `Page.startScreencast` with explicit JPEG quality — Playwright's VP8 encoder has a fixed bitrate ceiling regardless of resolution.

### `page.evaluate()` after a navigation-triggering click crashes

Clicking an `<a href="...">` triggers synchronous navigation that destroys the execution context. Any `page.evaluate()` call after `page.mouse.click()` on a link throws `"Execution context was destroyed"` and crashes the entire capture.

The cursor recorder's `click()` method does `mouse.click()` then `mark()` (which calls `evaluate()`). Wrap the post-click mark in try/catch with a synthetic fallback entry.

### `context.route()` vs `page.route()` for multi-tab mocks

If a driver opens a second tab via `context.newPage()`, only **context-scoped** routes are inherited. `page.route()` only applies to that specific page. Always use `context.route()` when the beat involves multiple tabs.

### Webm recording starts at `newContext()`, not at `goto()`

The webm's t=0 is context creation. Page navigation, font loading, and network settling happen 2-5 seconds later. Use `startOffset` in the Remotion scene config to skip this blank preamble.

---

## GSAP ScrollTrigger in Headless Chromium

### `scrollHeight` is unreliable immediately after `networkidle`

GSAP ScrollTrigger with `pin: true` and `end: '+=600%'` inflates `scrollHeight` by 6x viewport height — but only after ScrollTrigger initializes, which happens lazily after DOM + GSAP load. In headless Chromium, `networkidle` fires before ScrollTrigger runs, so `scrollHeight` reads ~4.8k instead of ~13k.

**Fix:** Wait for the pinned element to exist AND for scrollHeight to exceed a known floor:
```ts
await page.waitForSelector('#how-it-works', { state: 'visible', timeout: 3_000 }).catch(() => {});
await page.waitForFunction(() => document.documentElement.scrollHeight > 6000, { timeout: 3_000 }).catch(() => {});
```

Keep timeouts **short** (3s, not 10s). Long timeouts bloat drive time past the scene's frame budget, causing the scroll-to-bottom to happen after the Remotion scene ends — making it look like the scroll never reaches the footer.

### `scrollHeight` changes mid-drive

GSAP adds pinned space as you scroll into pin regions. Re-measure `scrollHeight` before the final scroll-to-bottom phase, not just at drive start.

### Pin container selectors use CSS module hashes

`[class*="pinContainer"]` works regardless of Vite's hash suffix. But always have 3-4 fallback selectors and **throw on total miss** — a silent fallback (returning a hardcoded pixel value) produces a capture that looks subtly wrong without any error signal.

---

## Remotion Scene Composition

### Scene `durationInFrames` must exceed total webm content time

If your capture produces a 60s webm and the scene is 55s (3300 frames), the last 5s of content is invisible. The scene plays `startOffset` to `startOffset + durationInFrames/fps`. Anything past that boundary is silently trimmed.

**Rule of thumb:** scene duration = expected drive time + pre-drive overhead + 5s safety margin.

### ZoomFrame transform origin must be the region center

When zooming to a specific region (e.g., the URL address bar), `transformOrigin` must be `"${cx}px ${cy}px"` (the region center), NOT `"center center"` (the viewport center).

With viewport-center origin, `scale()` pushes off-center regions away from 960,540. A URL bar at y=116 gets scaled to y=-647, completely above the viewport. The content appears to zoom into empty space while the actual target is invisible.

```ts
// BROKEN — zooms toward viewport center, target flies off-screen
transformOrigin: "center center"

// CORRECT — zoom anchors on the target region
transformOrigin: `${cx}px ${cy}px`
```

### Chrome-dismiss transition timing

The landing scene opens with `chrome: "browser"` (pixel-continuous with UrlIntro) then dismisses the chrome over ~45 frames. The video wrapper expands from the chrome's inner rect to full-bleed via interpolated `top`/`left`/`width`/`height`. The chrome fades via opacity.

The inner content rect is derived from CONTINUITY tokens in `BrowserChrome.tsx`: `{ top: padding + titleBarHeight, left: padding, width: 1920 - 2*padding, height: 1080 - 2*padding - titleBarHeight }`. If these values drift, the dismiss tween shows a visible jump.

---

## Cursor Recording

### Post-process Playwright's VP8 output with ffmpeg VP9 re-encode

Playwright's VP8 encoder is hardcoded at ~0.75-1 Mbps. At 1080p60 that's roughly 0.000006 bits/pixel/frame — far below what's needed for clean output on content with gradients, thin strokes, animations, or fine text. The result is visible mosquito noise, banding, and temporal flicker (inter-frame differences that VP8 can't track cleanly).

**Do not disable page animations to work around this.** Animations are part of the design. The correct fix is to re-encode the webm after capture:

```ts
execFileSync("ffmpeg", [
  "-y", "-i", webmPath,
  "-vf", "hqdn3d=3:2:4:3",       // temporal + spatial denoiser smooths compression artifacts
  "-c:v", "libvpx-vp9",           // VP9 is dramatically more efficient than VP8
  "-crf", "22",                    // visually lossless-ish (lower = more bits)
  "-b:v", "0",                     // VBR mode, CRF controls everything
  "-deadline", "good",
  "-cpu-used", "2",
  "-row-mt", "1",
  tmpOut,
]);
```

This replaces the raw webm in-place. The `hqdn3d` denoiser is critical — without it, VP9 just faithfully reproduces the VP8 artifacts. With it, temporal noise collapses and thin strokes render cleanly.

Tradeoffs: ~30-60s of additional encoding time per beat. File size grows modestly (5 MB → 8 MB for a 60s beat). Animations keep running — only the encoding quality changes.

Higher-quality capture at the source (CDP screencast, higher-DPI viewport tricks) all run into Playwright's internal limitations. The post-process path is the reliable one.

---

### Never use hardcoded viewport coordinates

Hardcoded cursor positions (e.g., `cursor.move(page, 320, 540)`) don't track actual content. After scrolling, elements shift in viewport space. The cursor ends up pointing at blank space or the wrong section.

**Always** use element-relative positions:
```ts
const cardCenter = await centerOf(page, "#feature-chat");
await cursor.move(page, cardCenter.x, cardCenter.y, 6);
```

Fall back to viewport center, not a hardcoded point:
```ts
async function safeCenter(page, selector) {
  try { return await centerOf(page, selector); }
  catch { return { x: 960, y: 540 }; }
}
```

### `cursor.move()` steps parameter affects perceived smoothness

`steps: 20-50` causes Playwright to interpolate mouse positions over 300+ ms, which looks sluggish and erratic on playback. Use `steps: 6-8` for snappy cursor movement. Reserve `steps: 50` only for deliberately cinematic sweeps (e.g., cursor sweep to nav CTA).

---

## Astro Pages (newtab, mock-gmail)

### Selector changes in Astro pages break Playwright drivers

The signup driver references elements by CSS selector (`.gg-search input`, `a.gm-thread`, `a.vmail-cta`). If you rename classes or restructure the Astro markup, the driver silently fails to find elements and crashes. **Always grep for the selector across `video/scripts/capture/`** before renaming.

### `Astro.url.searchParams` works in dev mode

Query parameters like `?shortcuts=1` are correctly parsed server-side. Conditional rendering with `{showShortcuts && (<markup>)}` works in Astro templates. If elements appear in `curl` output but not in Playwright, it's a timing issue, not a rendering issue.

---

## Verification Protocol

### Always extract frames and visually inspect

Code changes to capture drivers or Remotion scenes are meaningless without visual verification. After every capture run:

```bash
# Extract key frames from the webm
ffmpeg -y -ss 5 -i captures/landing.webm -frames:v 1 -update 1 /tmp/frame-5s.png
ffmpeg -y -ss 50 -i captures/landing.webm -frames:v 1 -update 1 /tmp/frame-50s.png
```

Check for: content filling full frame (no quadrant bug), scroll reaching expected content, cursor on meaningful elements, no blank/loading frames at scene boundaries.

### Run the actual capture, not just lint

Lint and unit tests catch syntax errors. They do NOT catch:
- Transform math that pushes content off-screen
- `page.evaluate()` crashes from navigation timing
- Recording resolution mismatches
- Drive time exceeding scene budget
- Selector mismatches between Astro pages and Playwright drivers

The capture pipeline (`npx tsx video/scripts/capture-demo.ts --beat=landing`) is the only real test. Run it. Look at the output.
