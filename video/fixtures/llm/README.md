# Mock LLM stream fixtures

This directory holds mock LLM stream fixtures (token streams, tool-call
sequences) consumed by the `MockLLMStream` primitive in Beats 3+.

Empty for now — populated as part of the Beat 3 (EDA chat) follow-up task.

## Expected shape

Each fixture exports a `readonly` array of stream events:

```ts
import type { MockLLMEvent } from "../../remotion/primitives/MockLLMStream";

export const EDA_FIRST_QUESTION: readonly MockLLMEvent[] = [
  { type: "token", text: "Let me ", frame: 0 },
  { type: "token", text: "look at ", frame: 3 },
  { type: "toolCall", name: "run_sql", args: { query: "SELECT ..." }, frame: 18 },
  // ...
] as const;
```

## Authoring

Streams are hand-crafted to match the voiceover tempo in the corresponding
scene. See plan §3 for the list of conversations to mock.
