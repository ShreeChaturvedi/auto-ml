/**
 * Drives a react-hook-form field from a per-character schedule keyed off
 * Remotion's frame clock. Scenes pass `[{ char, frame }]` and the hook
 * concatenates every entry whose frame has already passed, then pushes the
 * resulting substring into the form via `setValue`.
 *
 * The "typing" illusion comes from useCurrentFrame ticking every frame and
 * the schedule being stable — both pure wrt inputs, so the animation is
 * byte-reproducible across renders.
 */

import { useEffect } from "react";
import type { FieldValues, Path, UseFormSetValue } from "react-hook-form";
import { useCurrentFrame } from "remotion";

export interface TypeScheduleEntry {
  char: string;
  frame: number;
}

export function useFormTyping<T extends FieldValues>(
  setValue: UseFormSetValue<T>,
  field: Path<T>,
  schedule: readonly TypeScheduleEntry[],
): string {
  const frame = useCurrentFrame();
  const typed = schedule
    .filter((entry) => entry.frame <= frame)
    .map((entry) => entry.char)
    .join("");
  useEffect(() => {
    setValue(field, typed as unknown as T[Path<T>], {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [typed, setValue, field]);
  return typed;
}
