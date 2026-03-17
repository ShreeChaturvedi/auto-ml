/**
 * Shared type coercion utilities for safely narrowing `unknown` values.
 *
 * These functions are used throughout the frontend wherever runtime data from
 * API responses, localStorage, or tool outputs must be safely narrowed before
 * use. Centralised here to avoid copy-paste divergence across stores, hooks,
 * and components.
 */

/**
 * Coerces an unknown value to a plain object record.
 * Returns an empty object `{}` for any non-object input (null, primitive,
 * array). Suitable when callers access properties directly without a null
 * guard.
 */
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Coerces an unknown value to a plain object record.
 * Returns `null` for any non-object input (null, primitive, array). Suitable
 * when callers need an explicit null guard before accessing properties.
 */
export function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Coerces an unknown value to a non-empty trimmed string.
 * Returns `undefined` for any non-string, empty, or whitespace-only value.
 */
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Coerces an unknown value to a finite number.
 * Returns `undefined` for non-numbers, NaN, Infinity, and -Infinity.
 */
export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Coerces an unknown value to a boolean.
 * Returns `undefined` for any non-boolean value.
 */
export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Coerces an unknown value to an array of non-empty trimmed strings.
 * Returns `[]` for any non-array input or if the array contains no valid
 * string elements.
 */
export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );
}
