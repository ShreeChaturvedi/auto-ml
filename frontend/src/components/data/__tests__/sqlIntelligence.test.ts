import { describe, expect, it } from 'vitest';

import {
  normalizeSqlIdentifier,
  sanitizeSuggestionToken,
  resolveColumnsForTable,
  inferSqlSuggestionContext,
  getAliasBeforeDot,
  buildAliasToTableMap,
  buildSqlMarkers,
  SQL_KEYWORDS,
  SQL_FUNCTIONS,
  SQL_SNIPPETS
} from '../sqlIntelligence';

// ---------------------------------------------------------------------------
// normalizeSqlIdentifier
// ---------------------------------------------------------------------------

describe('normalizeSqlIdentifier', () => {
  it('returns plain identifiers unchanged', () => {
    expect(normalizeSqlIdentifier('employees')).toBe('employees');
  });

  it('strips surrounding double quotes', () => {
    expect(normalizeSqlIdentifier('"First Name"')).toBe('First Name');
  });

  it('unescapes internal doubled double-quotes', () => {
    expect(normalizeSqlIdentifier('"Employee ""Level"""')).toBe('Employee "Level"');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeSqlIdentifier('')).toBe('');
    expect(normalizeSqlIdentifier('   ')).toBe('');
  });

  it('trims leading/trailing whitespace before processing', () => {
    expect(normalizeSqlIdentifier('  employees  ')).toBe('employees');
  });
});

// ---------------------------------------------------------------------------
// sanitizeSuggestionToken
// ---------------------------------------------------------------------------

