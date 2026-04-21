# Sound effects

One-shot audio cues triggered by `SfxTrigger` primitives in scene timelines.

## Expected files

| File                  | Used when                                                     | Target volume |
| --------------------- | ------------------------------------------------------------- | ------------- |
| click-soft.mp3        | SyntheticCursor click events                                  | -18 dBFS      |
| keystroke.mp3         | Each typed character in text fields (not password)            | -22 dBFS      |
| dot-pop.mp3           | Each password bullet appearing                                | -20 dBFS      |
| whoosh-forward.mp3    | Page transitions (landing → login, login → signup, signup → home) | -16 dBFS      |
| whoosh-settle.mp3     | ZoomFrame release / modal settle                              | -18 dBFS      |
| success-chime.mp3     | AuthSubmitButton → success state                              | -14 dBFS      |
| notification-pop.mp3  | Toast / small UI confirmations                                | -18 dBFS      |
| shimmer-glint.mp3     | Hero "agentically" shimmer sweep (Beat 1)                     | -20 dBFS      |

## Sourcing

- **Freesound** (CC0): https://freesound.org/
- **Zapsplat** (free with credit): https://www.zapsplat.com/
- **Generated**: Suno / Bandlab one-shot prompts

Keep each SFX short (< 1.5 s). Normalize before committing.

Not committed to the repo — drop the files in this directory before render.
