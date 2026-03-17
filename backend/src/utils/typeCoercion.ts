/**
 * Shared type-coercion utilities used across the backend to safely extract
 * typed values from `unknown` inputs (e.g. parsed JSON, LLM tool outputs).
 *
 * All functions return `undefined` when coercion is not possible, so callers
 * can use optional-chaining and the `??` nullish-coalescing operator naturally.
 */

/**
 * Returns the value as a plain object record, or `undefined` when the input
 * is not an object (including arrays, `null`, and primitives).
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/**
 * Returns a trimmed, non-empty string, or `undefined`.
 * Numbers and booleans are coerced via `String()`.
 */
export function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

/**
 * Returns a finite number, or `undefined`.
 * String inputs are parsed if they represent a finite number.
 */
export function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

/**
 * Returns the boolean value as-is, or `undefined` for non-boolean inputs.
 * Unlike `asString`/`asNumber`, this intentionally does not coerce strings
 * or numbers — use the full `coerceBoolean` in `valueCoercion.ts` when
 * string-to-boolean conversion is needed.
 */
export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
}
