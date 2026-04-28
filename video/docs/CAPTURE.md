# Capturing Demo Footage with Open Recorder

This document covers how to produce the product-demo footage (display1.mp4,
display2.mp4, …) that feeds the `demo` scene type.

We use [Open Recorder](https://github.com/imbhargav5/open-recorder) because it
bakes in Linear/Vercel-style cursor polish, auto-zoom on clicks, click
ripples, and motion-blur without any post-production work. It's free, MIT,
and cross-platform.

## 1. Install Open Recorder

1. Visit the [releases page](https://github.com/imbhargav5/open-recorder/releases)
   and download the binary for your OS (`.dmg` on macOS, `.AppImage` /
   `.deb` on Linux, `.exe` on Windows).
2. Install / make executable / move to `/Applications`.
3. Launch once and grant screen-recording + accessibility permissions when
   prompted. (Accessibility is needed so it can hook mouse events.)

## 2. Configure recording settings

Before each session, verify:

| Setting | Value |
| --- | --- |
| Resolution | 1920×1080 (set display to this natively if possible) |
| Frame rate | 60 fps |
| Format | MP4 (H.264) |
| Auto-zoom | Enabled (default) |
| Cursor smoothing | Enabled (default) |
| Click ripples | Enabled |
| Motion blur | Enabled |
| Mic capture | Off (we dub in ElevenLabs VO separately) |

If your display is a non-16:9 ratio, create a 1920×1080 virtual display via
system preferences (macOS: Screen Resolution scaling; Linux: xrandr; Windows:
display scaling) before recording — the demo scene expects 16:9 content.

## 3. Prep the app

Before hitting record, stage a clean state:

1. Launch backend + frontend — `npm run dev` from the monorepo root.
2. Navigate to the target starting screen.
3. Hide notifications, sleep Slack/mail, quit anything distracting.
4. If you want a specific dataset pre-loaded, do it first — the recording
   should capture the experience the narration describes.
5. Zoom the browser to a comfortable level (usually 100 %). 4K displays may
   want 125 % for readability.

## 4. Capture one clip per phase

The product workflow has seven phases. Capture them as separate clips so
each can be a standalone `demo` scene; this gives us freedom to reorder,
retime, and re-record without affecting the rest.

| Clip file | Covers | Suggested chapter label |
| --- | --- | --- |
| `display-01-upload.mp4` | create project, upload CSV | Upload |
| `display-02-eda.mp4` | auto-profile, distributions | Explore |
| `display-03-nl-sql.mp4` | NL→SQL, chart from query | Ask your data |
| `display-04-preprocess.mp4` | impute, drop, cast | Clean |
| `display-05-feature-eng.mp4` | feature builder | Features |
| `display-06-train.mp4` | train + watch curves | Train |
| `display-07-experiments.mp4` | compare runs | Compare |

Recording rhythm per clip:

- Start with the mouse parked off-screen for ~0.5 s.
- Move deliberately — Open Recorder will smooth motion but it can't
  invent intent.
- Pause briefly (~0.5 s) after each click so the ripple reads.
- End with 0.5 s of stillness on the result state.

Aim for 20–45 s per clip — we'll trim in `demo` scene's `durationInFrames` or
`startOffset` if needed.

## 5. Export and drop into `public/main/`

1. Stop recording. Open Recorder will prompt for export settings — confirm
   H.264 / MP4 / 60 fps / 1920×1080.
2. Save to a working folder.
3. Copy/move the file into `public/main/<name>.mp4`. Example:

   ```bash
   cp ~/Videos/open-recorder/2026-04-13-upload.mp4 \
      video/public/main/display-01-upload.mp4
   ```

4. Reference it from a scene entry in `remotion/Root.tsx` (or a scene
   file `config/scene-list.ts` if we add one later):

   ```ts
   { type: "demo", videoFile: "display-01-upload.mp4", voiceoverFile: "scene-upload.mp3", chapter: "Upload" }
   ```

## 6. Preview

```bash
npm run start   # Remotion Studio
```

Scrub to the relevant scene. If the recording doesn't show up, confirm the
filename in the scene entry matches the file in `public/main/` exactly
(case-sensitive).

## 7. Iterate

- Bad take? Re-record just that clip; overwrite the file. The scene picks
  up the new duration automatically (via `calculateMetadata`).
- Recorded too long? Set `startOffset` (seconds) or use
  `durationInFrames` on the scene entry to trim.
- Need to add a callout/arrow? We'll layer those inside the `Demo` scene
  component later (out of scope for capture).

## Troubleshooting

**The video appears with black bars.**
The source isn't 16:9. Re-export at 1920×1080 or adjust source display.

**Mouse cursor is missing.**
Open Recorder relies on accessibility permissions — re-grant them in system
preferences, then restart the app.

**Export is webm / mkv.**
Force MP4/H.264 in the export dialog. Remotion can decode webm but H.264 is
more predictable for final delivery.

**File feels too big (>200 MB for 30 s).**
That's expected at 60 fps 1920×1080. The current Shree `public/main/*.mp4`
release/demo assets are intentionally committed. Keep ad hoc capture scratch
files in `public/captures/` so they stay local/ignored until promoted.
