export const MISSING_VALUE_TOKENS = new Set([
  'null',
  'na',
  'n/a',
  'nan',
  'none',
  '-',
  '--'
]);

export function isMissingValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return true;
    }
    return MISSING_VALUE_TOKENS.has(trimmed.toLowerCase());
  }

  return false;
}

function normalizeNumericString(value: string): string {
  return value.trim().replace(/,/g, '').replace(/_/g, '');
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    if (isMissingValue(value)) {
      return null;
    }

    const normalized = normalizeNumericString(value);
    if (!normalized) {
      return null;
    }

    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return null;
}

export function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }

  if (typeof value === 'string') {
    if (isMissingValue(value)) {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }

  return null;
}

export function coerceFloat(value: unknown): number | null {
  return parseFiniteNumber(value);
}

export function coerceInteger(value: unknown): number | null {
  const numeric = parseFiniteNumber(value);
  if (numeric === null) {
    return null;
  }
  return Number.isInteger(numeric) ? numeric : null;
}

export function coerceDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'string') {
    if (isMissingValue(value)) {
      return null;
    }

    const trimmed = value.trim();
    if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
      return null;
    }

    const isoLikeDate =
      /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      || /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.test(trimmed)
      || /^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)
      || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)
      || /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(trimmed);

    if (!isoLikeDate) {
      return null;
    }

    const timestamp = Date.parse(trimmed);
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp);
    }
  }

  return null;
}