describe('sanitizeSuggestionToken', () => {
  it('returns trimmed string for non-empty strings', () => {
    expect(sanitizeSuggestionToken('  hello  ')).toBe('hello');
    expect(sanitizeSuggestionToken('employees')).toBe('employees');
  });

  it('returns null for empty strings', () => {
    expect(sanitizeSuggestionToken('')).toBeNull();
    expect(sanitizeSuggestionToken('   ')).toBeNull();
  });

  it('returns null for non-string values', () => {
    expect(sanitizeSuggestionToken(null)).toBeNull();
    expect(sanitizeSuggestionToken(undefined)).toBeNull();
    expect(sanitizeSuggestionToken(42)).toBeNull();
    expect(sanitizeSuggestionToken({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveColumnsForTable
// ---------------------------------------------------------------------------

describe('resolveColumnsForTable', () => {
  const columnsByTable = {
    employees: ['id', 'name', 'salary'],
    '"Order Details"': ['order_id', 'product', 'quantity']
  };

  it('returns columns for an exact match', () => {
    expect(resolveColumnsForTable('employees', columnsByTable)).toEqual(['id', 'name', 'salary']);
  });

  it('returns columns for a case-insensitive match', () => {
    expect(resolveColumnsForTable('EMPLOYEES', columnsByTable)).toEqual(['id', 'name', 'salary']);
  });

  it('resolves quoted table names correctly', () => {
    expect(resolveColumnsForTable('"Order Details"', columnsByTable)).toEqual([
      'order_id',
      'product',
      'quantity'
    ]);
  });

  it('returns empty array when table is not found', () => {
    expect(resolveColumnsForTable('missing_table', columnsByTable)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// inferSqlSuggestionContext
// ---------------------------------------------------------------------------

describe('inferSqlSuggestionContext', () => {
  it('returns "table" after FROM keyword with a partial table name', () => {
    expect(inferSqlSuggestionContext('SELECT * FROM emp')).toBe('table');
    expect(inferSqlSuggestionContext('SELECT * FROM employees')).toBe('table');
  });

  it('returns "table" after JOIN keyword with a partial table name', () => {
    expect(inferSqlSuggestionContext('SELECT * FROM t1 JOIN dep')).toBe('table');
  });

  it('returns "alias-column" when a dot follows an identifier', () => {
    expect(inferSqlSuggestionContext('SELECT t1.')).toBe('alias-column');
    expect(inferSqlSuggestionContext('SELECT emp.na')).toBe('alias-column');
  });

  it('returns "general" for other positions', () => {
    expect(inferSqlSuggestionContext('SELECT ')).toBe('general');
    expect(inferSqlSuggestionContext('WHERE ')).toBe('general');
    expect(inferSqlSuggestionContext('')).toBe('general');
  });
});

// ---------------------------------------------------------------------------
// getAliasBeforeDot
// ---------------------------------------------------------------------------

describe('getAliasBeforeDot', () => {
  it('extracts the alias token before a dot', () => {
    expect(getAliasBeforeDot('SELECT t1.')).toBe('t1');
    expect(getAliasBeforeDot('SELECT emp.name')).toBe('emp');
  });

  it('returns null when there is no dot pattern', () => {
    expect(getAliasBeforeDot('SELECT * FROM employees')).toBeNull();
    expect(getAliasBeforeDot('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildAliasToTableMap
// ---------------------------------------------------------------------------

describe('buildAliasToTableMap', () => {
  it('maps table name to itself when no alias is given', () => {
    const result = buildAliasToTableMap('SELECT * FROM employees', ['employees']);
    expect(result['employees']).toBe('employees');
  });

  it('maps alias to resolved table name', () => {
    const result = buildAliasToTableMap('SELECT e.id FROM employees e', ['employees']);
    expect(result['e']).toBe('employees');
    expect(result['employees']).toBe('employees');
  });

  it('handles AS keyword for aliases', () => {
    const result = buildAliasToTableMap(
      'SELECT emp.id FROM employees AS emp',
      ['employees']
    );
    expect(result['emp']).toBe('employees');
  });

  it('handles multiple tables with joins', () => {
    const result = buildAliasToTableMap(
      'SELECT e.id, d.name FROM employees e JOIN departments d ON e.dept_id = d.id',
      ['employees', 'departments']
    );
    expect(result['e']).toBe('employees');
    expect(result['d']).toBe('departments');
  });

  it('returns empty map for SQL with no FROM/JOIN', () => {
    const result = buildAliasToTableMap('SELECT 1', ['employees']);
    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// buildSqlMarkers
// ---------------------------------------------------------------------------

describe('buildSqlMarkers', () => {
  it('returns no markers for valid SQL', () => {
    expect(buildSqlMarkers('SELECT * FROM employees WHERE id = 1')).toHaveLength(0);
  });

  it('reports unmatched closing parenthesis', () => {
    const markers = buildSqlMarkers('SELECT COUNT(*))');
    expect(markers).toHaveLength(1);
    expect(markers[0].message).toBe('Unmatched closing parenthesis');
  });

  it('reports unclosed opening parenthesis', () => {
    const markers = buildSqlMarkers('SELECT COUNT(');
    expect(markers).toHaveLength(1);
    expect(markers[0].message).toBe('Unclosed opening parenthesis');
  });

  it('reports unclosed single quote', () => {
    const markers = buildSqlMarkers("SELECT * FROM t WHERE name = 'Alice");
    expect(markers.some((m) => m.message === 'Unclosed single quote')).toBe(true);
  });

  it('reports unclosed double quote', () => {
    const markers = buildSqlMarkers('SELECT "First Name FROM t');
    expect(markers.some((m) => m.message === 'Unclosed double quote')).toBe(true);
  });

  it('does not flag escaped single quotes (doubled)', () => {
    expect(buildSqlMarkers("SELECT * FROM t WHERE note = 'it''s fine'")).toHaveLength(0);
  });

  it('does not flag escaped double quotes (doubled)', () => {
    expect(buildSqlMarkers('SELECT "He said ""hello"""')).toHaveLength(0);
  });

  it('ignores unbalanced parens inside string literals', () => {
    expect(buildSqlMarkers("SELECT * FROM t WHERE note = '(unclosed'")).toHaveLength(0);
  });

  it('marks correct line and column numbers', () => {
    const markers = buildSqlMarkers('SELECT *\nFROM employees)');
    expect(markers).toHaveLength(1);
    expect(markers[0].startLineNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Data constants sanity checks
// ---------------------------------------------------------------------------

describe('SQL_KEYWORDS', () => {
  it('includes common DML keywords', () => {
    expect(SQL_KEYWORDS).toContain('SELECT');
    expect(SQL_KEYWORDS).toContain('FROM');
    expect(SQL_KEYWORDS).toContain('WHERE');
    expect(SQL_KEYWORDS).toContain('JOIN');
    expect(SQL_KEYWORDS).toContain('GROUP BY');
  });
});

describe('SQL_FUNCTIONS', () => {
  it('contains expected aggregates', () => {
    const labels = SQL_FUNCTIONS.map((f) => f.label);
    expect(labels).toContain('COUNT');
    expect(labels).toContain('SUM');
    expect(labels).toContain('AVG');
    expect(labels).toContain('COALESCE');
  });

  it('each function has insertText and documentation', () => {
    for (const fn of SQL_FUNCTIONS) {
      expect(fn.insertText).toBeTruthy();
      expect(fn.documentation).toBeTruthy();
    }
  });
});

describe('SQL_SNIPPETS', () => {
  it('contains SELECT, JOIN, and GROUP BY templates', () => {
    const labels = SQL_SNIPPETS.map((s) => s.label);
    expect(labels).toContain('SELECT template');
    expect(labels).toContain('JOIN template');
    expect(labels).toContain('GROUP BY template');
  });
});
