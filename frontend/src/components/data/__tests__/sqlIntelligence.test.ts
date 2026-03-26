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
  it.each([
    ['employees', 'employees'],
    ['"First Name"', 'First Name'],
    ['"Employee ""Level"""', 'Employee "Level"'],
    ['', ''],
    ['   ', ''],
    ['  employees  ', 'employees']
  ])('normalizeSqlIdentifier(%o) => %o', (input, expected) => {
    expect(normalizeSqlIdentifier(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// sanitizeSuggestionToken
// ---------------------------------------------------------------------------

describe('sanitizeSuggestionToken', () => {
  it.each([
    ['  hello  ', 'hello'],
    ['employees', 'employees'],
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
    [42, null],
    [{}, null]
  ])('sanitizeSuggestionToken(%o) => %o', (input, expected) => {
    expect(sanitizeSuggestionToken(input as unknown)).toBe(expected);
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
  it.each([
    ['SELECT * FROM emp', 'table'],
    ['SELECT * FROM employees', 'table'],
    ['SELECT * FROM t1 JOIN dep', 'table'],
    ['SELECT t1.', 'alias-column'],
    ['SELECT emp.na', 'alias-column'],
    ['SELECT ', 'general'],
    ['WHERE ', 'general'],
    ['', 'general']
  ])('inferSqlSuggestionContext(%o) => %o', (input, expected) => {
    expect(inferSqlSuggestionContext(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// getAliasBeforeDot
// ---------------------------------------------------------------------------

describe('getAliasBeforeDot', () => {
  it.each([
    ['SELECT t1.', 't1'],
    ['SELECT emp.name', 'emp'],
    ['SELECT * FROM employees', null],
    ['', null]
  ])('getAliasBeforeDot(%o) => %o', (input, expected) => {
    expect(getAliasBeforeDot(input)).toBe(expected);
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
  it.each(['SELECT', 'FROM', 'WHERE', 'JOIN', 'GROUP BY'])(
    'includes %s keyword',
    (keyword) => {
      expect(SQL_KEYWORDS).toContain(keyword);
    }
  );
});

describe('SQL_FUNCTIONS', () => {
  it.each(['COUNT', 'SUM', 'AVG', 'COALESCE'])(
    'contains %s aggregate',
    (aggregate) => {
      const labels = SQL_FUNCTIONS.map((f) => f.label);
      expect(labels).toContain(aggregate);
    }
  );

  it('each function has insertText and documentation', () => {
    for (const fn of SQL_FUNCTIONS) {
      expect(fn.insertText).toBeTruthy();
      expect(fn.documentation).toBeTruthy();
    }
  });
});

describe('SQL_SNIPPETS', () => {
  it.each(['SELECT template', 'JOIN template', 'GROUP BY template'])(
    'contains %s',
    (template) => {
      const labels = SQL_SNIPPETS.map((s) => s.label);
      expect(labels).toContain(template);
    }
  );
});
