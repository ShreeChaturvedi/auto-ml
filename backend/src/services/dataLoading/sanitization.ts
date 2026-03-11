/**
 * Sanitization - String and row sanitization for dataset loading
 *
 * Handles NUL-byte removal, surrogate pair validation, and recursive
 * object sanitization so that data is safe for Postgres text/jsonb columns.
 */

export function sanitizeStringValue(input: string): string {
  let output = '';

  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);

    // Postgres text/jsonb cannot store NUL bytes.
    if (code === 0x0000) {
      continue;
    }

    // High surrogate must be followed by a low surrogate.
    if (code >= 0xD800 && code <= 0xDBFF) {
      const nextCode = i + 1 < input.length ? input.charCodeAt(i + 1) : undefined;
      if (nextCode !== undefined && nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
        output += input[i];
        output += input[i + 1];
        i += 1;
      } else {
        output += '\uFFFD';
      }
      continue;
    }

    // Unpaired low surrogate.
    if (code >= 0xDC00 && code <= 0xDFFF) {
      output += '\uFFFD';
      continue;
    }

    output += input[i];
  }

  return output;
}

function sanitizeObjectValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeStringValue(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObjectValue(item));
  }

  if (value instanceof Date || value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
      sanitized[sanitizeStringValue(key)] = sanitizeObjectValue(nestedValue);
    });
    return sanitized;
  }

  return value;
}

export function sanitizeDatasetRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => sanitizeObjectValue(row) as Record<string, unknown>);
}
