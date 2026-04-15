/**
 * Frame-keyed typing driver that writes into a REAL react-hook-form-registered
 * DOM input — as opposed to `useFormTyping`, which needs the form's `setValue`.
 *
 * We can't reach inside the real `SignupForm` to grab its `setValue` without
 * forking it (which would violate "render real components"). Instead, we
 * locate the registered input element by CSS selector and push the typed
 * substring onto it via the React-compatible `nativeInputValueSetter` trick
 * so react-hook-form's internal `input` event listener picks it up — exactly
 * as if a human were typing.
 *
 * The hook is a side effect with no rendered output. Mount one instance per
 * field alongside the real form.
 */

import { useEffect } from "react";
import { useCurrentFrame } from "remotion";
import type { TypeScheduleEntry } from "./useFormTyping";

/**
 * React patches the `value` property on HTMLInputElement.prototype at
 * construction time (it stores a reference via its `tracker`). Setting
 * `input.value = "x"` directly doesn't bubble through that tracker, so
 * react-hook-form's `input` listener sees an unchanged tracked value and
 * ignores the event. The documented escape hatch: call the ORIGINAL
 * `HTMLInputElement.prototype.value` setter explicitly, then dispatch a
 * synthetic `input` event. This mirrors what a real keystroke does.
 */
function setReactInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export interface UseTypeIntoInputOptions {
  /** CSS selector resolving to a single HTMLInputElement (e.g. `input[name="email"]`). */
  selector: string;
  /** Per-character schedule keyed off scene-relative frames. */
  schedule: readonly TypeScheduleEntry[];
}

/**
 * Each frame, compute the typed substring from `schedule` (entries whose
 * `frame <= currentFrame`) and push it into the matched input. No-ops if
 * the input hasn't mounted yet — the effect re-runs next frame.
 */
export function useTypeIntoInput({
  selector,
  schedule,
}: UseTypeIntoInputOptions): void {
  const frame = useCurrentFrame();
  const typed = schedule
    .filter((entry) => entry.frame <= frame)
    .map((entry) => entry.char)
    .join("");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const input = document.querySelector<HTMLInputElement>(selector);
    if (!input) return;
    if (input.value === typed) return;
    setReactInputValue(input, typed);
  }, [selector, typed]);
}
