# Fixtures

Scene-agnostic data that choreographs the app-demo scenes. Every fixture
is a typed, immutable literal so TypeScript can narrow the exact frame
numbers, bboxes, and payloads a scene will consume.

## Convention

```ts
export const MY_FIXTURE = { /* … */ } as const;
```

`as const` is load-bearing — it's what lets consumers type-check against
the mapped types declared in `types.ts`.

## Layout

```
auth/          AuthUserFixture literals (Ayush, etc.)
timelines/     TimelineFixture per scene — AppTimelineEvent arrays
choreography/  ChoreographyPieceList per assembly + shared MorphSpec specs
hotspots/      JSON schema + generated hotspot bboxes (landing.json etc.)
llm/           Mock LLM token/tool-call streams (Beats 3+)
dataset/       Student-retention CSV + Miami policy MD (Beats 3+; deferred)
```

## Ownership by beat

| Beat | Fixtures populated |
| ---- | ------------------ |
| 1 — Landing scroll | `timelines/landing-scroll.ts`, `choreography/landing.ts`, `hotspots/landing.json` |
| 2 — Login / signup / home | `timelines/signup-ayush.ts`, `choreography/{login,signup,home,morphs}.ts`, `auth/ayush-yadav.ts` (already populated) |
| 3+ — EDA, preprocess, train, experiments | `dataset/*`, `llm/*`, plus additional per-phase timeline + choreography files |

## Consumer pattern

```tsx
import { AYUSH_YADAV } from "../../../fixtures/auth/ayush-yadav";
import { CTA_TO_LOGIN_CARD } from "../../../fixtures/choreography/morphs";

// In the login scene:
<MorphBox {...CTA_TO_LOGIN_CARD} start={ctaExitFrame} />
<SignupForm defaultValues={AYUSH_YADAV} />
```

Because the fixtures are `as const`, TS flags any drift between a fixture's
shape and the primitive's prop type at compile time.
