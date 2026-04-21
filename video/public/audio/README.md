# Music bed

One ambient / minimal track rendered at -24 dBFS under the entire video via the
`AudioBed` primitive (`video/remotion/primitives/AudioBed.tsx`). When VO is
playing, the bed ducks -12 dB with a 12-frame attack and 24-frame release.

## Expected file

`video/public/audio/bed.mp3` — a 5+ minute ambient pad (longer than the final
video length). Loop-safe beginning/end preferred.

## Sourcing options

- **Suno / Udio prompt**: "ambient minimalist synth pad, slow evolving, no
  drums, 120 BPM, 5 minutes, -24 dBFS mastered, loopable"
- **Pixabay Music** (CC0): https://pixabay.com/music/search/ambient%20pad/
- **Epidemic Sound** (subscription; credit in video description)

Not committed to the repo — `.gitignore`d like the MP4 renders. Drop the file
in this directory before rendering the composition.
